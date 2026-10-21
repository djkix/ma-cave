import { z } from 'zod';
import type { PlanAnalysisJobState } from '../queue/plan-analysis';
import { GRID_MAX_COLS, GRID_MAX_ROWS, PlanSuggestion } from './plan-suggestions';

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

export const createZoneSchema = z.object({ name, indication }, { invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME });
export type CreateZoneInput = { name: string; indication?: string | null };

/** Champs absents : inchangés ; `indication: null` ou vide l'efface. L'ordre se change par POST …/zones/order. */
export const updateZoneSchema = z.object(
  { name: name.optional(), indication: indication.optional(), grid: grid.nullable().optional() },
  { invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME },
);
export type UpdateZoneInput = { name?: string; indication?: string | null; grid?: { rows: number; cols: number } | null };

/** Accepter une proposition : nom de zone et grille, mêmes règles que pour une zone. */
export const acceptSuggestionSchema = z.object({ name, ...gridShape }, { invalid_type_error: INVALID_ZONE_NAME, required_error: INVALID_ZONE_NAME });

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
 * `grid` : grille de cases (lignes A…, colonnes 1…), null sans grille.
 */
export interface ZoneView {
  id: string; name: string; indication: string | null; hasPhoto: boolean; sortOrder: number; marker: { planId: string; x: number; y: number } | null;
  grid: { rows: number; cols: number } | null;
}

export function zoneView(z: {
  id: string; name: string; indication: string | null; photoPath: string | null; sortOrder: number; planId: string | null; planX: number | null; planY: number | null;
  gridRows: number | null; gridCols: number | null;
}): ZoneView {
  return {
    id: z.id, name: z.name, indication: z.indication, hasPhoto: z.photoPath != null, sortOrder: z.sortOrder,
    marker: z.planId != null && z.planX != null && z.planY != null ? { planId: z.planId, x: z.planX, y: z.planY } : null,
    grid: z.gridRows != null && z.gridCols != null ? { rows: z.gridRows, cols: z.gridCols } : null,
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
 * Raison d'un échec d'analyse (`analysis_error`) : refus de Gemini, budget
 * dépassé, image absente, réponse inexploitable, autre erreur.
 */
export type PlanFailedReason = 'GEMINI' | 'BUDGET' | 'IMAGE' | 'ILLISIBLE' | 'ERREUR';

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
/** Repère affiché : `number` = rang (à partir de 1) sur son plan, parmi les zones non archivées, dans l'ordre d'affichage. */
export interface PlanMarker { zoneId: string; planId: string; name: string; number: number; x: number; y: number }
