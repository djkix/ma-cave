import { z } from 'zod';

/**
 * Cote saisie à la main par le propriétaire (jamais lue automatiquement : les
 * conditions d'iDealwine, Wine-Searcher et Vivino l'interdisent ; l'application
 * n'offre que des liens). Fonctions pures, partagées par la fiche, les
 * statistiques et l'export.
 */
export const COTE_INVALID = 'La cote doit être comprise entre 0,01 € et 100 000 €';
export const TRANSACTIONS_INVALID = 'Nombre de transactions invalide';
export const DATE_INVALID = 'Date de cote invalide';
export const URL_INVALID = 'Le lien doit être une page iDealwine, Wine-Searcher ou Vivino';

export const MAX_COTE_CENTS = 10_000_000;
export const MIN_QUOTED_ON = '1990-01-01';
/** La cote inclut les frais acheteur d'environ 16 % : valeur de cession estimée = cote / 1,16. */
export const BUYER_FEES_FACTOR = 1.16;
const QUOTE_TIME_ZONE = 'Europe/Paris';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: QUOTE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** « AAAA-MM-JJ » du jour à Paris. */
export function parisToday(now = new Date()): string {
  return dayFormat.format(now);
}

/** Date réelle « AAAA-MM-JJ » (le 30 février est refusé), ni avant 1990 ni après aujourd'hui à Paris. */
function isValidQuotedOn(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return s >= MIN_QUOTED_ON && s <= parisToday();
}

/**
 * Sites où consulter une cote : ajouter un site = ajouter une entrée. `search`
 * reçoit les termes « producteur cuvée » nettoyés (voir `searchTerms`) ;
 * `dbSource` : valeur de la colonne `price_quote.source` (texte libre, sans contrainte).
 */
export const QUOTE_SITES = [
  // Avec `_` ou `-`, leur moteur affiche le terme avec des tirets, qui ne donne plus rien quand on relance la recherche.
  { site: 'idealwine', label: 'iDealwine', hint: 'enchères', host: 'www.idealwine.com', dbSource: 'IDEALWINE',
    search: (t: string) => `https://www.idealwine.com/fr/acheter-du-vin/recherche-${encodeURIComponent(t)}` },
  { site: 'wine-searcher', label: 'Wine-Searcher', hint: 'prix moyen chez les cavistes', host: 'www.wine-searcher.com', dbSource: 'WINE_SEARCHER',
    search: (t: string) => `https://www.wine-searcher.com/find/${t.replace(/ /g, '+')}` },
  { site: 'vivino', label: 'Vivino', hint: 'prix boutique et note', host: 'www.vivino.com', dbSource: 'VIVINO',
    search: (t: string) => `https://www.vivino.com/search/wines?q=${encodeURIComponent(t)}` },
] as const;

export type QuoteSite = (typeof QUOTE_SITES)[number];

/** Site d'un lien https dont l'hôte est exactement celui d'un des sites (sans port ni identifiants) ; null sinon. Analysé par URL, jamais par préfixe. */
export function quoteSiteOf(s: string | null): QuoteSite | null {
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null;
  return QUOTE_SITES.find((site) => url.host === site.host) ?? null;
}

const int32 = 2_147_483_647;

