import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { GeminiQuotaError, nextPacificMidnight, pacificDay } from './gemini-pause';

/**
 * Réglages `app_setting` des limites de débit Gemini (niveau sans frais de
 * Google, qui compte modèle par modèle) : `gemini_rpm:<modèle>`… ; les clés
 * sans modèle, réglages d'avant la bascule, servent de repli à tous.
 */
export const GEMINI_RPM_KEY = 'gemini_rpm';
export const GEMINI_TPM_KEY = 'gemini_tpm';
export const GEMINI_RPD_KEY = 'gemini_rpd';
const limitKeys = (model: string) => [`${GEMINI_RPM_KEY}:${model}`, `${GEMINI_TPM_KEY}:${model}`, `${GEMINI_RPD_KEY}:${model}`] as const;

export interface GeminiLimits {
  rpm: number;
  tpm: number;
  rpd: number;
}

export const DEFAULT_LIMITS: GeminiLimits = { rpm: 5, tpm: 250_000, rpd: 20 };

/** Requêtes du jour d'un modèle de la liste de bascule ; `exhaustedUntil` : quota du jour atteint, jusqu'à quand. */
export interface GeminiModelDayUsage {
  model: string;
  requests: number;
  rpd: number;
  exhaustedUntil: string | null;
}

export interface GeminiQuotaUsage {
  /** Modèle dont les compteurs et limites sont rendus (le modèle choisi). */
  model: string;
  minute: { requests: number; tokens: number };
  day: { requests: number };
  limits: GeminiLimits;
  /** Prochain minuit du Pacifique (ISO). */
  dayResetsAt: string;
  /** Liste de bascule, dans l'ordre d'emploi (le modèle choisi en premier). */
  models: GeminiModelDayUsage[];
}

/** Comme le modèle : l'api et le worker relisent les limites au plus tard 30 s après un changement. */
const LIMITS_TTL_MS = 30_000;
/** Google compte les requêtes et les jetons par minute sur une fenêtre glissante de 60 s. */
const WINDOW_MS = 60_000;
/** Reprise une seconde après la sortie de fenêtre : jamais juste avant. */
const MARGIN_MS = 1000;
const WINDOW_TTL_S = 120;
const DAY_TTL_S = 26 * 3600;

/**
 * Réservation atomique sur 60 s glissantes, pour un modèle. KEYS : requêtes
 * (ensemble trié, score = instant), jetons (ensemble trié, membre
 * « id:jetons »), requêtes du jour du Pacifique, marque « épuisé » (429
 * journalier de Google, voir `markExhausted`). ARGV : maintenant (ms), rpm, tpm, rpd, identifiant, essai
 * à blanc (1 : rien n'est écrit). Rend {0} (place prise), {3} (jour), ou
 * {1|2, instant} : la place se libère quand l'entrée de cet instant sort de la
 * fenêtre (requêtes : la plus ancienne ; jetons : celle qui ramène sous le
 * plafond). Le jour est vérifié d'abord : son attente est la plus longue.
 */
const RESERVE = `
local now = tonumber(ARGV[1])
local from = now - ${WINDOW_MS}
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', from)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', from)
if redis.call('EXISTS', KEYS[4]) == 1 then return {3} end
if tonumber(redis.call('GET', KEYS[3]) or '0') + 1 > tonumber(ARGV[4]) then return {3} end
if redis.call('ZCARD', KEYS[1]) + 1 > tonumber(ARGV[2]) then
  return {1, tonumber(redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')[2])}
end
local entries = redis.call('ZRANGE', KEYS[2], 0, -1, 'WITHSCORES')
local sum = 0
for i = 1, #entries, 2 do sum = sum + tonumber(string.match(entries[i], ':(%d+)$')) end
local tpm = tonumber(ARGV[3])
if sum >= tpm then
  for i = 1, #entries, 2 do
    sum = sum - tonumber(string.match(entries[i], ':(%d+)$'))
    if sum < tpm then return {2, tonumber(entries[i + 1])} end
  end
end
if ARGV[6] == '1' then return {0} end
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('EXPIRE', KEYS[1], ${WINDOW_TTL_S})
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], ${DAY_TTL_S})
return {0}`;

