import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { PlanAnalysisJobState } from '../queue/plan-analysis';
import { cellCode, GRID_MAX_COLS, GRID_MAX_ROWS, PlanSuggestion } from './plan-suggestions';

export const ZONE_NOT_FOUND = 'Zone introuvable';
export const ZONE_NAME_TAKEN = 'Une zone porte déjà ce nom';
export const ZONE_PHOTO_NOT_FOUND = 'Photo introuvable';
export const ZONE_ARCHIVED_TAKEN = 'Cette zone a été supprimée ; rangez ces bouteilles ailleurs';
export const PLAN_NOT_FOUND = 'Plan introuvable';
export const PLAN_NAME_TAKEN = 'Un plan porte déjà ce nom';
export const PLAN_LIMIT = '20 plans au plus par cave';
export const INVALID_PLAN_NAME = 'Le nom du plan doit faire de 1 à 40 caractères';
export const INVALID_MARKER = 'Position invalide sur le plan';
export const PHOTO_TOO_LARGE = 'Photo trop lourde (15 Mo au plus)';
export const INVALID_ZONE_NAME = 'Le nom de la zone doit faire de 1 à 40 caractères';
export const INVALID_INDICATION = 'L\'indication fait 300 caractères au plus';
export const INVALID_ORDER = 'Ordre des zones invalide';
export const INVALID_GRID = 'La grille fait de 1 à 26 lignes et de 1 à 30 colonnes';
export const SUGGESTION_NOT_FOUND = 'Proposition introuvable';
export const ANALYSIS_IN_PROGRESS = 'Une analyse est déjà en cours';
export const UNKNOWN_CELL = 'Case inconnue dans cette zone';
export const CELL_NAME_TAKEN = 'Ce nom est déjà pris dans cette zone';
export const INVALID_CELL_NAME = 'Le nom d\'une case fait 40 caractères au plus';
export const INVALID_CELL_NAMES = 'Noms des cases invalides';
export const CELL_PREFIX_TAKEN = 'Cette lettre est déjà prise par une autre zone';
export const NO_FREE_PREFIX = 'Plus de lettre libre pour les cases (26 casiers au plus)';
export const INVALID_CELL_PREFIX = 'La lettre des cases est une lettre de A à Z';
export const CELL_CODES_TAKEN = 'Des bouteilles sont déjà rangées sous ces codes dans cette zone';
export const CELL_NAME_MAX = 40;
export const ZONE_NAME_MAX = 40;
export const PLAN_NAME_MAX = 40;
export const PLAN_MAX_COUNT = 20;
export const INDICATION_MAX = 300;

const name = z
  .string({ invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME })
  .trim()
  .min(1, INVALID_ZONE_NAME)
  .max(ZONE_NAME_MAX, INVALID_ZONE_NAME);

/** Indication nettoyée ; vide = aucune (null). */
const indication = z
  .string({ invalid_type_error: INVALID_INDICATION })
  .trim()
  .max(INDICATION_MAX, INVALID_INDICATION)
  .nullish()
  .transform((v) => (v ? v : null));

/** Grille de cases : 1 à 26 lignes, 1 à 30 colonnes, entiers. */
const gridSide = (max: number) => z.number({ invalid_type_error: INVALID_GRID, required_error: INVALID_GRID }).int(INVALID_GRID).min(1, INVALID_GRID).max(max, INVALID_GRID);
const gridShape = { rows: gridSide(GRID_MAX_ROWS), cols: gridSide(GRID_MAX_COLS) };
const grid = z.object(gridShape, { invalid_type_error: INVALID_GRID, required_error: INVALID_GRID });

/**
 * Noms des cases : { code: nom } (remplacement complet). Codes et noms sont
 * vérifiés contre la grille par cellNamesFor ; ici, seulement la forme.
 */
