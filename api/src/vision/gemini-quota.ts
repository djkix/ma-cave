import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { GeminiQuotaError, nextPacificMidnight, pacificDay } from './gemini-pause';

/** Réglages `app_setting` des limites de débit Gemini (niveau sans frais de Google). */
export const GEMINI_RPM_KEY = 'gemini_rpm';
export const GEMINI_TPM_KEY = 'gemini_tpm';
export const GEMINI_RPD_KEY = 'gemini_rpd';

export interface GeminiLimits {
  rpm: number;
  tpm: number;
  rpd: number;
}

export const DEFAULT_LIMITS: GeminiLimits = { rpm: 5, tpm: 250_000, rpd: 20 };

export interface GeminiQuotaUsage {
  minute: { requests: number; tokens: number };
  day: { requests: number };
  limits: GeminiLimits;
  /** Prochain minuit du Pacifique (ISO). */
  dayResetsAt: string;
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
 * Réservation atomique sur 60 s glissantes. KEYS : requêtes (ensemble trié,
 * score = instant), jetons (ensemble trié, membre « id:jetons »), requêtes du
 * jour du Pacifique. ARGV : maintenant (ms), rpm, tpm, rpd, identifiant, essai
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
 * Limiteur de débit commun à l'api et au worker (compteurs Redis partagés) :
 * chaque appel Gemini réserve sa place avant de partir (voir
 * GeminiVisionProvider.call). Premier arrivé, premier servi. Comme le journal,
 * il ne bloque jamais un appel par panne : Redis injoignable, l'appel part.
 */
export class GeminiQuotaService {
  private cached: { value: GeminiLimits; at: number } | null = null;
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

  async limits(): Promise<GeminiLimits> {
    const now = this.clock();
    if (this.cached && now - this.cached.at < LIMITS_TTL_MS) return this.cached.value;
    try {
      const rows = await this.prisma.appSetting.findMany({ where: { key: { in: [GEMINI_RPM_KEY, GEMINI_TPM_KEY, GEMINI_RPD_KEY] } } });
      // Valeur absente ou illisible : la limite par défaut.
      const read = (key: string, fallback: number) => {
        const n = Number(rows.find((r) => r.key === key)?.value);
        return Number.isInteger(n) && n >= 1 ? n : fallback;
      };
      const value = { rpm: read(GEMINI_RPM_KEY, DEFAULT_LIMITS.rpm), tpm: read(GEMINI_TPM_KEY, DEFAULT_LIMITS.tpm), rpd: read(GEMINI_RPD_KEY, DEFAULT_LIMITS.rpd) };
      this.cached = { value, at: now };
      return value;
    } catch (e) {
      this.log.error(`Limites Gemini illisibles, ${this.cached ? 'dernières connues' : 'limites par défaut'} employées : ${messageOf(e)}`);
      return this.cached?.value ?? DEFAULT_LIMITS;
    }
  }

  /** Entiers ≥ 1, validés par l'appelant (dto). */
  async setLimits(limits: GeminiLimits): Promise<GeminiLimits> {
    for (const [key, value] of [[GEMINI_RPM_KEY, limits.rpm], [GEMINI_TPM_KEY, limits.tpm], [GEMINI_RPD_KEY, limits.rpd]] as const) {
      await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
    }
    this.cached = { value: { ...limits }, at: this.clock() };
    return limits;
  }

  /** Avant chaque appel : une place, ou `GeminiQuotaError` avec l'heure de reprise. Redis injoignable : l'appel part. */
  async reserve(now = new Date(this.clock())): Promise<void> {
    let refusal: GeminiQuotaError | null;
    try {
      refusal = await this.check(now, false);
    } catch (e) {
      this.log.error(`Limiteur Gemini injoignable, appel envoyé : ${messageOf(e)}`);
      return;
    }
    if (refusal) throw refusal;
  }

  /** Refus qu'essuierait un appel maintenant, sans rien réserver ; Redis injoignable : null (journalisé). */
  async blocked(now = new Date(this.clock())): Promise<GeminiQuotaError | null> {
    try {
      return await this.check(now, true);
    } catch (e) {
      this.log.error(`Limiteur Gemini illisible : ${messageOf(e)}`);
      return null;
    }
  }

  private async check(now: Date, dryRun: boolean): Promise<GeminiQuotaError | null> {
    const limits = await this.limits();
    const [code, at] = (await this.redis.eval(RESERVE, 3, ...this.keys(now), now.getTime(), limits.rpm, limits.tpm, limits.rpd, randomUUID(), dryRun ? 1 : 0)) as number[];
    if (code === 3) return new GeminiQuotaError(nextPacificMidnight(now), 'QUOTA_JOUR', limits.rpd, now);
    const until = new Date(at + WINDOW_MS + MARGIN_MS);
    if (code === 1) return new GeminiQuotaError(until, 'QUOTA_MINUTE', limits.rpm, now);
    if (code === 2) return new GeminiQuotaError(until, 'QUOTA_TOKENS', limits.tpm, now);
    return null;
  }

  /** Après l'appel : jetons réellement consommés (entrée + sortie), comptés sur 60 s glissantes à partir de la réponse. */
  async addTokens(tokens: number, now = new Date(this.clock())): Promise<void> {
    if (!(tokens > 0)) return;
    const [, key] = this.keys(now);
    try {
      await this.redis.multi().zadd(key, now.getTime(), `${randomUUID()}:${Math.round(tokens)}`).expire(key, WINDOW_TTL_S).exec();
    } catch (e) {
      this.log.error(`Jetons Gemini non comptés : ${messageOf(e)}`);
    }
  }

  /** Utilisation des 60 dernières secondes et du jour ; Redis injoignable : compteurs à zéro (journalisé). */
  async usage(now = new Date(this.clock())): Promise<GeminiQuotaUsage> {
    const limits = await this.limits();
    const [requestsKey, tokensKey, dayKey] = this.keys(now);
    const from = `(${now.getTime() - WINDOW_MS}`;
    let counts = { requests: 0, tokens: 0, day: 0 };
    try {
      const [requests, entries, day] = await Promise.all([
        this.redis.zcount(requestsKey, from, '+inf'),
        this.redis.zrangebyscore(tokensKey, from, '+inf'),
        this.redis.get(dayKey),
      ]);
      counts = { requests, tokens: entries.reduce((sum, e) => sum + Number(e.split(':').pop()), 0), day: Number(day ?? 0) };
    } catch (e) {
      this.log.error(`Compteurs Gemini illisibles : ${messageOf(e)}`);
    }
    return { minute: { requests: counts.requests, tokens: counts.tokens }, day: { requests: counts.day }, limits, dayResetsAt: nextPacificMidnight(now).toISOString() };
  }

  /** Requêtes et jetons des 60 dernières secondes, requêtes du jour (Pacifique). */
  private keys(now: Date): [string, string, string] {
    return [`${this.prefix}:rpm`, `${this.prefix}:tpm`, `${this.prefix}:rpd:${pacificDay(now)}`];
  }
  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
