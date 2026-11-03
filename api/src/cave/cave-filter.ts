import { normalizeLabel } from '../appellations/appellations.service';
import type { Country, Tannin } from '../traits/traits';

/** Valeur de `region` pour les vins hors de France. */
export const HORS_FRANCE = 'HORS_FRANCE';
/** Libellés de `regionLabel` (statistiques, export). */
export const NO_REGION = 'Sans région';
export const OUTSIDE_FRANCE = 'Hors de France';

export interface CaveRow {
  id: string;
  producer: string;
  cuvee: string | null;
  appellationRaw: string;
  vintage: number | null;
  color: string;
  formatCl: number;
  referencePhotoId: string | null;
  quantity: number;
  /** Région publiée (`publishedRegion`) : manuelle, sinon du référentiel, sinon estimée par l'IA. */
  region?: string | null;
  regionSource?: RegionSource | null;
  /** Appellation reconnue : le vin est alors français, quoi qu'en dise `country`. */
  appellationId?: string | null;
  /** Pays lu dans les caractéristiques ; la valeur publiée passe par `countryOf`. */
  country?: Country | null;
  /** Champs des caractéristiques corrigés à la main (interne, retiré de la réponse). */
  traitsManual?: string[] | null;
  tannin?: Tannin | null;
  aromas?: string[] | null;
  producerKey?: string;
}

export type RegionSource = 'MANUEL' | 'REFERENTIEL' | 'IA';

/** Pays corrigé à la main d'abord, puis `FR` si l'appellation est reconnue, sinon le pays estimé par l'IA. */
export function countryOf(row: Pick<CaveRow, 'appellationId' | 'country' | 'traitsManual'>): Country | null {
  if (row.traitsManual?.includes('country')) return row.country ?? null;
  return row.appellationId ? 'FR' : (row.country ?? null);
}

/** Sources de la région lues en base : `refRegion` (référentiel), `aiRegion` (`wine_traits.region`, manuelle ou IA). */
export interface RegionInput extends Pick<CaveRow, 'appellationId' | 'country' | 'traitsManual'> {
  refRegion?: string | null;
  aiRegion?: string | null;
}

/**
 * Région publiée, seule source de la liste, de la fiche, du filtre, des
 * statistiques et de l'export : la région corrigée à la main (null = effacée),
 * sinon aucune pour un vin hors de France, sinon celle du référentiel, sinon
 * celle estimée par l'IA.
 */
export function publishedRegion(row: RegionInput): { region: string | null; regionSource: RegionSource | null } {
  if (row.traitsManual?.includes('region')) return { region: row.aiRegion ?? null, regionSource: 'MANUEL' };
  if (countryOf(row) === 'AUTRE') return { region: null, regionSource: null };
  if (row.refRegion) return { region: row.refRegion, regionSource: 'REFERENTIEL' };
  if (row.aiRegion) return { region: row.aiRegion, regionSource: 'IA' };
  return { region: null, regionSource: null };
}

/** Libellé de la région publiée : la région, sinon « Hors de France » pour un vin étranger, sinon « Sans région ». */
export function regionLabel(row: Pick<CaveRow, 'region' | 'appellationId' | 'country' | 'traitsManual'>): string {
  return row.region ?? (countryOf(row) === 'AUTRE' ? OUTSIDE_FRANCE : NO_REGION);
}

export interface CaveFilter {
  q?: string;
  color?: string;
  includeEmpty?: boolean;
  /** Fin d'apogée au plus tard l'an prochain ; appliqué après le calcul de l'apogée. */
  drinkSoon?: boolean;
  /** Vins sans estimation d'apogée ; appliqué après le calcul de l'apogée. */
  noApogee?: boolean;
  /** Plat à accompagner ; appliqué après le calcul de l'apogée. */
  dish?: string;
  /** Emplacement (id) ou « none » pour « Sans emplacement » : vins avec du stock à cet endroit. */
  location?: string;
  /** Tous les arômes demandés sont requis. */
  aromas?: string[];
  vintageMin?: number;
  vintageMax?: number;
  tannin?: Tannin;
  /** Nom de région exact, ou `HORS_FRANCE`. */
  region?: string;
}

/** Tous les mots cherchés doivent apparaître, sans accents ni casse, dans producteur, cuvée ou appellation. */
export function filterCave<T extends CaveRow>(rows: T[], filter: CaveFilter): T[] {
  const words = normalizeLabel(filter.q ?? '').split(' ').filter(Boolean);
  return rows.filter((r) => {
    if (!filter.includeEmpty && r.quantity <= 0) return false;
    if (filter.color && r.color !== filter.color) return false;
    if (filter.aromas?.length && !filter.aromas.every((a) => r.aromas?.includes(a))) return false;
    if (filter.vintageMin != null && (r.vintage == null || r.vintage < filter.vintageMin)) return false;
    if (filter.vintageMax != null && (r.vintage == null || r.vintage > filter.vintageMax)) return false;
    if (filter.tannin && r.tannin !== filter.tannin) return false;
    if (filter.region && (filter.region === HORS_FRANCE ? countryOf(r) !== 'AUTRE' : r.region !== filter.region)) return false;
    const haystack = normalizeLabel(`${r.producer} ${r.cuvee ?? ''} ${r.appellationRaw}`);
    return words.every((w) => haystack.includes(w));
  });
}
