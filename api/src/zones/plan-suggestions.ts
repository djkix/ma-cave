import { randomUUID } from 'node:crypto';

export type SuggestionKind = 'CASIER' | 'ETAGERE' | 'AUTRE';
/**
 * Case repérée sur la photo : cadre en fractions [x0, y0, x1, y1], rangée et
 * colonne (0 = haut, gauche) tirées du voisinage, code de la case dans la grille
 * de la proposition (« C15 », donné par `nameBlocks`) ; null quand la rangée ou
 * la colonne est indéterminée ou hors de la grille, ou sans lettre.
 */
export interface DetectedCell { box: [number, number, number, number]; row: number | null; col: number | null; name: string | null }
/**
 * Bloc détecté sur la photo : cadre en fractions de l'image [x0, y0, x1, y1], grille de cases ;
 * `cellCount` (cases valides repérées) et `cells` (200 au plus) : absents des propositions d'avant la 2.23.
 */
export interface RawBlock { kind: SuggestionKind; box: [number, number, number, number]; rows: number; cols: number; cellCount?: number; cells?: DetectedCell[] }
/**
 * Proposition de zone en attente sur un plan. `cellPrefix` : lettre des codes de
 * ses cases (null au-delà de Z), absente des propositions d'avant la 2.27.
 */
export interface PlanSuggestion extends RawBlock { id: string; name: string; cellPrefix?: string | null }

export const GRID_MAX_ROWS = 26;
export const GRID_MAX_COLS = 30;
export const MAX_BLOCKS = 12;
export const MAX_CELLS = 200;

/** Code d'une case : `<lettre><n>`, rangée par rangée (rangée `row`, colonne `col`, à partir de 0 → n = row × cols + col + 1). */
export const cellCode = (prefix: string, row: number, col: number, cols: number): string => `${prefix}${row * cols + col + 1}`;

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
    // Cases repérées (construites par `unitsToBlocks`) : celles dont le cadre est valide, 200 au plus.
    const okBox = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(isFraction) && v[0] < v[2] && v[1] < v[3];
    const detected = Number.isInteger(cellCount) && Array.isArray(cells)
      ? { cellCount: cellCount as number, cells: (cells as DetectedCell[]).filter((c) => okBox(c?.box)).slice(0, MAX_CELLS) } : {};
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

/** Part de b alignée avec a sur l'axe, rapportée au plus petit des deux (1 : l'un contient l'autre). */
const ratio = (a: Box, b: Box, axis: 0 | 1) => overlap(a, b, axis) / Math.min(a[axis + 2] - a[axis], b[axis + 2] - b[axis]);

/**
 * Liens entre voisines le long de l'axe (0 : à droite, dans la même rangée ;
 * 1 : en dessous, dans la même colonne). Candidates d'une case : alignées avec
 * elle sur l'autre axe, presque pas sur celui-ci, à moins de leurs deux
 * tailles l'une de l'autre (une ou deux cases oubliées entre elles au plus),
 * de la plus proche à la plus lointaine (à égalité, la mieux alignée, puis la
 * plus haute ou à gauche : une case haute de deux rangées rejoint celle du
 * haut). Une case n'a qu'une précédente : quand deux cases visent la même, la
 * plus proche (puis la mieux alignée) la garde et l'autre passe à sa candidate
 * suivante (appariement stable). Ainsi une case oubliée ne fait pas viser à sa
 * voisine une case d'une autre rangée, déjà prise par la bonne.
 * `next[i]` : voisine suivante de la case i, -1 si aucune. `spans` : une case
 * est la plus proche candidate de deux cases côte à côte (une case large sous
 * deux colonnes) : les lignes de cet axe ne décrivent pas une grille.
 */
