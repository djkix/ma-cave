import { Apogee, CaveRow } from './api-client';

/** « 142 bouteilles · 38 références » : somme des quantités, nombre de lignes (singulier jusqu'à 1). */
export function caveSummary(rows: Pick<CaveRow, 'quantity'>[]): { bottles: string; references: string } {
  const n = rows.reduce((s, r) => s + r.quantity, 0);
  return { bottles: `${n} ${n > 1 ? 'bouteilles' : 'bouteille'}`, references: `${rows.length} ${rows.length > 1 ? 'références' : 'référence'}` };
}

export type ApogeeTone = 'ok' | 'soon' | 'young';

/** Teinte et icône de la pastille d'apogée : à point, à boire vite (ou passée), jeune. `null` sans état. */
export function apogeeTone(a: Apogee): { tone: ApogeeTone; icon: string } | null {
  switch (a.status) {
    case 'A_BOIRE': return { tone: 'ok', icon: 'hourglass_bottom' };
    case 'A_BOIRE_VITE': case 'PASSEE': return { tone: 'soon', icon: 'alarm' };
    case 'TROP_JEUNE': return { tone: 'young', icon: 'schedule' };
    default: return null;
  }
}
