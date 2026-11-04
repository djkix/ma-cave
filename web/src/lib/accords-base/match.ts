import type { AccordPick, AccordsResult, Apogee, CaveRow, Tannin, Tasted, WineColor } from '../api-client';
import { TANNIN_LABEL } from '../traits';
import { DISH_CATEGORIES, DishEntry } from './types';

/** Minuscules, sans accents (œ → oe), ponctuation et apostrophes en espaces, espaces resserrés. */
export function normalizeDish(s: string): string {
  return s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Position du mot (ou de l'expression) entier `word` dans `text`, tous deux normalisés ; -1 s'il n'y est pas. */
const wordAt = (text: string, word: string) => (word ? ` ${text} `.indexOf(` ${word} `) : -1);

/**
 * Entrées reconnues dans le plat, la dominante d'abord : celle dont un mot-clé
 * apparaît le plus tôt, le plus long départageant une égalité (« poulet rôti »
 * avant « poulet »). Les suivantes dans l'ordre d'apparition. Une entrée dont le
 * mot-clé est inclus dans celui d'une entrée déjà retenue est écartée
 * (« côte de bœuf » : pas de « Bœuf » en plus).
 */
export function findDishes(text: string, entries: DishEntry[]): DishEntry[] {
  const t = normalizeDish(text);
  const found: Array<{ entry: DishEntry; pos: number; len: number }> = [];
  for (const entry of entries) {
    let best: { pos: number; len: number } | null = null;
    for (const k of entry.keywords) {
      const kw = normalizeDish(k);
      const pos = wordAt(t, kw);
      if (pos >= 0 && (!best || pos < best.pos || (pos === best.pos && kw.length > best.len))) best = { pos, len: kw.length };
    }
    if (best) found.push({ entry, ...best });
  }
  found.sort((a, b) => a.pos - b.pos || b.len - a.len);
  const kept: typeof found = [];
  for (const f of found) {
    if (!kept.some((k) => f.pos >= k.pos && f.pos + f.len <= k.pos + k.len)) kept.push(f);
  }
  return kept.map((f) => f.entry);
}

/** Entrées proposées pendant la frappe : nom ou mot-clé qui commence par le texte, puis qui le contient. */
export function suggestDishes(text: string, entries: DishEntry[], max = 6): DishEntry[] {
  const t = normalizeDish(text);
  if (t.length < 2) return [];
  const rank = (e: DishEntry) => {
    const words = [e.name, ...e.keywords].map(normalizeDish);
    return words.some((w) => w.startsWith(t)) ? 0 : words.some((w) => w.includes(t)) ? 1 : 2;
  };
  return entries.map((e) => ({ e, r: rank(e) })).filter((x) => x.r < 2).sort((a, b) => a.r - b.r).slice(0, max).map((x) => x.e);
}

/** Liquoreux et vins doux naturels, reconnus à un fragment de leur appellation. */
const SWEET = [
  'sauternes', 'barsac', 'monbazillac', 'loupiac', 'cadillac', 'sainte croix du mont', 'coteaux du layon', 'bonnezeaux', 'quarts de chaume',
  'jurancon', 'banyuls', 'maury', 'rivesaltes', 'muscat de', 'vendanges tardives', 'selection de grains nobles', 'vin de paille', 'pacherenc',
  'tokaji', 'porto',
];

export function isSweetWine(appellation: string): boolean {
  const a = normalizeDish(appellation);
  return SWEET.some((s) => wordAt(a, s) >= 0 && !(s === 'jurancon' && wordAt(a, 'sec') >= 0));
}

const TANNINS: Tannin[] = ['LEGER', 'MOYEN', 'PUISSANT'];
export const COLOR_LABEL: Record<WineColor, string> = { ROUGE: 'Rouge', BLANC: 'Blanc', ROSE: 'Rosé', PETILLANT: 'Pétillant' };

type Wine = Pick<CaveRow, 'color' | 'appellationRaw'> & Partial<Pick<CaveRow, 'id' | 'tannin' | 'aromas' | 'region'>>;

export type { Tasted };

/**
 * Ce que les accords vécus disent du vin pour l'entrée : son propre avis le plus
 * récent (`own`), sinon un bon accord d'un vin de même appellation et couleur
 * (`kin`), sinon rien.
 */
function tastedOf(entry: DishEntry, wine: Wine, tasted: Tasted[]): { own?: boolean; kin?: boolean } {
  const onDish = tasted.filter((t) => t.dishId === entry.id);
  const own = onDish.find((t) => t.wineId === wine.id);
  if (own) return { own: own.good };
  const app = normalizeDish(wine.appellationRaw);
  return { kin: onDish.some((t) => t.good && t.color === wine.color && normalizeDish(t.appellation) === app) };
}

/** Accord classique de l'entrée trouvé dans le vin (fragment d'appellation ou région), tel qu'écrit dans l'entrée. */
function classicOf(entry: DishEntry, wine: Wine): string | null {
  const app = normalizeDish(wine.appellationRaw);
  const region = wine.region ? normalizeDish(wine.region) : null;
  return entry.classics?.find((c) => wordAt(app, normalizeDish(c)) >= 0 || normalizeDish(c) === region) ?? null;
}

const commonAromas = (entry: DishEntry, wine: Wine) => entry.aromas.filter((a) => wine.aromas?.includes(a));

/**
 * Note d'accord d'un vin avec l'entrée, de 0 à 100 (même échelle que l'IA :
 * ≥ 85 excellent, ≥ 70 bon) ; `null` si sa couleur n'est pas listée. Barème :
 * - couleur préférée (1re de `colors`) 70, autre couleur listée 55 ;
 * - tanin, si l'entrée en attend un et que le vin est rouge : identique +12, voisin +4, opposé −10, inconnu 0 ;
 * - arômes en commun : +6 chacun, +12 au plus ;
 * - accord classique (fragment d'appellation ou région de `classics`) : +15 ;
 * - entrée `sweet` : vin doux +20, sinon −15 ; entrée non `sweet` et vin doux : −25 ;
 * - accords vécus : ce vin bon +25 (même d'une couleur non listée, alors comptée 55),
 *   raté −25 ; sinon un bon accord d'un vin de même appellation et couleur +8.
 * Bornée à 0–100, arrondie.
 */
export function scoreWine(entry: DishEntry, wine: Wine, tasted: Tasted[] = []): number | null {
  const i = entry.colors.indexOf(wine.color);
  const lived = tastedOf(entry, wine, tasted);
  if (i < 0 && lived.own !== true) return null;
  let score = i === 0 ? 70 : 55;
  if (lived.own !== undefined) score += lived.own ? 25 : -25;
  else if (lived.kin) score += 8;
  if (entry.tannin && wine.color === 'ROUGE' && wine.tannin) {
    const gap = Math.abs(TANNINS.indexOf(entry.tannin) - TANNINS.indexOf(wine.tannin));
    score += gap === 0 ? 12 : gap === 1 ? 4 : -10;
  }
  score += Math.min(12, commonAromas(entry, wine).length * 6);
  if (classicOf(entry, wine)) score += 15;
  const sweet = isSweetWine(wine.appellationRaw);
  if (entry.sweet) score += sweet ? 20 : -15;
  else if (sweet) score -= 25;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** À boire d'abord, comme `byApogeePriority` de l'api : passée, dernière année, à boire, sans estimation, trop jeune ; puis fin d'apogée la plus proche. */
const RANK: Record<string, number> = { PASSEE: 0, A_BOIRE_VITE: 1, A_BOIRE: 2, TROP_JEUNE: 4 };
const rankOf = (a?: Apogee) => (a?.status ? RANK[a.status] : 3);
const byApogeePriority = (a: CaveRow, b: CaveRow) =>
  rankOf(a.apogee) - rankOf(b.apogee) || (a.apogee?.max ?? Infinity) - (b.apogee?.max ?? Infinity);

/** Vins en stock qui conviennent, du meilleur accord au moins bon, l'apogée la plus urgente d'abord à score égal ; `max` au plus. */
export function rankCave(entry: DishEntry, wines: CaveRow[], max = 5, tasted: Tasted[] = []): Array<{ wine: CaveRow; score: number }> {
  return wines
    .filter((w) => w.quantity > 0)
    .map((wine) => ({ wine, score: scoreWine(entry, wine, tasted) }))
    .filter((x): x is { wine: CaveRow; score: number } => x.score != null)
    .sort((a, b) => b.score - a.score || byApogeePriority(a.wine, b.wine))
    .slice(0, max);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Profil idéal de l'entrée, en une phrase courte (« Rouge, tanin léger, notes de fruits rouges »). */
export function idealOf(entry: DishEntry): string {
  const color = entry.colors[0];
  const parts = [`${COLOR_LABEL[color]}${entry.sweet ? ' doux' : ''}`];
  if (entry.tannin && color === 'ROUGE') parts.push(`tanin ${TANNIN_LABEL[entry.tannin].toLowerCase()}`);
  if (entry.aromas.length) parts.push(`notes de ${entry.aromas.join(', ')}`);
  if (entry.classics?.length) parts.push(`classique : ${entry.classics.map(capitalize).join(', ')}`);
  return parts.join(', ');
}

/** Raison courte et factuelle (« Accord classique : Chablis · Blanc comme conseillé · beurré »). */
function reasonOf(entry: DishEntry, wine: CaveRow, tasted: Tasted[]): string {
  const classic = classicOf(entry, wine);
  const lived = tastedOf(entry, wine, tasted);
  const parts = [
    lived.own === true && 'Déjà apprécié avec ce plat',
    lived.own === false && 'Accord raté avec ce plat',
    lived.kin && 'Même appellation qu’un accord réussi',
    classic && `Accord classique : ${capitalize(classic)}`,
    entry.colors[0] === wine.color ? `${COLOR_LABEL[wine.color]} comme conseillé` : `${COLOR_LABEL[wine.color]} possible`,
    entry.tannin && wine.color === 'ROUGE' && wine.tannin === entry.tannin && `tanin ${TANNIN_LABEL[entry.tannin].toLowerCase()}`,
    ...commonAromas(entry, wine),
    entry.sweet && isSweetWine(wine.appellationRaw) && 'vin doux',
  ];
  return parts.filter(Boolean).join(' · ');
}

const NO_APOGEE: Apogee = { min: null, max: null, confidence: null, status: null, reason: null, source: null };

/** Accords de l'entrée choisie, au format de la réponse de l'IA (`AccordsResults` les affiche tels quels). */
export function accordsFor(entry: DishEntry, dish: string, wines: CaveRow[], tasted: Tasted[] = []): AccordsResult {
  const picks: AccordPick[] = rankCave(entry, wines, 5, tasted).map(({ wine, score }) => ({
    wineId: wine.id, producer: wine.producer, cuvee: wine.cuvee, appellation: wine.appellationRaw, vintage: wine.vintage, color: wine.color,
    quantity: wine.quantity, place: null, apogee: wine.apogee ?? NO_APOGEE, score, reason: reasonOf(entry, wine, tasted),
  }));
  const category = DISH_CATEGORIES.find((c) => c.value === entry.category)?.label ?? '';
  return {
    dish, wineCount: wines.filter((w) => w.quantity > 0).length, understood: [entry.name, category].filter(Boolean),
    ideal: idealOf(entry), picks,
  };
}

/** Accord immédiat, sans réseau : sur l'entrée dominante du plat ; `null` si le plat n'est pas reconnu. */
export function localAccords(text: string, entries: DishEntry[], wines: CaveRow[], tasted: Tasted[] = []): AccordsResult | null {
  const [first] = findDishes(text, entries);
  return first ? accordsFor(first, text, wines, tasted) : null;
}

/**
 * Sens inverse, « J'ai un vin » : les entrées de la base qui vont au vin (bon
 * accord au moins, ≥ 70), les meilleures d'abord, `perCategory` au plus par
 * rubrique, dans l'ordre des rubriques.
 */
export function dishesFor(wine: Wine, entries: DishEntry[], tasted: Tasted[] = [], perCategory = 4): Array<{ category: string; dishes: DishEntry[] }> {
  const scored = entries.map((e) => ({ e, score: scoreWine(e, wine, tasted) ?? 0 })).filter((x) => x.score >= 70);
  return DISH_CATEGORIES.map((c) => ({
    category: c.label,
    dishes: scored.filter((x) => x.e.category === c.value).sort((a, b) => b.score - a.score).slice(0, perCategory).map((x) => x.e),
  })).filter((g) => g.dishes.length > 0);
}