export const createQuoteSchema = z.object({
  coteCents: z
    .number({ required_error: COTE_INVALID, invalid_type_error: COTE_INVALID })
    .int(COTE_INVALID)
    .min(1, COTE_INVALID)
    .max(MAX_COTE_CENTS, COTE_INVALID),
  nTransactions: z
    .number({ invalid_type_error: TRANSACTIONS_INVALID })
    .int(TRANSACTIONS_INVALID)
    .min(0, TRANSACTIONS_INVALID)
    // Au-delà, la colonne INTEGER déborde et la base répondrait par une erreur 500.
    .max(int32, TRANSACTIONS_INVALID)
    .nullish(),
  quotedOn: z
    .string({ required_error: DATE_INVALID, invalid_type_error: DATE_INVALID })
    .refine(isValidQuotedOn, DATE_INVALID),
  /** Page du vin sur un des sites ; vide = pas de lien. */
  sourceUrl: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
    z.string({ invalid_type_error: URL_INVALID }).max(2000, URL_INVALID).refine((u) => quoteSiteOf(u) !== null, URL_INVALID).nullish(),
  ),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

type SearchedWine = { producer: string; cuvee: string | null; vintage: number | null };

/**
 * Termes de recherche « producteur cuvée » : minuscules, sans accents, mots
 * séparés par des espaces. Sans guillemets : les moteurs n'en tiennent pas
 * compte. Sans le millésime : la recherche montre tous les millésimes, on
 * choisit le sien.
 */
function searchTerms(wine: SearchedWine): string {
  return [wine.producer, wine.cuvee]
    .filter((p) => p != null && p !== '')
    .join(' ')
    // NFD ne décompose pas les ligatures : « Œuvre » donnerait « uvre ».
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Recherche iDealwine (forme de leur recherche : `/fr/acheter-du-vin/recherche-<termes>`). */
export function idealwineSearchUrl(wine: SearchedWine): string {
  return QUOTE_SITES[0].search(searchTerms(wine));
}

export interface SearchLink { site: QuoteSite['site']; label: string; hint: string; url: string }

/** Un lien par site : la recherche du vin, ou la page enregistrée `savedUrl` pour le site qui l'héberge. */
export function searchLinks(wine: SearchedWine, savedUrl: string | null): SearchLink[] {
  const terms = searchTerms(wine);
  const savedSite = quoteSiteOf(savedUrl);
  return QUOTE_SITES.map(({ site, label, hint, search }) => ({ site, label, hint, url: savedUrl && savedSite?.site === site ? savedUrl : search(terms) }));
}

/** La cote inclut des frais acheteur d'enchères : cote iDealwine, ou sans lien (source inconnue). Pas pour un prix de caviste ou de boutique. */
export function hasBuyerFees(sourceUrl: string | null): boolean {
  const site = quoteSiteOf(sourceUrl);
  return site === null || site.site === 'idealwine';
}

interface Dated { quotedOn: Date; createdAt: Date }

const newestFirst = (a: Dated, b: Dated) => b.quotedOn.getTime() - a.quotedOn.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

/** Cote courante : la dernière par date de cote, puis par date de saisie. */
export function currentQuote<T extends Dated>(quotes: T[]): T | null {
  return [...quotes].sort(newestFirst)[0] ?? null;
}

/** Lien enregistré : celui de la cote courante, sinon de la plus récente cote qui en a un ; null si aucun. */
export function savedSourceUrl<T extends Dated & { sourceUrl: string | null }>(quotes: T[]): string | null {
  return [...quotes].sort(newestFirst).find((q) => q.sourceUrl)?.sourceUrl ?? null;
}

/** Cote courante de chaque vin. */
export function currentQuoteByWine<T extends Dated & { wineId: string }>(quotes: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const q of quotes) {
    const best = out.get(q.wineId);
    if (!best || newestFirst(q, best) < 0) out.set(q.wineId, q);
  }
  return out;
}

export function cessionCents(coteCents: number): number {
  return Math.round(coteCents / BUYER_FEES_FACTOR);
}

/** Lecture Prisma d'une cote, avec ce qu'il faut pour la vue. */
export const QUOTE_SELECT = {
  wineId: true, coteCents: true, nTransactions: true, quotedOn: true, sourceUrl: true, createdAt: true,
  enteredBy: { select: { displayName: true, email: true } },
} as const;

export interface QuoteView {
  coteCents: number;
  nTransactions: number | null;
  /** « AAAA-MM-JJ ». */
  quotedOn: string;
  sourceUrl: string | null;
  /** Clé du site déduite du lien (« vivino ») ; null sans lien. */
  site: QuoteSite['site'] | null;
  /** Nom du site (« Vivino ») ; null sans lien. */
  source: string | null;
  /** Nom affiché, sinon e-mail (vue réservée au propriétaire) ; null si le compte a été supprimé. */
  enteredBy: string | null;
  cessionCents: number;
}

export function quoteView(q: {
  coteCents: number; nTransactions: number | null; quotedOn: Date; sourceUrl: string | null;
  enteredBy: { displayName: string | null; email: string } | null;
}): QuoteView {
  return {
    coteCents: q.coteCents,
    nTransactions: q.nTransactions,
    quotedOn: q.quotedOn.toISOString().slice(0, 10),
    sourceUrl: q.sourceUrl,
    site: quoteSiteOf(q.sourceUrl)?.site ?? null,
    source: quoteSiteOf(q.sourceUrl)?.label ?? null,
    enteredBy: q.enteredBy ? q.enteredBy.displayName || q.enteredBy.email : null,
    cessionCents: cessionCents(q.coteCents),
  };
}
