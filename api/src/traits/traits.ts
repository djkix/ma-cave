import { normalizeLabel } from '../appellations/appellations.service';

/** Liste fermée des arômes, dans l'ordre d'affichage. */
export const AROMAS: readonly string[] = [
  'fruits rouges', 'fruits noirs', 'agrumes', 'fruits blancs', 'fruits exotiques', 'fruits secs', 'noisette', 'floral', 'épicé', 'poivré',
  'vanille', 'boisé', 'toasté', 'beurré', 'miel', 'minéral', 'végétal', 'sous-bois', 'cuir', 'réglisse',
];
export const MAX_AROMAS = 5;
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

/**
 * `{"tanin", "aromes", "pays"}` lu avec tolérance : tanin inconnu → null, arôme
 * hors liste ignoré (doublons écartés, cinq au plus), pays absent → null.
 */
export function parseTraitsOutput(raw: unknown): { tannin: Tannin | null; aromas: string[]; country: Country | null } {
  if (!raw || typeof raw !== 'object') throw new TraitsInvalidOutputError('Sortie du modèle invalide : réponse non objet');
  const { tanin, aromes, pays } = raw as { tanin?: unknown; aromes?: unknown; pays?: unknown };
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
  return { tannin, aromas: [...aromas].slice(0, MAX_AROMAS), country };
}