function links(boxes: Box[], axis: 0 | 1): { next: number[]; spans: boolean } {
  const other = (1 - axis) as 0 | 1;
  const candidates = boxes.map((a) => boxes.map((_, j) => j)
    .filter((j) => center(boxes[j], axis) > center(a, axis) && aligned(a, boxes[j], other) && !aligned(a, boxes[j], axis)
      && boxes[j][axis] - a[axis + 2] <= a[axis + 2] - a[axis] + boxes[j][axis + 2] - boxes[j][axis])
    .sort((i, j) => boxes[i][axis] - boxes[j][axis] || ratio(a, boxes[j], other) - ratio(a, boxes[i], other) || center(boxes[i], other) - center(boxes[j], other)));
  const spans = boxes.some((_, i) => boxes.some((_, k) => k > i && candidates[i][0] !== undefined && candidates[i][0] === candidates[k][0]
    && aligned(boxes[i], boxes[k], axis) && !aligned(boxes[i], boxes[k], other)));
  // Préférée par b : la précédente la plus proche (un quart de b près), puis la mieux alignée. Sur un mur très incliné, une
  // case du premier plan d'une rangée basse peut viser, loin vers le fond, une case de la rangée du dessus : la vraie voisine la garde.
  const gap = (a: Box, b: Box) => b[axis] - a[axis + 2];
  const closer = (a: Box, rival: Box, b: Box) => {
    const d = gap(a, b) - gap(rival, b), tolerance = (b[axis + 2] - b[axis]) / 4;
    return d < -tolerance || (Math.abs(d) <= tolerance && ratio(a, b, other) > ratio(rival, b, other));
  };
  const next = boxes.map(() => -1), prev = boxes.map(() => -1), tried = boxes.map(() => 0);
  const queue = boxes.map((_, i) => i);
  while (queue.length) {
    const i = queue.pop()!;
    while (tried[i] < candidates[i].length) {
      const j = candidates[i][tried[i]++], rival = prev[j];
      if (rival >= 0 && !closer(boxes[i], boxes[rival], boxes[j])) continue;
      if (rival >= 0) { next[rival] = -1; queue.push(rival); }
      prev[j] = i; next[i] = j;
      break;
    }
  }
  return { next, spans };
}

/**
 * Lignes (rangées si l'axe est 0, colonnes si 1) : cases reliées par `next`
 * (union-find), ordonnées par voisinage sur l'autre axe (`across` : une
 * rangée vient avant celle où ses cases ont leur voisine du dessous ; position
 * moyenne seulement pour départager), pour qu'une rangée partielle, loin de
 * sa place moyenne sur un mur pris de biais, garde son rang. Incohérentes
 * (`coherent` faux) si une ligne contient deux cases qui se chevauchent le
 * long de son axe, si `spans`, ou s'il y a plus de lignes que de cases dans la
 * plus longue suite de l'autre axe ; `count` est alors cette plus longue suite
 * (le plus de cases empilées pour les rangées, côte à côte pour les colonnes).
 */
function lines(boxes: Box[], axis: 0 | 1, own: { next: number[]; spans: boolean }, across: number[]): { groups: number[][]; coherent: boolean; count: number } {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  own.next.forEach((j, i) => { if (j >= 0) parent[find(i)] = find(j); });
  const byRoot = new Map<number, number[]>();
  boxes.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));
  let left = [...byRoot.values()];
  const other = (1 - axis) as 0 | 1;
  const mean = (g: number[]) => g.reduce((s, i) => s + center(boxes[i], other), 0) / g.length;
  // Tri topologique : à chaque pas, la ligne sans précédente restante la plus haute (ou à gauche) ; en cas de cycle, la plus haute.
  const groups: number[][] = [];
  while (left.length) {
    const roots = new Set(left.map((g) => find(g[0])));
    const before = new Set(left.flatMap((g) => g.map((i) => across[i]).filter((j) => j >= 0 && find(j) !== find(g[0]) && roots.has(find(j))).map(find)));
    const free = left.filter((g) => !before.has(find(g[0])));
    const pick = (free.length ? free : left).reduce((a, b) => (mean(b) < mean(a) ? b : a));
    groups.push(pick);
    left = left.filter((g) => g !== pick);
  }
  // Plus de lignes que de cases dans la plus longue suite de l'autre axe : des lignes se sont coupées (cadres très bruités).
  const most = longestChain(boxes, across, other);
  const coherent = !own.spans && groups.length <= most && groups.every((g) => g.every((i) => g.every((j) => i === j || !aligned(boxes[i], boxes[j], axis))));
  return { groups, coherent, count: coherent ? groups.length : most };
}

/**
 * Plus longue suite de cases reliées par `next` le long de l'axe, en comptant
 * les cases oubliées sur un lien qui en saute (écart arrondi en tailles de case).
 */
function longestChain(boxes: Box[], next: number[], axis: 0 | 1): number {
  const size = (b: Box) => b[axis + 2] - b[axis];
  const skipped = (a: Box, b: Box) => Math.max(0, Math.round((2 * (b[axis] - a[axis + 2])) / (size(a) + size(b))));
  const len: number[] = [];
  const chain = (i: number): number => (len[i] ??= next[i] < 0 ? 1 : 1 + skipped(boxes[i], boxes[next[i]]) + chain(next[i]));
  return Math.max(...next.map((_, i) => chain(i)));
}

