import { randomUUID } from 'node:crypto';

export type SuggestionKind = 'CASIER' | 'ETAGERE' | 'AUTRE';
/**
 * Case repérée sur la photo : cadre en fractions [x0, y0, x1, y1], rangée et
 * colonne (0 = haut, gauche) tirées du voisinage, nom de la case dans la grille
 * de la zone (« B3 ») ; null quand la rangée ou la colonne est indéterminée.
 */
export interface DetectedCell { box: [number, number, number, number]; row: number | null; col: number | null; name: string | null }
/**
 * Bloc détecté sur la photo : cadre en fractions de l'image [x0, y0, x1, y1], grille de cases ;
 * `cellCount` (cases valides repérées) et `cells` (200 au plus) : absents des propositions d'avant la 2.23.
 */
export interface RawBlock { kind: SuggestionKind; box: [number, number, number, number]; rows: number; cols: number; cellCount?: number; cells?: DetectedCell[] }
/** Proposition de zone en attente sur un plan. */
export interface PlanSuggestion extends RawBlock { id: string; name: string }

export const GRID_MAX_ROWS = 26;
export const GRID_MAX_COLS = 30;
export const MAX_BLOCKS = 12;
export const MAX_CELLS = 200;

const LABELS: Record<SuggestionKind, string> = { CASIER: 'Casier', ETAGERE: 'Étagère', AUTRE: 'Rangement' };

const isInt = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
const isFraction = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

/** Blocs valides de la réponse (bornes, cadre non dégénéré), 12 au plus ; les autres sont ignorés. */
export function validBlocks(raw: unknown): RawBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: RawBlock[] = [];
  for (const b of raw) {
    if (typeof b !== 'object' || b === null) continue;
    const { kind, box, rows, cols, cellCount, cells } = b as Record<string, unknown>;
    if (typeof kind !== 'string' || !(kind in LABELS) || !isInt(rows, GRID_MAX_ROWS) || !isInt(cols, GRID_MAX_COLS)) continue;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(isFraction)) continue;
    const [x0, y0, x1, y1] = box as number[];
    if (x0 >= x1 || y0 >= y1) continue;
    // Cases repérées : construites par `unitsToBlocks`, gardées telles quelles.
    const detected = Number.isInteger(cellCount) && Array.isArray(cells) ? { cellCount: cellCount as number, cells: (cells as DetectedCell[]).slice(0, MAX_CELLS) } : {};
    blocks.push({ kind: kind as SuggestionKind, box: [x0, y0, x1, y1], rows, cols, ...detected });
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

const overlap = (a: Box, b: Box, axis: 0 | 1) => Math.max(0, Math.min(a[axis + 2], b[axis + 2]) - Math.max(a[axis], b[axis]));
/** Sur l'axe (0 = x, 1 = y), a et b se chevauchent d'au moins la moitié du plus petit des deux. */
const aligned = (a: Box, b: Box, axis: 0 | 1) => overlap(a, b, axis) >= Math.min(a[axis + 2] - a[axis], b[axis + 2] - b[axis]) / 2;
const center = (b: Box, axis: 0 | 1) => (b[axis] + b[axis + 2]) / 2;

/**
 * Voisin suivant de chaque case le long de l'axe (0 : à droite, dans la même
 * rangée ; 1 : en dessous, dans la même colonne) : case alignée avec elle sur
 * l'autre axe, presque pas sur celui-ci, la plus proche ; à égalité, la mieux
 * alignée. -1 : aucune.
 */
function nextCells(boxes: Box[], axis: 0 | 1): number[] {
  const other = (1 - axis) as 0 | 1;
  return boxes.map((a) => {
    let best = -1;
    boxes.forEach((b, j) => {
      if (center(b, axis) <= center(a, axis) || !aligned(a, b, other) || aligned(a, b, axis)) return;
      const o = best < 0 ? null : boxes[best];
      if (!o || b[axis] < o[axis] || (b[axis] === o[axis] && overlap(a, b, other) > overlap(a, o, other))) best = j;
    });
    return best;
  });
}

