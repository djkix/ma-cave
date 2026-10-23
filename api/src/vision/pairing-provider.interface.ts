export const PAIRING_PROVIDER = 'PAIRING_PROVIDER';

export interface PairingWine {
  producer: string;
  cuvee: string | null;
  appellation: string;
  region: string | null;
  color: string;
  vintage: number | null;
}

/** Plats d'un vin du lot ; `index` : sa position dans le tableau envoyé (à partir de 0). */
export interface PairingBatchItem {
  index: number;
  dishes: string[];
}

/**
 * Un appel pour tout le lot. `items` ne contient que les vins dont la réponse
 * est valide : un vin absent est à redemander. `costCents` : coût de l'appel
 * entier, à répartir sur les vins du lot.
 */
export interface PairingBatchResult {
  items: PairingBatchItem[];
  model: string;
  costCents: number;
}

export interface PairingProvider {
  suggestPairingsBatch(wines: PairingWine[]): Promise<PairingBatchResult>;
}

export const DISH_PAIRING_PROVIDER = 'DISH_PAIRING_PROVIDER';

/** Un vin en stock proposé au modèle pour un plat (« Accords vins »). */
export interface DishPairingWine extends Omit<PairingWine, 'region'> {
  /** « 2024-2029 », « jusqu'en 2026 », null sans estimation. */
  apogee: string | null;
}

/**
 * Réponse brute du modèle (objet JSON lu, non validé : l'appelant la valide et
 * ne garde que les numéros de vins envoyés). `costCents` : coût de l'appel.
 */
export interface DishPairingResult {
  raw: unknown;
  model: string;
  costCents: number;
}

export interface DishPairingProvider {
  pairDish(dish: string, wines: DishPairingWine[]): Promise<DishPairingResult>;
}