const cellNames = z.record(
  z.string({ invalid_type_error: INVALID_CELL_NAME }).refine((v) => v.trim().length <= CELL_NAME_MAX, INVALID_CELL_NAME),
  { invalid_type_error: INVALID_CELL_NAMES, required_error: INVALID_CELL_NAMES },
);

/** Lettre des cases : une lettre de A à Z, mise en majuscule. */
const cellPrefix = z
  .string({ invalid_type_error: INVALID_CELL_PREFIX })
  .regex(/^[A-Za-z]$/, INVALID_CELL_PREFIX)
  .transform((v) => v.toUpperCase());

/** Nom d'affichage par case : { « C15 »: « Champagnes » }. Le code reste la valeur enregistrée dans `location.casier`. */
export type CellNames = Record<string, string>;
/** Cadre d'une case sur le plan de la zone, en fractions de l'image [x0, y0, x1, y1]. */
export type CellBox = [number, number, number, number];
/** Positions des cases : { « C15 »: cadre }. */
export type CellBoxes = Record<string, CellBox>;

/**
 * Codes des cases d'une grille, rangée par rangée : `<lettre><n>`, n = i × cols + j + 1
 * (comme web/src/lib/grid.ts). Sans lettre (zone à grille d'avant la 2.27) : « A ».
 */
export function gridCodes(grid: { rows: number; cols: number } | null, prefix: string | null): string[] {
  if (!grid) return [];
  return Array.from({ length: grid.rows * grid.cols }, (_, k) => cellCode(prefix ?? 'A', Math.floor(k / grid.cols), k % grid.cols, grid.cols));
}

/**
 * Lettre choisie pour une zone qui pose sa grille sans en avoir : la lettre finale
 * du nom quand il finit par une lettre seule précédée d'une espace (« Casier C »
 * → C, casse ignorée) et qu'elle n'est pas dans `taken` (lettres des autres zones
 * actives) ; sinon la première libre de A à Z ; aucune libre : null.
 */
export function suggestPrefix(name: string, taken: Iterable<string>): string | null {
  const used = new Set(taken);
  const end = /\s([A-Za-z])$/.exec(name.trim())?.[1].toUpperCase();
  if (end && !used.has(end)) return end;
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !used.has(l)) ?? null;
}

/**
 * Clés `<from><n>` renommées en `<to><n>` (lettre des cases changée) ; les autres clés sont gardées telles quelles.
 * Deux clés sur un même code n'arrivent pas (les clés sont des codes de `from`, `to` est libre dans la cave) :
 * refusé plutôt qu'écrasé, si jamais.
 */
export function renamePrefix<T>(map: Record<string, T>, from: string, to: string): Record<string, T> {
  const code = new RegExp(`^${from}([1-9][0-9]*)$`);
  const out = new Map<string, T>();
  for (const [k, v] of Object.entries(map)) {
    const key = k.replace(code, `${to}$1`);
    if (out.has(key)) throw new Error(`Lettre des cases : ${key} existe déjà`);
    out.set(key, v);
  }
  return Object.fromEntries(out);
}

/**
 * Noms saisis → noms enregistrés : codes en majuscules, noms sans espaces autour,
 * nom vide = case sans nom. 400 « Case inconnue dans cette zone » pour un code
 * hors de la grille ; 400 « Ce nom est déjà pris dans cette zone » pour un nom
 * porté par une autre case ou égal au code d'une autre case (casse ignorée) :
 * un nom saisi dans « casier » désigne ainsi une seule case.
 */
export function cellNamesFor(input: CellNames, grid: { rows: number; cols: number } | null, prefix: string | null): CellNames {
  const codes = new Set(gridCodes(grid, prefix));
  const out: CellNames = {};
  for (const [rawCode, rawName] of Object.entries(input)) {
    const code = rawCode.trim().toUpperCase();
    if (!codes.has(code)) throw new BadRequestException(UNKNOWN_CELL);
    const name = rawName.trim();
    if (name) out[code] = name;
  }
  const taken = new Map<string, string>();
  for (const [code, name] of Object.entries(out)) {
    const key = name.toUpperCase();
    if ((codes.has(key) && key !== code) || (taken.has(key) && taken.get(key) !== code)) throw new BadRequestException(CELL_NAME_TAKEN);
    taken.set(key, code);
  }
  return out;
}

