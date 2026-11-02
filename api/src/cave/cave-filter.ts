import { normalizeLabel } from '../appellations/appellations.service';
import type { Country, Tannin } from '../traits/traits';

/** Valeur de `region` pour les vins hors de France. */
export const HORS_FRANCE = 'HORS_FRANCE';

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
  /** Région de l'appellation reconnue ; null sinon. */
  region?: string | null;
  /** Appellation reconnue : le vin est alors français, quoi qu'en dise `country`. */
  appellationId?: string | null;
  /** Pays lu dans les caractéristiques ; la valeur publiée passe par `countryOf`. */
  country?: Country | null;
  tannin?: Tannin | null;
  aromas?: string[] | null;
  producerKey?: string;
}

/** `FR` si l'appellation est reconnue, sinon le pays des caractéristiques. */
export function countryOf(row: Pick<CaveRow, 'appellationId' | 'country'>): Country | null {
  return row.appellationId ? 'FR' : (row.country ?? null);
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
