import { STATS_TIME_ZONE } from '../stats/stats';

/** Réglages `app_setting` de la pause commune à l'api et au worker. */
export const GEMINI_PAUSE_UNTIL_KEY = 'gemini_pause_until';
export const GEMINI_PAUSE_REASON_KEY = 'gemini_pause_reason';

/** Après un 503 : le modèle est saturé pour quelques minutes. */
export const SATURATION_PAUSE_MS = 5 * 60_000;
/** Après un 429 : le quota de la clé est épuisé, inutile de revenir avant une heure. */
export const QUOTA_PAUSE_MS = 60 * 60_000;

/** Motifs d'attente liés aux quotas : limiteur local (minute, jetons, jour) ou 429 de Google. */
export type QuotaReason = 'QUOTA_MINUTE' | 'QUOTA_TOKENS' | 'QUOTA_JOUR' | 'QUOTA_GOOGLE';
export const QUOTA_REASONS: readonly string[] = ['QUOTA_MINUTE', 'QUOTA_TOKENS', 'QUOTA_JOUR', 'QUOTA_GOOGLE'];

/** Durée et motif de la pause posée après un refus de Google, par statut HTTP (429 : voir `pauseAfter429`). */
export const PAUSE_AFTER_REFUSAL: Record<number, { ms: number; reason: string }> = {
  503: { ms: SATURATION_PAUSE_MS, reason: 'modèle saturé' },
  429: { ms: QUOTA_PAUSE_MS, reason: 'QUOTA_GOOGLE' },
};

/** Google remet ses compteurs journaliers à zéro à minuit, heure du Pacifique. */
export const QUOTA_TIME_ZONE = 'America/Los_Angeles';

const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: STATS_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE });
const pacificDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: QUOTA_TIME_ZONE });
const pacificWall = new Intl.DateTimeFormat('en-US', {
  timeZone: QUOTA_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});

/** Jour du Pacifique « 2026-10-21 » : clé du compteur journalier. */
export function pacificDay(now: Date): string {
  return pacificDayFormat.format(now);
}

/** Heure murale du Pacifique de l'instant `t`, relue comme si c'était de l'UTC. */
function pacificWallAsUtc(t: number): number {
  const p = Object.fromEntries(pacificWall.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/**
 * Prochain minuit du Pacifique (heure d'été comprise). Le décalage est lu à
 * 08:00 UTC du jour visé, soit minuit ou 1 h du matin là-bas : avant le
 * changement d'heure (2 h), donc le décalage de minuit.
 */
export function nextPacificMidnight(now: Date): Date {
  const wall = new Date(pacificWallAsUtc(now.getTime()));
  const target = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
  const probe = target + 8 * 3_600_000;
  return new Date(target - (pacificWallAsUtc(probe) - probe));
}

/** Début de la minute UTC suivante : remise à zéro des compteurs par minute. */
export function nextMinute(now: Date): Date {
  return new Date((Math.floor(now.getTime() / 60_000) + 1) * 60_000);
}

/** « à 14:03 », « aujourd'hui à 09:00 » (quota du jour) ou « demain à 09:00 », heure de Paris. */
function resumeAt(until: Date, now: Date, sameDayWord: boolean): string {
  const hour = parisTime.format(until);
  if (parisDay.format(until) !== parisDay.format(now)) return `demain à ${hour}`;
  return sameDayWord ? `aujourd'hui à ${hour}` : `à ${hour}`;
}

/** Phrase affichée pour une attente de quota ; `limit` : limite réglée (requêtes par minute ou par jour). */
export function quotaMessage(reason: QuotaReason, until: Date, limit: number | null, now = new Date()): string {
  switch (reason) {
    case 'QUOTA_JOUR':
      return `Quota Gemini du jour atteint (${limit} requêtes) : reprise ${resumeAt(until, now, true)}.`;
    case 'QUOTA_MINUTE':
      return `Limite de ${limit} requêtes par minute atteinte : reprise ${resumeAt(until, now, false)}.`;
    case 'QUOTA_TOKENS':
      return `Limite de jetons par minute atteinte : reprise ${resumeAt(until, now, false)}.`;
    default:
      return `Quota Gemini dépassé chez Google : reprise ${resumeAt(until, now, false)}.`;
  }
}

export function pauseMessage(until: Date, reason: string, now = new Date()): string {
  if (reason === 'QUOTA_GOOGLE') return quotaMessage(reason, until, null, now);
  return `Gemini en pause jusqu'à ${parisTime.format(until)} (${reason})`;
}

/** Délai demandé par Google dans un 429 : RetryInfo `"retryDelay": "37s"` ou « Please retry in 37.2s ». */
const RETRY_DELAY = [/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/, /retry in (\d+(?:\.\d+)?)\s*s/i];
/** Quota journalier épuisé chez Google (identifiant `…PerDay…`, ou texte « per day »). */
const DAILY_QUOTA = /PerDay|per day/i;

/** Fin de la pause commune après un 429 : minuit du Pacifique (quota du jour), délai demandé, sinon 1 h. */
export function pauseAfter429(detail: string, now: Date): Date {
  if (DAILY_QUOTA.test(detail)) return nextPacificMidnight(now);
  for (const re of RETRY_DELAY) {
    const m = re.exec(detail);
    if (m) return new Date(now.getTime() + Math.ceil(Number(m[1]) * 1000));
  }
  return new Date(now.getTime() + QUOTA_PAUSE_MS);
}

/**
 * Gemini est en pause commune : aucun appel n'a été envoyé à Google. Toujours
 * passagère (la photo n'est jamais perdue) ; `until` dit quand reprendre.
 */
export class GeminiPausedError extends Error {
  constructor(
    readonly until: Date,
    readonly reason: string,
    message = pauseMessage(until, reason),
  ) {
    super(message);
    this.name = 'GeminiPausedError';
  }
}

/**
 * Refus du limiteur local (voir GeminiQuotaService) : aucun appel envoyé, rien
 * au journal, pas de pause commune. Traitée partout comme une pause : la tâche
 * est reportée jusqu'à `until`. `limit` : limite réglée, citée dans le message.
 */
export class GeminiQuotaError extends GeminiPausedError {
  constructor(
    until: Date,
    reason: Exclude<QuotaReason, 'QUOTA_GOOGLE'>,
    readonly limit: number,
    now = new Date(),
  ) {
    super(until, reason, quotaMessage(reason, until, limit, now));
    this.name = 'GeminiQuotaError';
  }
}

export interface GeminiPause {
  until: Date;
  reason: string;
}

