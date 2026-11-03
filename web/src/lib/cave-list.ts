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

export type CaveSort = 'nom' | 'apogee' | 'millesime' | 'quantite' | 'note' | 'recent';
export const CAVE_SORTS: Array<{ value: CaveSort; label: string }> = [
  { value: 'nom', label: 'Nom' }, { value: 'apogee', label: 'Apogée' }, { value: 'millesime', label: 'Millésime' },
  { value: 'quantite', label: 'Quantité' }, { value: 'note', label: 'Note' }, { value: 'recent', label: 'Ajouté récemment' },
];

/** Valeur absente (sans apogée, non millésimé, sans note) toujours en fin de liste, quel que soit le sens. */
const last = (v: number | null | undefined, dir: 1 | -1) => (v == null ? Infinity : dir * v);
const KEYS: Record<Exclude<CaveSort, 'nom'>, (r: CaveRow) => number> = {
  // Fin de fenêtre la plus proche d'abord : passés et à boire vite, puis à point, puis trop jeunes.
  apogee: (r) => last(r.apogee?.max, 1),
  millesime: (r) => last(r.vintage, 1),
  quantite: (r) => -r.quantity,
  note: (r) => last(r.rating?.value, -1),
  recent: (r) => last(r.createdAt ? Date.parse(r.createdAt) : null, -1),
};

/** Liste triée ; « nom » garde l'ordre de l'api (domaine, puis millésime), qui départage aussi les égalités. */
export function sortCave<T extends CaveRow>(rows: T[], sort: CaveSort): T[] {
  if (sort === 'nom') return rows;
  const key = KEYS[sort];
  return [...rows].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return ka === kb ? 0 : ka < kb ? -1 : 1;
  });
}