interface Deps {
  prefix?: string;
  log?: { error(message: string): void };
  clock?: () => number;
}

/**
 * Limiteur de débit commun à l'api et au worker (compteurs Redis partagés),
 * modèle par modèle comme Google : chaque appel Gemini réserve sa place avant
 * de partir (voir GeminiVisionProvider.call). Premier arrivé, premier servi. Comme le journal,
 * il ne bloque jamais un appel par panne : Redis injoignable, l'appel part.
 */
export class GeminiQuotaService {
  private readonly cached = new Map<string, { value: GeminiLimits; at: number }>();
  private readonly prefix: string;
  private readonly log: { error(message: string): void };
  private readonly clock: () => number;

  constructor(
    private readonly prisma: Pick<PrismaClient, 'appSetting'>,
    private readonly redis: Redis,
    deps: Deps = {},
  ) {
    this.prefix = deps.prefix ?? 'gemini-quota';
    this.log = deps.log ?? console;
    this.clock = deps.clock ?? Date.now;
  }

  /** Limites du modèle : réglage du modèle, sinon réglage commun, sinon défaut. */
  async limits(model: string): Promise<GeminiLimits> {
    const now = this.clock();
    const cached = this.cached.get(model);
    if (cached && now - cached.at < LIMITS_TTL_MS) return cached.value;
    const own = limitKeys(model);
    const common = [GEMINI_RPM_KEY, GEMINI_TPM_KEY, GEMINI_RPD_KEY] as const;
    try {
      const rows = await this.prisma.appSetting.findMany({ where: { key: { in: [...own, ...common] } } });
      // Valeur absente ou illisible : le réglage suivant.
      const read = (i: number, fallback: number) => {
        for (const key of [own[i], common[i]]) {
          const n = Number(rows.find((r) => r.key === key)?.value);
          if (Number.isInteger(n) && n >= 1) return n;
        }
        return fallback;
      };
      const value = { rpm: read(0, DEFAULT_LIMITS.rpm), tpm: read(1, DEFAULT_LIMITS.tpm), rpd: read(2, DEFAULT_LIMITS.rpd) };
      this.cached.set(model, { value, at: now });
      return value;
    } catch (e) {
      this.log.error(`Limites Gemini illisibles, ${cached ? 'dernières connues' : 'limites par défaut'} employées : ${messageOf(e)}`);
      return cached?.value ?? DEFAULT_LIMITS;
    }
  }

  /** Limites d'un modèle ; entiers ≥ 1, validés par l'appelant (dto). */
  async setLimits(model: string, limits: GeminiLimits): Promise<GeminiLimits> {
    const [rpm, tpm, rpd] = limitKeys(model);
    for (const [key, value] of [[rpm, limits.rpm], [tpm, limits.tpm], [rpd, limits.rpd]] as const) {
      await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
    }
    this.cached.set(model, { value: { ...limits }, at: this.clock() });
    return limits;
  }

  /** Avant chaque appel : une place pour ce modèle, ou `GeminiQuotaError` avec l'heure de reprise. Redis injoignable : l'appel part. */
  async reserve(model: string, now = new Date(this.clock())): Promise<void> {
    let refusal: GeminiQuotaError | null;
    try {
      refusal = await this.check(model, now, false);
    } catch (e) {
      this.log.error(`Limiteur Gemini injoignable, appel envoyé : ${messageOf(e)}`);
      return;
    }
    if (refusal) throw refusal;
  }

  /**
   * Refus qu'essuierait un appel maintenant, sans rien réserver, en suivant la
   * bascule : le premier modèle dont le quota du jour n'est pas atteint décide
   * (null ou son refus à la minute) ; tous épuisés : le refus du jour du
   * premier. Redis injoignable : null (journalisé).
   */
  async blocked(models: string[], now = new Date(this.clock())): Promise<GeminiQuotaError | null> {
    let day: GeminiQuotaError | null = null;
    try {
      for (const model of models) {
        const refusal = await this.check(model, now, true);
        if (refusal?.reason !== 'QUOTA_JOUR') return refusal;
        day ??= refusal;
      }
    } catch (e) {
      this.log.error(`Limiteur Gemini illisible : ${messageOf(e)}`);
      return null;
    }
    return day;
  }

