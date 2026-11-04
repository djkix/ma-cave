import type { Tannin, WineColor } from '../api-client';

/** Rubrique de la base d'accords, dans l'ordre des onglets. */
export type DishCategory = 'ENTREE' | 'PLAT' | 'FROMAGE' | 'DESSERT';
export const DISH_CATEGORIES: Array<{ value: DishCategory; label: string }> = [
  { value: 'ENTREE', label: 'Entrées' }, { value: 'PLAT', label: 'Plats' },
  { value: 'FROMAGE', label: 'Fromages' }, { value: 'DESSERT', label: 'Desserts' },
];

/**
 * Une entrée de la base : un ingrédient ou un plat dominant (« Poulet rôti »,
 * « Comté »), pas une recette. L'accord se fait sur cet ingrédient.
 */
export interface DishEntry {
  /** Identifiant stable, en kebab-case sans accents (« poulet-roti »). */
  id: string;
  /** Nom affiché (« Poulet rôti »). */
  name: string;
  category: DishCategory;
  /**
   * Mots ou expressions qui désignent cette entrée dans un plat tapé ou dicté,
   * en minuscules (accents permis : la comparaison les ignore). 3 à 8 en
   * général, du plus précis au plus courant (« poulet rôti », « poulet », « volaille »).
   */
  keywords: string[];
  /** Couleurs qui conviennent, la préférée d'abord. */
  colors: WineColor[];
  /** Tanin attendu pour un rouge ; `null` : indifférent (ou pas de rouge). */
  tannin: Tannin | null;
  /** 0 à 3 arômes qui s'accordent, pris dans la liste fermée `AROMAS` (lib/traits). */
  aromas: string[];
  /**
   * Accords classiques : fragments d'appellation ou noms de région (liste
   * fermée `REGIONS`) qui valent un bonus (« sauternes », « Jura », « chablis »).
   */
  classics?: string[];
  /** Vin doux (liquoreux, VDN) attendu : desserts, foie gras, persillés. */
  sweet?: boolean;
}
