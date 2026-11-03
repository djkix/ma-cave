import { normalizeLabel } from '../appellations/appellations.service';

/** Liste fermée des arômes, dans l'ordre d'affichage. */
export const AROMAS: readonly string[] = [
  'fruits rouges', 'fruits noirs', 'agrumes', 'fruits blancs', 'fruits exotiques', 'fruits secs', 'noisette', 'floral', 'épicé', 'poivré',
  'vanille', 'boisé', 'toasté', 'beurré', 'miel', 'minéral', 'végétal', 'sous-bois', 'cuir', 'réglisse',
];
/** Liste fermée des régions viticoles de France, dans l'ordre d'affichage. */
export const REGIONS: readonly string[] = [
  'Alsace', 'Beaujolais', 'Bordeaux', 'Bourgogne', 'Champagne', 'Jura', 'Languedoc-Roussillon', 'Loire', 'Provence', 'Rhône', 'Savoie', 'Sud-Ouest',
];
/** Garde la plus longue acceptée, en années. */
const MAX_GUARD = 60;
export const MAX_AROMAS = 5;
/** Cépages retenus par vin, et longueur maximale d'un nom de cépage. */
export const MAX_GRAPES = 6;
export const MAX_GRAPE_LENGTH = 40;
export const TANNINS = ['LEGER', 'MOYEN', 'PUISSANT'] as const;
export type Tannin = (typeof TANNINS)[number];
export type Country = 'FR' | 'AUTRE';

/**
 * Réponse de Gemini inexploitable pour les caractéristiques d'un vin. Le message
 * commence par « Sortie du modèle invalide » : la file ne la rejoue pas.
 */
export class TraitsInvalidOutputError extends Error {
  /** `costCents` : l'appel a abouti et il est facturé même si sa sortie est inexploitable. */
  constructor(message: string, readonly costCents = 0) {
    super(message);
  }
}

/** `{min, max}` entiers (arrondis) avec 0 ≤ min ≤ max ≤ 60, sinon null. */
function parseGuard(raw: unknown): { min: number; max: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { min, max } = raw as { min?: unknown; max?: unknown };
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  const [lo, hi] = [Math.round(min), Math.round(max)];
  return lo >= 0 && lo <= hi && hi <= MAX_GUARD ? { min: lo, max: hi } : null;
}

export interface ParsedTraits {
  tannin: Tannin | null;
  aromas: string[];
  grapes: string[];
  country: Country | null;
  region: string | null;
  guard: { min: number; max: number } | null;
}

/**
 * `{"tanin", "aromes", "cepages", "pays", "region", "garde"}` lu avec tolérance : tanin inconnu → null, arôme
 * hors liste ignoré (doublons écartés, cinq au plus), cépages libres (vides et doublons écartés, six au plus), pays absent → null, région
 * hors liste (ou pays étranger) → null, garde incohérente → null.
 */
export function parseTraitsOutput(raw: unknown): ParsedTraits {
  if (!raw || typeof raw !== 'object') throw new TraitsInvalidOutputError('Sortie du modèle invalide : réponse non objet');
  const { tanin, aromes, cepages, pays, region: regionRaw, garde } = raw as { tanin?: unknown; aromes?: unknown; cepages?: unknown; pays?: unknown; region?: unknown; garde?: unknown };
  const tannin = typeof tanin === 'string' ? (TANNINS.find((t) => t.toLowerCase() === normalizeLabel(tanin)) ?? null) : null;
  const known = new Map(AROMAS.map((a) => [normalizeLabel(a), a]));
  const aromas = new Set<string>();
  if (Array.isArray(aromes)) {
    for (const a of aromes) {
      const canonical = typeof a === 'string' ? known.get(normalizeLabel(a)) : undefined;
      if (canonical) aromas.add(canonical);
    }
  }
  const country: Country | null = typeof pays !== 'string' || !pays.trim() ? null : normalizeLabel(pays) === 'france' ? 'FR' : 'AUTRE';
  const region = country === 'AUTRE' || typeof regionRaw !== 'string' ? null : (REGIONS.find((r) => normalizeLabel(r) === normalizeLabel(regionRaw)) ?? null);
  return { tannin, aromas: [...aromas].slice(0, MAX_AROMAS), grapes: cleanGrapes(Array.isArray(cepages) ? cepages : []), country, region, guard: parseGuard(garde) };
}

/** Cépages saisis ou générés : espaces resserrés, vides, trop longs et doublons (sans casse ni accents) écartés, six au plus. */
export function cleanGrapes(raw: unknown[]): string[] {
  const seen = new Map<string, string>();
  for (const g of raw) {
    const name = typeof g === 'string' ? g.replace(/\s+/g, ' ').trim() : '';
    if (name && name.length <= MAX_GRAPE_LENGTH && !seen.has(normalizeLabel(name))) seen.set(normalizeLabel(name), name);
  }
  return [...seen.values()].slice(0, MAX_GRAPES);
}
