import { Apogee, CaveRow, Tannin, WineColor } from './api-client';
import { TANNIN_LABEL } from './traits';

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

export type ActiveFilterKey = 'color' | 'aromas' | 'vintage' | 'tannin' | 'location' | 'region' | 'drinkSoon' | 'noApogee' | 'includeEmpty';

/** Filtres posés, hors recherche texte et hors tri. `locationLabel` et `regionLabel` : libellés déjà résolus (vides si le filtre est absent). */
export interface ActiveFilterState {
  color: WineColor | ''; colorLabel: string; aromas: string[]; vintage: string; tannin: Tannin | '';
  locationLabel: string; regionLabel: string; apogeeFilter: '' | 'drinkSoon' | 'noApogee'; includeEmpty: boolean;
}

/** Puces récapitulatives des filtres posés, dans l'ordre d'affichage du panneau ; leur nombre est le N de « Filtres actifs (N) ». */
export function activeFilters(f: ActiveFilterState): Array<{ key: ActiveFilterKey; label: string }> {
  const out: Array<{ key: ActiveFilterKey; label: string }> = [];
  if (f.color) out.push({ key: 'color', label: f.colorLabel });
  if (f.aromas.length) out.push({ key: 'aromas', label: `Arômes : ${f.aromas.join(', ')}` });
  if (f.vintage && Number.isFinite(Number(f.vintage))) out.push({ key: 'vintage', label: `Millésime ${Math.trunc(Number(f.vintage))}` });
  if (f.tannin) out.push({ key: 'tannin', label: `Tanin : ${TANNIN_LABEL[f.tannin]}` });
  if (f.locationLabel) out.push({ key: 'location', label: `Emplacement : ${f.locationLabel}` });
  if (f.regionLabel) out.push({ key: 'region', label: f.regionLabel });
  if (f.apogeeFilter === 'drinkSoon') out.push({ key: 'drinkSoon', label: 'À boire en priorité' });
  if (f.apogeeFilter === 'noApogee') out.push({ key: 'noApogee', label: 'Sans apogée' });
  if (f.includeEmpty) out.push({ key: 'includeEmpty', label: 'Vins épuisés' });
  return out;
}
