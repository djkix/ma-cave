import { Country, Tannin } from '../traits/traits';

export const TRAITS_PROVIDER = 'TRAITS_PROVIDER';

/** Un vin à caractériser, tel que décrit au modèle. */
export interface TraitsWine {
  producer: string;
  cuvee: string | null;
  appellation: string;
  vintage: number | null;
  color: string;
}

/** Caractéristiques d'un vin du lot ; `index` : sa position dans le tableau envoyé (à partir de 0). */
export interface TraitsBatchItem {
  index: number;
  tannin: Tannin | null;
  aromas: string[];
  country: Country | null;
}

/**
 * Un appel pour tout le lot. `items` ne contient que les vins dont la réponse
 * est valide : un vin absent est à redemander. `costCents` : coût de l'appel entier.
 */
export interface TraitsBatchResult {
  items: TraitsBatchItem[];
  model: string;
  costCents: number;
}

export interface TraitsProvider {
  characterizeWinesBatch(wines: TraitsWine[]): Promise<TraitsBatchResult>;
}