/**
 * Lignes (rangées si l'axe est 0, colonnes si 1) : les cases reliées à leur
 * voisin suivant forment une ligne (union-find). Les lignes sont incohérentes
 * si l'une contient deux cases qui se chevauchent le long de son axe (une case
 * large sous deux colonnes relie ces deux colonnes) : `count` vaut alors 0 et
 * `index` null. Sinon `index[i]` : rang de la ligne de la case i, lignes
 * triées par position moyenne (rangées de haut en bas, colonnes de gauche à droite).
 */
function lines(boxes: Box[], axis: 0 | 1): { count: number; index: (number | null)[] } {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  nextCells(boxes, axis).forEach((j, i) => { if (j >= 0) parent[find(i)] = find(j); });
  const groups = new Map<number, number[]>();
  boxes.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const other = (1 - axis) as 0 | 1;
  const coherent = [...groups.values()].every((g) => g.every((i) => g.every((j) => i === j || !aligned(boxes[i], boxes[j], axis))));
  if (!coherent) return { count: 0, index: boxes.map(() => null) };
  const mean = (g: number[]) => g.reduce((s, i) => s + center(boxes[i], other), 0) / g.length;
  const sorted = [...groups.values()].sort((g, h) => mean(g) - mean(h));
  const index: number[] = [];
  sorted.forEach((g, k) => g.forEach((i) => (index[i] = k)));
  return { count: sorted.length, index };
}

/** Plus longue suite de cases voisines le long de l'axe (cases côte à côte si 0, empilées si 1). */
function longestChain(boxes: Box[], axis: 0 | 1): number {
  const next = nextCells(boxes, axis);
  const len: number[] = [];
  const chain = (i: number): number => (len[i] ??= next[i] < 0 ? 1 : 1 + chain(next[i]));
  return Math.max(...boxes.map((_, i) => chain(i)));
}

/**
 * Meubles détectés case par case (`units`, sortie de Gemini) ramenés à des
 * blocs : cadre = union des cases valides, rangées et colonnes comptées par
 * voisinage et non sur des coordonnées globales, pour résister à la
 * perspective (une même tablette peut descendre de plus d'une case d'un bout à
 * l'autre du mur). Chaque case est reliée à sa voisine de droite (chevauchement
 * vertical d'au moins la moitié de la moins haute) et à celle du dessous ;
 * rangées = nombre de lignes de cases reliées de gauche à droite, colonnes =
 * nombre de lignes reliées de haut en bas. Une case oubliée ne coupe pas sa
 * ligne (le voisin suivant est cherché plus loin). Si les lignes d'un axe sont
 * incohérentes (une case haute ou large qui relie deux rangées ou deux
 * colonnes), le compte de cet axe passe au plus grand nombre de cases empilées
 * (rangées) ou côte à côte (colonnes), et les cases n'ont pas de nom.
 * `cellCount` : cases valides ; `cells` : leurs 200 premières, nommées comme
 * la grille de la zone (« A1 », « B3 ») quand rangée et colonne sont connues.
 * Unité de moins de 2 cases valides ou de type inconnu ignorée. Le reste est
 * validé ensuite par `validBlocks`.
 */
export function unitsToBlocks(units: unknown): RawBlock[] {
  if (!Array.isArray(units)) return [];
  const blocks: RawBlock[] = [];
  for (const u of units) {
    const { kind, cells } = (u ?? {}) as Record<string, unknown>;
    if (typeof kind !== 'string' || !(kind in LABELS) || !Array.isArray(cells)) continue;
    const boxes = cells.map(cellBox).filter((b): b is Box => b !== null);
    if (boxes.length < 2) continue;
    const r = lines(boxes, 0), c = lines(boxes, 1);
    const rows = Math.min(GRID_MAX_ROWS, r.count || longestChain(boxes, 1));
    const cols = Math.min(GRID_MAX_COLS, c.count || longestChain(boxes, 0));
    blocks.push({
      kind: kind as SuggestionKind,
      box: [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))],
      rows, cols, cellCount: boxes.length,
      cells: boxes.slice(0, MAX_CELLS).map((box, i) => {
        const row = r.index[i], col = c.index[i];
        const known = row !== null && col !== null && row < rows && col < cols;
        return { box, row, col, name: known ? `${String.fromCharCode(65 + row)}${col + 1}` : null };
      }),
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