/**
 * Noms gardés après un changement de grille : ceux des cases qui existent encore,
 * sauf un nom devenu le code d'une autre case (grille agrandie), qui désignerait deux cases.
 */
export function keptCellNames(names: CellNames, grid: { rows: number; cols: number } | null, prefix: string | null): CellNames {
  const codes = new Set(gridCodes(grid, prefix));
  return Object.fromEntries(Object.entries(names).filter(([code, name]) => {
    const key = name.toUpperCase();
    return codes.has(code) && (key === code || !codes.has(key));
  }));
}

export const createZoneSchema = z.object({ name, indication }, { invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME });
export type CreateZoneInput = { name: string; indication?: string | null };

/** Champs absents : inchangés ; `indication: null` ou vide l'efface. L'ordre se change par POST …/zones/order. */
export const updateZoneSchema = z.object(
  { name: name.optional(), indication: indication.optional(), grid: grid.nullable().optional(), cellNames: cellNames.optional(), cellPrefix: cellPrefix.optional() },
  { invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME },
);
export type UpdateZoneInput = {
  name?: string; indication?: string | null; grid?: { rows: number; cols: number } | null; cellNames?: CellNames; cellPrefix?: string;
};

/** Accepter une proposition : nom de zone, grille, noms et lettre des cases (facultatifs), mêmes règles que pour une zone. */
export const acceptSuggestionSchema = z.object(
  { name, ...gridShape, cellNames: cellNames.optional(), cellPrefix: cellPrefix.optional() },
  { invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME },
);

/** Nouvel ordre d'affichage : les zones de la cave, de la première à la dernière. */
export const zoneOrderSchema = z.object(
  {
    ids: z
      .array(z.string({ invalid_type_error: INVALID_ORDER }).uuid(INVALID_ORDER), { invalid_type_error: INVALID_ORDER, required_error: INVALID_ORDER })
      .max(1000, INVALID_ORDER)
      .refine((ids) => new Set(ids).size === ids.length, INVALID_ORDER),
  },
  { invalid_type_error: INVALID_ORDER, required_error: INVALID_ORDER },
);

/**
 * Zone telle que l'api la rend : la photo se lit par GET /api/caves/zones/:id/photo ;
 * `marker` : son repère sur un plan de la cave (le plan, puis fractions de la
 * largeur et de la hauteur), null sans repère. Effacé quand son plan est supprimé.
 * `grid` : grille de cases, null sans grille ; `cellPrefix` : lettre de leurs codes
 * (« C » → C1…C48, rangée par rangée), null sans grille ou pour une zone à grille
 * d'avant la 2.27 (codes lus avec « A ») ; `cellNames` : noms d'affichage des cases
 * ({} sans nom) ; `cellBoxes` : positions des cases sur le plan du repère ({} sans position).
 */
export interface ZoneView {
  id: string; name: string; indication: string | null; hasPhoto: boolean; sortOrder: number; marker: { planId: string; x: number; y: number } | null;
  grid: { rows: number; cols: number } | null; cellPrefix: string | null; cellNames: CellNames; cellBoxes: CellBoxes;
}

