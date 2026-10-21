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
