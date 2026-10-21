import { randomUUID } from 'node:crypto';

export type SuggestionKind = 'CASIER' | 'ETAGERE' | 'AUTRE';
/** Bloc détecté sur la photo : cadre en fractions de l'image [x0, y0, x1, y1], grille de cases. */
export interface RawBlock { kind: SuggestionKind; box: [number, number, number, number]; rows: number; cols: number }
/** Proposition de zone en attente sur un plan. */
export interface PlanSuggestion extends RawBlock { id: string; name: string }

export const GRID_MAX_ROWS = 26;
export const GRID_MAX_COLS = 30;
export const MAX_BLOCKS = 12;

const LABELS: Record<SuggestionKind, string> = { CASIER: 'Casier', ETAGERE: 'Étagère', AUTRE: 'Rangement' };

const isInt = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
const isFraction = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

/** Blocs valides de la réponse (bornes, cadre non dégénéré), 12 au plus ; les autres sont ignorés. */
export function validBlocks(raw: unknown): RawBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: RawBlock[] = [];
  for (const b of raw) {
    if (typeof b !== 'object' || b === null) continue;
    const { kind, box, rows, cols } = b as Record<string, unknown>;
    if (typeof kind !== 'string' || !(kind in LABELS) || !isInt(rows, GRID_MAX_ROWS) || !isInt(cols, GRID_MAX_COLS)) continue;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(isFraction)) continue;
    const [x0, y0, x1, y1] = box as number[];
    if (x0 >= x1 || y0 >= y1) continue;
    blocks.push({ kind: kind as SuggestionKind, box: [x0, y0, x1, y1], rows, cols });
  }
  return blocks.slice(0, MAX_BLOCKS);
}

type Box = [number, number, number, number];

/** Case de Gemini (`box_2d` : [ymin, xmin, ymax, xmax], entiers de 0 à 1000) en fractions [x0, y0, x1, y1] ; invalide : null. */
function cellBox(cell: unknown): Box | null {
  const b = (cell as { box_2d?: unknown } | null)?.box_2d;
  if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === 'number' && v >= 0 && v <= 1000)) return null;
  const [ymin, xmin, ymax, xmax] = (b as number[]).map((v) => v / 1000);
  return xmin < xmax && ymin < ymax ? [xmin, ymin, xmax, ymax] : null;
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Nombre de lignes (ou de colonnes) : centres triés, nouveau groupe dès que
 * l'écart avec la moyenne du groupe courant dépasse la moitié de la taille
 * médiane des cases. Tolère une légère inclinaison ou perspective.
 */
function countGroups(centers: number[], sizes: number[]): number {
  const gap = median(sizes) / 2;
  let groups = 0, sum = 0, n = 0;
  for (const c of [...centers].sort((a, b) => a - b)) {
    if (n === 0 || c - sum / n > gap) { groups++; sum = 0; n = 0; }
    sum += c; n++;
  }
  return groups;
}

/**
 * Meubles détectés case par case (`units`, sortie de Gemini) ramenés à des
 * blocs : cadre = union des cases valides, rangées et colonnes comptées par
 * regroupement des centres. Unité de moins de 2 cases valides ou de type
 * inconnu ignorée. Le reste est validé ensuite par `validBlocks`.
 */
export function unitsToBlocks(units: unknown): RawBlock[] {
  if (!Array.isArray(units)) return [];
  const blocks: RawBlock[] = [];
  for (const u of units) {
    const { kind, cells } = (u ?? {}) as Record<string, unknown>;
    if (typeof kind !== 'string' || !(kind in LABELS) || !Array.isArray(cells)) continue;
    const boxes = cells.map(cellBox).filter((b): b is Box => b !== null);
    if (boxes.length < 2) continue;
    blocks.push({
      kind: kind as SuggestionKind,
      box: [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))],
      rows: Math.min(GRID_MAX_ROWS, countGroups(boxes.map((b) => (b[1] + b[3]) / 2), boxes.map((b) => b[3] - b[1]))),
      cols: Math.min(GRID_MAX_COLS, countGroups(boxes.map((b) => (b[0] + b[2]) / 2), boxes.map((b) => b[2] - b[0]))),
    });
  }
  return blocks;
}

/** A…Z, puis AA, AB… */
const letter = (n: number): string => (n >= 26 ? letter(Math.floor(n / 26) - 1) : '') + String.fromCharCode(65 + (n % 26));

/**
 * Nomme les blocs de gauche à droite (x0, puis y0) : « Casier A », « Étagère B »,
 * « Rangement C »… une lettre par bloc, en sautant toute lettre déjà employée
 * par `takenNames` (noms des zones actives) sous la forme « <Type> <lettre> »,
 * casse ignorée.
 */
export function nameBlocks(blocks: RawBlock[], takenNames: string[]): PlanSuggestion[] {
  const key = (n: string) => n.normalize('NFC').trim().toLowerCase();
  const taken = new Set(takenNames.map(key));
  const used = (l: string) => Object.values(LABELS).some((label) => taken.has(key(`${label} ${l}`)));
  let n = 0;
  return [...blocks]
    .sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1])
    .map((b) => {
      while (used(letter(n))) n++;
      return { ...b, id: randomUUID(), name: `${LABELS[b.kind]} ${letter(n++)}` };
    });
}