export function zoneView(z: {
  id: string; name: string; indication: string | null; photoPath: string | null; sortOrder: number; planId: string | null; planX: number | null; planY: number | null;
  gridRows: number | null; gridCols: number | null; cellPrefix: string | null; cellNames: unknown; cellBoxes: unknown;
}): ZoneView {
  return {
    id: z.id, name: z.name, indication: z.indication, hasPhoto: z.photoPath != null, sortOrder: z.sortOrder,
    marker: z.planId != null && z.planX != null && z.planY != null ? { planId: z.planId, x: z.planX, y: z.planY } : null,
    grid: z.gridRows != null && z.gridCols != null ? { rows: z.gridRows, cols: z.gridCols } : null,
    cellPrefix: z.cellPrefix,
    // Des objets JSON (cave_zone_cell_names_check, cave_zone_cell_boxes_check).
    cellNames: z.cellNames as CellNames,
    cellBoxes: z.cellBoxes as CellBoxes,
  };
}

/** Chemin de la photo d'une zone, relatif à PHOTO_STORAGE_DIR. */
export const zonePhotoPath = (id: string) => `zones/${id}.jpg`;

/** Chemin de l'image d'un plan, relatif à PHOTO_STORAGE_DIR (un plan repris de la 2.13.0 garde `plans/<caveId>.jpg`). */
export const planPath = (planId: string) => `plans/${planId}.jpg`;
/** Plus grand côté du plan normalisé, en pixels. */
export const PLAN_MAX_SIDE = 2400;

/** Nom d'un plan : 1 à 40 caractères, espaces autour retirés. */
export const planNameSchema = z
  .string({ invalid_type_error: INVALID_PLAN_NAME, required_error: INVALID_PLAN_NAME })
  .trim()
  .min(1, INVALID_PLAN_NAME)
  .max(PLAN_NAME_MAX, INVALID_PLAN_NAME);

/**
 * Repère d'une zone : un plan de la cave (identifiant invalide : « Plan
 * introuvable », comme un plan d'une autre cave) et deux nombres entre 0 et 1
 * (fractions de la largeur et de la hauteur du plan).
 */
const fraction = z.number({ invalid_type_error: INVALID_MARKER, required_error: INVALID_MARKER }).min(0, INVALID_MARKER).max(1, INVALID_MARKER);
export const markerSchema = z.object(
  { planId: z.string({ invalid_type_error: PLAN_NOT_FOUND, required_error: PLAN_NOT_FOUND }).uuid(PLAN_NOT_FOUND), x: fraction, y: fraction },
  { invalid_type_error: INVALID_MARKER, required_error: INVALID_MARKER },
);

/**
 * Raison d'un échec d'analyse (`analysis_error`) : Gemini indisponible (quota,
 * saturation, réseau, configuration), demande refusée par Gemini (4xx hors 429),
 * budget dépassé, image absente, réponse inexploitable, autre erreur.
 */
export type PlanFailedReason = 'GEMINI' | 'REFUS' | 'BUDGET' | 'IMAGE' | 'ILLISIBLE' | 'ERREUR';

/**
 * Détail de l'analyse (`since` = date de la demande : envoi, remplacement ou relance) : en attente, son avancement ;
 * en échec, sa raison ; null sinon (NONE, DONE).
 */
export type PlanAnalysisInfo = ({ since: string } & PlanAnalysisJobState) | { since: string; failedReason: PlanFailedReason } | null;

/**
 * Plan tel que l'api le rend : nom, taille en pixels, date du dernier envoi de
 * l'image (ISO), état de l'analyse de la photo, son détail et propositions de zones en attente.
 */
export interface PlanMeta {
  id: string; name: string; width: number; height: number; updatedAt: string;
  analysis: 'NONE' | 'PENDING' | 'DONE' | 'FAILED'; suggestions: PlanSuggestion[]; analysisInfo: PlanAnalysisInfo;
}
/**
 * Repère affiché : `number` = rang (à partir de 1) sur son plan, parmi les zones non archivées, dans l'ordre d'affichage ;
 * `cellBoxes` et `cellNames` : positions et noms des cases de la zone, pour les dessiner sur ce plan ({} sans case).
 */
export interface PlanMarker { zoneId: string; planId: string; name: string; number: number; x: number; y: number; cellBoxes: CellBoxes; cellNames: CellNames }
