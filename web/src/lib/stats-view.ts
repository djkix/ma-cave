import type { Stats } from './api-client';

/**
 * Bouteilles bues depuis le 1er janvier : les sorties des mois de l'année en
 * cours dans la série sur 12 mois (clés `AAAA-MM`), même définition que la courbe
 * et le rythme de consommation.
 */
export function drunkThisYear(months: Stats['months'], now = new Date()): number {
  const prefix = `${now.getFullYear()}-`;
  return months.filter((m) => m.month.startsWith(prefix)).reduce((n, m) => n + m.out, 0);
}
