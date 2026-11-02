import { AccordPick, ApogeeStatus } from './api-client';

/** Niveau d'accord avec le plat : le score de l'IA (0 à 100) ramené à trois crans lisibles. */
export type AccordLevel = 3 | 2 | 1;
export const LEVEL_LABEL: Record<AccordLevel, string> = { 3: 'Excellent accord', 2: 'Bon accord', 1: 'Accord correct' };

export function accordLevel(score: number): AccordLevel {
  return score >= 85 ? 3 : score >= 70 ? 2 : 1;
}

/** Moment du vin, d'après son apogée ; sans apogée connue, il se boit comme un vin à point. */
export type Moment = 'JEUNE' | 'A_POINT' | 'VITE' | 'PASSE';
const MOMENT_OF: Record<ApogeeStatus, Moment> = { TROP_JEUNE: 'JEUNE', A_BOIRE: 'A_POINT', A_BOIRE_VITE: 'VITE', PASSEE: 'PASSE' };
export const MOMENTS: Moment[] = ['JEUNE', 'A_POINT', 'VITE', 'PASSE'];
export const MOMENT_SHORT: Record<Moment, string> = { JEUNE: 'Trop jeune', A_POINT: 'À point', VITE: 'À boire vite', PASSE: 'Passé' };

export function momentOf(p: AccordPick): Moment {
  return p.apogee.status ? MOMENT_OF[p.apogee.status] : 'A_POINT';
}

export function momentLabel(p: AccordPick): string {
  const { min, max, status } = p.apogee;
  switch (status) {
    case 'TROP_JEUNE': return `Trop jeune, attendre ${min}`;
    case 'A_BOIRE': return `À son apogée, jusqu’en ${max}`;
    case 'A_BOIRE_VITE': return `À boire vite, fin d’apogée en ${max}`;
    case 'PASSEE': return `Apogée dépassée depuis ${max}, risque de déclin`;
    default: return 'Sans apogée connue';
  }
}

/** Groupes de la liste, dans l'ordre d'affichage ; l'ordre de l'IA est gardé à l'intérieur. */
export const GROUPS: Array<{ title: string; moments: Moment[] }> = [
  { title: 'À ouvrir ce soir', moments: ['A_POINT', 'VITE'] },
  { title: 'À surveiller : apogée dépassée', moments: ['PASSE'] },
  { title: 'Bel accord, mais à garder', moments: ['JEUNE'] },
];

/** Échelle commune des frises : toutes les fenêtres d'apogée et l'année en cours, une année de marge. */
export function timelineScale(picks: AccordPick[], year: number): { from: number; to: number } {
  const years = [year, ...picks.flatMap((p) => [p.apogee.min, p.apogee.max].filter((y): y is number => y != null))];
  return { from: Math.min(...years) - 1, to: Math.max(...years) + 1 };
}

/** Position d'une année sur l'échelle, de 0 à 100. */
export function at(y: number, s: { from: number; to: number }): number {
  return Math.round(((y - s.from) / (s.to - s.from)) * 1000) / 10;
}
