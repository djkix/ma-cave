import type { Tannin } from './api-client';

/** Liste fermée des arômes, dans l'ordre d'affichage (recopiée de l'api). */
export const AROMAS: readonly string[] = [
  'fruits rouges', 'fruits noirs', 'agrumes', 'fruits blancs', 'fruits exotiques', 'fruits secs', 'noisette', 'floral', 'épicé', 'poivré',
  'vanille', 'boisé', 'toasté', 'beurré', 'miel', 'minéral', 'végétal', 'sous-bois', 'cuir', 'réglisse',
];
export const MAX_AROMAS = 5;
export const TANNIN_LABEL: Record<Tannin, string> = { LEGER: 'léger', MOYEN: 'moyen', PUISSANT: 'puissant' };
