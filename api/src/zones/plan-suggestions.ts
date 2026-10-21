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

/** A…Z, puis AA, AB… */
const letter = (n: number): string => (n >= 26 ? letter(Math.floor(n / 26) - 1) : '') + String.fromCharCode(65 + (n % 26));

/**
 * Nomme les blocs de gauche à droite (x0, puis y0) : « Casier A », « Étagère B »,
 * « Rangement C »… une lettre par bloc, en sautant toute lettre déjà employée
 * par `takenNames` (noms des zones actives) sous la forme « <Type> <lettre> »,
 * casse ignorée.
 */
export function nameBlocks(blocks: RawBlock[], takenNames: string[]): PlanSuggestion[] {
  const taken = new Set(takenNames.map((n) => n.trim().toLowerCase()));
  const used = (l: string) => Object.values(LABELS).some((label) => taken.has(`${label} ${l}`.toLowerCase()));
  let n = 0;
  return [...blocks]
    .sort((a, b) => a.box[0] - b.box[0] || a.box[1] - b.box[1])
    .map((b) => {
      while (used(letter(n))) n++;
      return { ...b, id: randomUUID(), name: `${LABELS[b.kind]} ${letter(n++)}` };
    });
}