/**
 * Rang de chaque case sur un axe : celui de sa ligne si les lignes de l'axe
 * sont cohérentes ; sinon, si les lignes de l'autre axe le sont, son rang dans
 * sa ligne de l'autre axe quand celle-ci compte exactement `count` cases
 * (rangée complète pour une colonne, colonne complète pour une rangée) ; null ailleurs.
 */
type Lines = ReturnType<typeof lines>;
function ranks(boxes: Box[], own: Lines, cross: Lines, axis: 0 | 1, count: number): (number | null)[] {
  const rank: (number | null)[] = boxes.map(() => null);
  if (own.coherent) own.groups.forEach((g, k) => g.forEach((i) => (rank[i] = k)));
  else if (cross.coherent) {
    for (const g of cross.groups.filter((h) => h.length === count)) {
      [...g].sort((i, j) => center(boxes[i], axis) - center(boxes[j], axis)).forEach((i, k) => (rank[i] = k));
    }
  }
  return rank;
}

/**
 * Meubles détectés case par case (`units`, sortie de Gemini) ramenés à des
 * blocs : cadre = union des cases valides, rangées et colonnes comptées par
 * voisinage et non sur des coordonnées globales, pour résister à la
 * perspective (une même tablette peut descendre de plus d'une case d'un bout à
 * l'autre du mur). Chaque case est reliée à sa voisine de droite (chevauchement
 * vertical d'au moins la moitié de la moins haute) et à celle du dessous, une
 * seule précédente par case (`links`) ; rangées = nombre de lignes de cases
 * reliées de gauche à droite, colonnes = nombre de lignes reliées de haut en
 * bas. Une case oubliée ne coupe pas sa ligne (la voisine suivante est
 * cherchée plus loin). Si les lignes d'un axe sont incohérentes (une case
 * large sous deux colonnes, cadres trop bruités), le compte de cet axe passe au plus grand nombre
 * de cases côte à côte (colonnes) ou empilées (rangées), et le rang des cases
 * sur cet axe est celui qu'elles ont dans une ligne complète de l'autre axe
 * (`ranks`). Une case haute de deux rangées prend la place de celle du haut.
 * `cellCount` : cases valides ; `cells` : leurs 200 premières, sans nom
 * (`nameBlocks` les nomme avec la lettre de la proposition).
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
    const right = links(boxes, 0), down = links(boxes, 1);
    const r = lines(boxes, 0, right, down.next), c = lines(boxes, 1, down, right.next);
    const rows = Math.min(GRID_MAX_ROWS, r.count), cols = Math.min(GRID_MAX_COLS, c.count);
    const rowOf = ranks(boxes, r, c, 1, rows), colOf = ranks(boxes, c, r, 0, cols);
    blocks.push({
      kind: kind as SuggestionKind,
      box: [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))],
      rows, cols, cellCount: boxes.length,
      cells: boxes.slice(0, MAX_CELLS).map((box, i) => ({ box, row: rowOf[i], col: colOf[i], name: null })),
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
 * casse ignorée, ou par `takenPrefixes` (lettres des cases des zones actives).
 * La lettre (une seule, null au-delà de Z) est celle des codes des cases :
 * « Casier C » → C1…C48, enregistrés sur chaque case repérée dans la grille.
 */
export function nameBlocks(blocks: RawBlock[], takenNames: string[], takenPrefixes: string[]): PlanSuggestion[] {
  const key = (n: string) => n.normalize('NFC').trim().toLowerCase();
  const taken = new Set(takenNames.map(key));
  const prefixes = new Set(takenPrefixes);
  const used = (l: string) => prefixes.has(l) || Object.values(LABELS).some((label) => taken.has(key(`${label} ${l}`)));
  let n = 0;
  return [...blocks]
    .sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1])
    .map((b) => {
      while (used(letter(n))) n++;
      const l = letter(n++), prefix = l.length === 1 ? l : null;
      const cells = b.cells?.map((c) => ({
        ...c,
        name: prefix && c.row !== null && c.col !== null && c.row < b.rows && c.col < b.cols ? cellCode(prefix, c.row, c.col, b.cols) : null,
      }));
      return { ...b, ...(cells ? { cells } : {}), id: randomUUID(), name: `${LABELS[b.kind]} ${l}`, cellPrefix: prefix };
    });
}
