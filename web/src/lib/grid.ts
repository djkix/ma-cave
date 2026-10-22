/** Bornes de la grille d'une zone : celles de l'api. */
export const GRID_MAX_ROWS = 26;
export const GRID_MAX_COLS = 30;

/**
 * Code d'une case, rangée par rangée : `<lettre><n>`, n = i × cols + j + 1 (rangée `i`,
 * colonne `j`, à partir de 0), comme api/src/zones/zone.ts : « C » sur 4 × 12 → C1…C48,
 * C13 au début de la 2ᵉ rangée. Une zone à grille d'avant la 2.27 (sans lettre) passe « A ».
 */
export const cellCode = (prefix: string, row: number, col: number, cols: number): string => `${prefix}${row * cols + col + 1}`;

/** Codes des cases d'une grille, rangée par rangée (C1, C2…). */
export function cellNames(rows: number, cols: number, prefix: string): string[] {
  return Array.from({ length: rows * cols }, (_, k) => `${prefix}${k + 1}`);
}

/** Aperçu des cases : « Cases C1 à C48 », « Case C1 » pour une seule. */
export function cellsPreview(rows: number, cols: number, prefix: string): string {
  return rows * cols === 1 ? `Case ${prefix}1` : `Cases ${prefix}1 à ${prefix}${rows * cols}`;
}

/**
 * Lettre proposée pour une zone qui n'en a pas (règle de l'api) : la lettre finale du
 * nom quand il finit par une lettre seule précédée d'une espace (« Casier C » → C, casse
 * ignorée) et qu'elle n'est pas dans `taken` (lettres des autres zones) ; sinon la
 * première libre de A à Z ; aucune libre : null.
 */
export function suggestPrefix(name: string, taken: Iterable<string>): string | null {
  const used = new Set(taken);
  const end = /\s([A-Za-z])$/.exec(name.trim())?.[1].toUpperCase();
  if (end && !used.has(end)) return end;
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? null;
}

/** Lettre des cases changée : les clés `<from><n>` deviennent `<to><n>`, les autres restent telles quelles (comme l'api). */
export function renamePrefix(names: CellNameMap, from: string, to: string): CellNameMap {
  const code = new RegExp(`^${from}([1-9][0-9]*)$`);
  return Object.fromEntries(Object.entries(names).map(([k, v]) => [k.replace(code, `${to}$1`), v]));
}

/**
 * Lignes et colonnes saisies → grille : null si les deux sont vides (pas de
 * grille), undefined si la saisie est incomplète ou hors bornes.
 */
export function parseGrid(rows: string, cols: string): { rows: number; cols: number } | null | undefined {
  if (!rows.trim() && !cols.trim()) return null;
  const r = Number(rows);
  const c = Number(cols);
  const ok = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  return ok(r, GRID_MAX_ROWS) && ok(c, GRID_MAX_COLS) ? { rows: r, cols: c } : undefined;
}

/** Noms d'affichage des cases d'une zone : { « C15 »: « Champagnes » }. Le code reste la valeur enregistrée dans « casier ». */
export type CellNameMap = Record<string, string>;

/** Casier saisi → code de la case qui porte ce nom (casse et espaces ignorés), sinon le casier tel quel (comme l'api). */
export function cellCodeOf(casier: string | null, names: CellNameMap = {}): string | null {
  const key = casier?.trim().toUpperCase();
  if (!key) return casier;
  return Object.keys(names).find((code) => names[code].toUpperCase() === key) ?? casier;
}

/** Casier affiché : « Champagnes (C15) » pour une case nommée (saisie par son code ou son nom), sinon le casier. */
export function casierLabel(casier: string | null, names: CellNameMap = {}): string | null {
  const code = cellCodeOf(casier, names)?.trim().toUpperCase();
  const name = code ? names[code] : undefined;
  return name ? `${name} (${code})` : casier;
}

/** Noms à envoyer : sans espaces autour, vides retirés, seulement les cases de la grille (une grille réduite perd les autres). */
export function cleanCellNames(names: CellNameMap, grid: { rows: number; cols: number }, prefix: string): CellNameMap {
  return Object.fromEntries(cellNames(grid.rows, grid.cols, prefix).map((code) => [code, names[code]?.trim()]).filter(([, name]) => name));
}