  /** 429 journalier de Google : le modèle est refusé jusqu'au prochain minuit du Pacifique (api et worker). Redis injoignable : journalisé. */
  async markExhausted(model: string, now = new Date(this.clock())): Promise<void> {
    try {
      await this.redis.set(this.keys(model, now)[3], '1', 'PX', Math.max(1, nextPacificMidnight(now).getTime() - now.getTime()));
    } catch (e) {
      this.log.error(`Modèle Gemini ${model} non marqué épuisé : ${messageOf(e)}`);
    }
  }

  private async check(model: string, now: Date, dryRun: boolean): Promise<GeminiQuotaError | null> {
    const limits = await this.limits(model);
    const [code, at] = (await this.redis.eval(RESERVE, 4, ...this.keys(model, now), now.getTime(), limits.rpm, limits.tpm, limits.rpd, randomUUID(), dryRun ? 1 : 0)) as number[];
    if (code === 3) return new GeminiQuotaError(nextPacificMidnight(now), 'QUOTA_JOUR', limits.rpd, now);
    const until = new Date(at + WINDOW_MS + MARGIN_MS);
    if (code === 1) return new GeminiQuotaError(until, 'QUOTA_MINUTE', limits.rpm, now);
    if (code === 2) return new GeminiQuotaError(until, 'QUOTA_TOKENS', limits.tpm, now);
    return null;
  }

  /** Après l'appel : jetons réellement consommés (entrée + sortie), comptés sur 60 s glissantes à partir de la réponse. */
  async addTokens(model: string, tokens: number, now = new Date(this.clock())): Promise<void> {
    if (!(tokens > 0)) return;
    const [, key] = this.keys(model, now);
    try {
      await this.redis.multi().zadd(key, now.getTime(), `${randomUUID()}:${Math.round(tokens)}`).expire(key, WINDOW_TTL_S).exec();
    } catch (e) {
      this.log.error(`Jetons Gemini non comptés : ${messageOf(e)}`);
    }
  }

  /**
   * Utilisation des 60 dernières secondes et du jour de `models[0]` (le modèle
   * choisi), et requêtes du jour de chaque modèle de la liste de bascule ;
   * Redis injoignable : compteurs à zéro (journalisé).
   */
  async usage(models: string[], now = new Date(this.clock())): Promise<GeminiQuotaUsage> {
    const [model] = models;
    const from = `(${now.getTime() - WINDOW_MS}`;
    const resetsAt = nextPacificMidnight(now).toISOString();
    const all = await Promise.all(models.map(async (m) => ({ m, limits: await this.limits(m), keys: this.keys(m, now) })));
    let minute = { requests: 0, tokens: 0 };
    let days = all.map(({ m, limits }) => ({ model: m, requests: 0, rpd: limits.rpd, exhaustedUntil: null as string | null }));
    try {
      const [requestsKey, tokensKey] = all[0].keys;
      const [requests, entries] = await Promise.all([this.redis.zcount(requestsKey, from, '+inf'), this.redis.zrangebyscore(tokensKey, from, '+inf')]);
      minute = { requests, tokens: entries.reduce((sum, e) => sum + Number(e.split(':').pop()), 0) };
      days = await Promise.all(
        all.map(async ({ m, limits, keys }) => {
          const [day, marked] = await Promise.all([this.redis.get(keys[2]), this.redis.exists(keys[3])]);
          const requests = Number(day ?? 0);
          return { model: m, requests, rpd: limits.rpd, exhaustedUntil: marked || requests >= limits.rpd ? resetsAt : null };
        }),
      );
    } catch (e) {
      this.log.error(`Compteurs Gemini illisibles : ${messageOf(e)}`);
    }
    return { model, minute, day: { requests: days[0].requests }, limits: all[0].limits, dayResetsAt: resetsAt, models: days };
  }

  /** Requêtes et jetons des 60 dernières secondes, requêtes du jour (Pacifique), marque « épuisé » : par modèle. */
  private keys(model: string, now: Date): [string, string, string, string] {
    const p = `${this.prefix}:${model}`;
    return [`${p}:rpm`, `${p}:tpm`, `${p}:rpd:${pacificDay(now)}`, `${p}:epuise`];
  }
  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
