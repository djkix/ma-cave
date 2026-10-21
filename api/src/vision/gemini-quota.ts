import { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { GeminiQuotaError, nextMinute, nextPacificMidnight, pacificDay } from './gemini-pause';

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
const MINUTE_TTL_S = 120;
const DAY_TTL_S = 26 * 3600;

/**
 * Réservation atomique : refus (1 minute, 2 jetons, 3 jour) ou incrément des
 * compteurs de la minute et du jour. Le jour est vérifié d'abord : son attente
 * est la plus longue, inutile de revenir chaque minute jusqu'à minuit.
 */
const RESERVE = `
if tonumber(redis.call('GET', KEYS[3]) or '0') + 1 > tonumber(ARGV[3]) then return 3 end
if tonumber(redis.call('GET', KEYS[1]) or '0') + 1 > tonumber(ARGV[1]) then return 1 end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[2]) then return 2 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ${MINUTE_TTL_S})
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], ${DAY_TTL_S})
return 0`;

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

  /** Avant chaque appel : une place, ou `GeminiQuotaError` avec l'heure de reprise. */
  async reserve(now = new Date(this.clock())): Promise<void> {
    const limits = await this.limits();
    let code: number;
    try {
      code = Number(await this.redis.eval(RESERVE, 3, ...this.keys(now), limits.rpm, limits.tpm, limits.rpd));
    } catch (e) {
      this.log.error(`Limiteur Gemini injoignable, appel envoyé : ${messageOf(e)}`);
      return;
    }
    if (code === 3) throw new GeminiQuotaError(nextPacificMidnight(now), 'QUOTA_JOUR', limits.rpd, now);
    if (code === 1) throw new GeminiQuotaError(nextMinute(now), 'QUOTA_MINUTE', limits.rpm, now);
    if (code === 2) throw new GeminiQuotaError(nextMinute(now), 'QUOTA_TOKENS', limits.tpm, now);
  }

  /** Après l'appel : jetons réellement consommés (entrée + sortie), comptés dans la minute. */
  async addTokens(tokens: number, now = new Date(this.clock())): Promise<void> {
    if (!(tokens > 0)) return;
    const [, key] = this.keys(now);
    try {
      await this.redis.multi().incrby(key, tokens).expire(key, MINUTE_TTL_S).exec();
    } catch (e) {
      this.log.error(`Jetons Gemini non comptés : ${messageOf(e)}`);
    }
  }

  async usage(now = new Date(this.clock())): Promise<GeminiQuotaUsage> {
    const [limits, counts] = await Promise.all([this.limits(), this.redis.mget(...this.keys(now))]);
    const [requests, tokens, day] = counts.map((c) => Number(c ?? 0));
    return { minute: { requests, tokens }, day: { requests: day }, limits, dayResetsAt: nextPacificMidnight(now).toISOString() };
  }

  /** Refus qu'essuierait un appel maintenant (même ordre que la réservation), ou null. */
  async blocked(now = new Date(this.clock())): Promise<GeminiQuotaError | null> {
    const u = await this.usage(now);
    if (u.day.requests >= u.limits.rpd) return new GeminiQuotaError(nextPacificMidnight(now), 'QUOTA_JOUR', u.limits.rpd, now);
    if (u.minute.requests >= u.limits.rpm) return new GeminiQuotaError(nextMinute(now), 'QUOTA_MINUTE', u.limits.rpm, now);
    if (u.minute.tokens >= u.limits.tpm) return new GeminiQuotaError(nextMinute(now), 'QUOTA_TOKENS', u.limits.tpm, now);
    return null;
  }

  /** Requêtes de la minute (UTC), jetons de la minute, requêtes du jour (Pacifique). */
  private keys(now: Date): [string, string, string] {
    const minute = Math.floor(now.getTime() / 60_000);
    return [`${this.prefix}:rpm:${minute}`, `${this.prefix}:tpm:${minute}`, `${this.prefix}:rpd:${pacificDay(now)}`];
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
