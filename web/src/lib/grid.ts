/** Bornes de la grille d'une zone : celles de l'api. */
export const GRID_MAX_ROWS = 26;
export const GRID_MAX_COLS = 30;

/** Cases d'une grille, ligne par ligne : ligne `i` → lettre `A + i`, colonne `j` → `j + 1` (« A1 », « A2 »…). */
export function cellNames(rows: number, cols: number): string[] {
  return Array.from({ length: rows * cols }, (_, k) => `${String.fromCharCode(65 + Math.floor(k / cols))}${(k % cols) + 1}`);
}

/** Aperçu des cases : « Cases A1 à F4 », « Case A1 » pour une seule. */
export function cellsPreview(rows: number, cols: number): string {
  return rows * cols === 1 ? 'Case A1' : `Cases A1 à ${String.fromCharCode(64 + rows)}${cols}`;
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

/** Noms d'affichage des cases d'une zone : { « B3 »: « Champagnes » }. Le code reste la valeur enregistrée dans « casier ». */
export type CellNameMap = Record<string, string>;

/** Casier saisi → code de la case qui porte ce nom (casse et espaces ignorés), sinon le casier tel quel (comme l'api). */
export function cellCodeOf(casier: string | null, names: CellNameMap = {}): string | null {
  const key = casier?.trim().toUpperCase();
  if (!key) return casier;
  return Object.keys(names).find((code) => names[code].toUpperCase() === key) ?? casier;
}

/** Casier affiché : « Champagnes (B3) » pour une case nommée (saisie par son code ou son nom), sinon le casier. */
export function casierLabel(casier: string | null, names: CellNameMap = {}): string | null {
  const code = cellCodeOf(casier, names)?.trim().toUpperCase();
  const name = code ? names[code] : undefined;
  return name ? `${name} (${code})` : casier;
}

/** Noms à envoyer : sans espaces autour, vides retirés, seulement les cases de la grille (une grille réduite perd les autres). */
export function cleanCellNames(names: CellNameMap, grid: { rows: number; cols: number }): CellNameMap {
  return Object.fromEntries(cellNames(grid.rows, grid.cols).map((code) => [code, names[code]?.trim()]).filter(([, name]) => name));
}
