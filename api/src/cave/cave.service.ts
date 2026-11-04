import { Injectable, NotFoundException } from '@nestjs/common';
import { CaveRole, Prisma } from '@prisma/client';
import { Apogee, ApogeeWineInput, CompiledApogeeRules, estimateApogee, isDrinkSoon, sortByApogeeEnd } from '../apogee/apogee';
import { ApogeeRulesService } from '../apogee/apogee-rules.service';
import { ManualApogeeInput } from '../apogee/dto';
import { labelOf, partsOf, Place } from '../locations/location';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { currentQuote, idealwineSearchUrl, QUOTE_SELECT, quoteSiteOf, QuoteView, quoteView, savedSourceUrl, SearchLink, searchLinks } from '../quotes/quote';
import { producerKeyOf } from '../producers/producer-key';
import { PRODUCER_PROFILE_INCLUDE, producerProfileOf } from '../producers/producer-profile.view';
import { parseExtraction } from '../vision/extraction-schema';
import { ExitCandidate, ExitOutcome, ExitRead, rankExitCandidates } from '../wines/exit-ranking';
import { CaveFilter, CaveRow, countryOf, filterCave, publishedRegion, RegionInput } from './cave-filter';
import { TraitsInput } from '../traits/traits.dto';
import { matchDish } from './dish-filter';
import { TastedPairingInput } from './tasted-pairing.dto';

export type ExitCandidatesResponse =
  | { status: 'PENDING' | 'PROCESSING' }
  | { status: 'FAILED'; errorMessage: string | null }
  | { status: 'DONE'; outcome: ExitOutcome; read: ExitRead; candidates: ExitCandidate[] };

/** Colonnes de note et d'accords lues avec chaque vin ; facultatives pour les lignes construites à la main. */
interface RatingColumns { rating?: number | null; ratedAt?: Date | null; ratedBy?: string | null }
interface PairingColumns {
  pairingStatus?: string | null;
  pairingDishes?: string[] | null;
  pairingError?: string | null;
  pairingGeneratedAt?: Date | null;
}

/** Provenance d'une vignette trouvée sur le web : montrée sur la fiche seulement. */
interface ReferenceSourceColumns { referencePhotoSource?: string | null; referencePhotoSourceUrl?: string | null }

/**
 * Ligne lue en base : la ligne publique (région déjà publiée) plus ce qu'il faut
 * pour estimer l'apogée et la région, la note et les accords. `refRegion` : région
 * du référentiel, qui sert aussi à la qualité du millésime.
 */
export type CaveDbRow = CaveRow & Omit<ApogeeWineInput, 'vintage' | 'color' | 'region'> & RegionInput & RatingColumns & PairingColumns & ReferenceSourceColumns;

export interface Rating { value: number; ratedAt: Date; ratedBy: string | null }

/** `places` : endroits du vin, seulement dans la liste « à boire en priorité ». */
export type CaveItem = CaveRow & { apogee: Apogee; rating: Rating | null; matchedDish?: string; places?: Place[] };

export function ratingOf(row: CaveDbRow): Rating | null {
  return row.rating == null || row.ratedAt == null ? null : { value: Number(row.rating), ratedAt: row.ratedAt, ratedBy: row.ratedBy ?? null };
}

/** Apogée d'une ligne lue en base : partagé par la liste, la fiche et les statistiques. */
export function apogeeOf(row: CaveDbRow, rules: CompiledApogeeRules, currentYear: number): Apogee {
  return estimateApogee(
    {
      vintage: row.vintage, color: row.color, appellationId: row.appellationId ?? null, region: row.refRegion ?? null,
      referenceGuardMin: row.referenceGuardMin ?? null, referenceGuardMax: row.referenceGuardMax ?? null,
      apogeeMin: row.apogeeMin ?? null, apogeeMax: row.apogeeMax ?? null, apogeeSource: row.apogeeSource ?? null,
      aiGuardMin: row.aiGuardMin ?? null, aiGuardMax: row.aiGuardMax ?? null, firstEntryYear: row.firstEntryYear ?? null,
    },
    rules, currentYear,
  );
}

export interface PairingView { status: string; dishes: string[]; errorMessage: string | null; generatedAt: Date | null }

export function pairingOf(row: CaveDbRow): PairingView | null {
  return row.pairingStatus
    ? { status: row.pairingStatus, dishes: row.pairingDishes ?? [], errorMessage: row.pairingError ?? null, generatedAt: row.pairingGeneratedAt ?? null }
    : null;
}

function toItem(row: CaveDbRow, rules: CompiledApogeeRules, currentYear: number): CaveItem {
  const {
    /* eslint-disable @typescript-eslint/no-unused-vars -- champs internes retirés de la réponse */
    appellationId, referenceGuardMin, referenceGuardMax, apogeeMin, apogeeMax, apogeeSource,
    refRegion, aiRegion, aiGuardMin, aiGuardMax, firstEntryYear, traitsManual,
    rating, ratedAt, ratedBy, pairingStatus, pairingDishes, pairingError, pairingGeneratedAt,
    referencePhotoSource, referencePhotoSourceUrl,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    ...pub
  } = row;
  return {
    ...pub,
    region: row.region ?? null,
    regionSource: row.regionSource ?? null,
    country: countryOf(row),
    tannin: row.tannin ?? null,
    aromas: row.aromas ?? [],
    producerKey: producerKeyOf(row.producer),
    apogee: apogeeOf(row, rules, currentYear),
    rating: ratingOf(row),
  };
}

/**
 * Écritures qui ne renvoient qu'un champ de `wine` : la cote n'est pas lue. Le
 * rôle reste OWNER, car l'auteur de la note est alors l'e-mail à défaut de nom.
 */
const NO_QUOTE = { withQuote: false } as const;

const TASTED_SELECT = { id: true, dish: true, dishId: true, good: true, createdAt: true } as const;

@Injectable()
export class CaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: ApogeeRulesService,
    private readonly locations: LocationsService,
  ) {}

  /**
   * Tous les vins avec leur stock. Lu en une requête puis filtré en mémoire : la
   * cave compte quelques centaines de références, et le filtre se teste ainsi
   * sans base. Seulement les vins de la cave `caveId` (la vue stock_courant
   * n'a pas de cave : elle est jointe par le vin). L'auteur d'une note est
   * nommé par son nom affiché ; l'OWNER voit l'e-mail à défaut de nom, un
   * VIEWER (rôle par défaut, le plus restrictif) jamais. La région est publiée
   * ici (`publishedRegion`), avant tout filtre.
   */
  async allWithStock(caveId: string, role: CaveRole = 'VIEWER'): Promise<CaveDbRow[]> {
    const ratedBy = role === 'OWNER' ? Prisma.sql`COALESCE(u.display_name, u.email)` : Prisma.sql`u.display_name`;
    // Première entrée : premier mouvement IN non annulé, à défaut la création du vin (point de départ de la garde IA d'un non-millésimé).
    // occurred_at et created_at sont des `timestamp` sans fuseau, en UTC : EXTRACT donne l'année UTC quel que soit le fuseau de session
    // (un `AT TIME ZONE 'UTC'` en ferait un timestamptz, relu au fuseau de session).
    const rows = await this.prisma.$queryRaw<CaveDbRow[]>`
      SELECT w.id, w.producer, w.cuvee, w.appellation_raw AS "appellationRaw", w.vintage,
             w.color::TEXT AS color, w.format_cl AS "formatCl", w.reference_photo_id AS "referencePhotoId", w.created_at AS "createdAt",
             COALESCE(s.quantity, 0)::INTEGER AS quantity,
             w.appellation_id AS "appellationId", a.region AS "refRegion",
             a.guard_min_years AS "referenceGuardMin", a.guard_max_years AS "referenceGuardMax",
             w.apogee_min AS "apogeeMin", w.apogee_max AS "apogeeMax", w.apogee_source AS "apogeeSource"
             , w.rating::FLOAT8 AS rating, w.rated_at AS "ratedAt", ${ratedBy} AS "ratedBy",
             p.status::TEXT AS "pairingStatus", p.dishes AS "pairingDishes", p.error_message AS "pairingError",
             p.generated_at AS "pairingGeneratedAt",
             w.reference_photo_source AS "referencePhotoSource", w.reference_photo_source_url AS "referencePhotoSourceUrl",
             t.tannin, t.aromas, t.country, t.region AS "aiRegion", t.guard_min AS "aiGuardMin", t.guard_max AS "aiGuardMax",
             t.manual_fields AS "traitsManual",
             EXTRACT(YEAR FROM COALESCE((SELECT MIN(m.occurred_at) FROM movement m WHERE m.wine_id = w.id AND m.type = 'IN'
               AND NOT EXISTS (SELECT 1 FROM movement r WHERE r.reverses_id = m.id)), w.created_at))::INT AS "firstEntryYear"
      FROM wine w
      LEFT JOIN stock_courant s ON s.wine_id = w.id
      LEFT JOIN appellation a ON a.id = w.appellation_id
      LEFT JOIN app_user u ON u.id = w.rated_by
      LEFT JOIN pairing p ON p.wine_id = w.id
      LEFT JOIN wine_traits t ON t.wine_id = w.id
      WHERE w.cave_id = ${caveId}
      ORDER BY w.producer ASC, w.vintage ASC NULLS FIRST`;
    return rows.map((r) => ({ ...r, ...publishedRegion(r) }));
  }

  async list(caveId: string, filter: CaveFilter, role: CaveRole = 'VIEWER'): Promise<CaveItem[]> {
    // Un emplacement d'une autre cave est « introuvable », comme un identifiant inconnu.
    if (filter.location && filter.location !== 'none') await this.locations.findOwn(caveId, filter.location);
    const [rows, rules, atPlace] = await Promise.all([
      this.allWithStock(caveId, role),
      this.rules.load(),
      filter.location ? this.locations.wineIdsAt(caveId, filter.location) : null,
    ]);
    const year = new Date().getFullYear();
    const kept = filterCave(atPlace ? rows.filter((r) => atPlace.has(r.id)) : rows, filter);
    let items = kept.map((r) => toItem(r, rules, year));
    if (filter.drinkSoon) {
      items = sortByApogeeEnd(items.filter((i) => isDrinkSoon(i.apogee, year)));
      // « À boire prochainement » regroupe ces vins par emplacement : où descendre les chercher.
      const places = await this.locations.placesByWine(caveId, items.map((i) => i.id));
      items = items.map((i) => ({ ...i, places: places.get(i.id) ?? [] }));
    }
    else if (filter.noApogee) items = items.filter((i) => i.apogee.max == null);
    if (filter.dish) {
      const dishesById = new Map(kept.map((r) => [r.id, r.pairingDishes ?? null]));
      const query = filter.dish;
      items = items.flatMap((i) => {
        const matchedDish = matchDish(dishesById.get(i.id), query);
        return matchedDish ? [{ ...i, matchedDish }] : [];
      });
      // Pour un plat, les bouteilles à boire en priorité passent devant.
      const soon = sortByApogeeEnd(items.filter((i) => isDrinkSoon(i.apogee, year)));
      items = [...soon, ...items.filter((i) => !isDrinkSoon(i.apogee, year))];
    }
    return items;
  }

  /**
   * Dernière bouteille ouverte : la plus récente sortie (OUT, la consommation —
   * ni correction d'inventaire ni déplacement) qui n'est pas une annulation et
   * n'a pas été annulée. Null sans sortie.
   */
  private async lastOpenedAt(wineId: string): Promise<Date | null> {
    const reversals = await this.prisma.movement.findMany({ where: { wineId, reversesId: { not: null } }, select: { reversesId: true } });
    const last = await this.prisma.movement.findFirst({
      where: { wineId, type: 'OUT', reversesId: null, id: { notIn: reversals.map((r) => r.reversesId!) } },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    return last?.occurredAt ?? null;
  }

  /** Fiche d'un vin de la cave ; un vin d'une autre cave est « introuvable », comme un identifiant inconnu. */
  async detail(caveId: string, id: string, role: CaveRole = 'VIEWER', { withQuote = true }: { withQuote?: boolean } = {}) {
    const [rows, rules] = await Promise.all([this.allWithStock(caveId, role), this.rules.load()]);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new NotFoundException('Vin introuvable');
    const producerKey = producerKeyOf(row.producer);
    const locations = await this.locations.stockByLocation(caveId, id);
    const [movements, profile, exitDefault, quotes, traits, lastOpenedAt, tastedPairings] = await Promise.all([
      this.prisma.movement.findMany({
        where: { wineId: id },
        orderBy: { occurredAt: 'desc' },
        take: 10,
        select: {
          id: true, delta: true, type: true, occurredAt: true, note: true, reversesId: true, locationId: true,
          location: { select: { id: true, zoneId: true, zone: { select: { name: true, cellNames: true } }, casier: true, position: true } },
        },
      }),
      // Un descriptif par domaine, partagé par tous ses vins : lien par la clé normalisée.
      producerKey ? this.prisma.producerProfile.findUnique({ where: { producerKey }, include: PRODUCER_PROFILE_INCLUDE }) : null,
      // Emplacements : visibles du membre comme du propriétaire (ce ne sont pas des prix).
      this.locations.exitDefault(caveId, id, undefined, locations),
      // Cote : un prix, jamais lue pour un membre.
      role === 'OWNER' && withQuote ? this.prisma.priceQuote.findMany({ where: { wineId: id }, select: QUOTE_SELECT }) : null,
      this.prisma.wineTraits.findUnique({ where: { wineId: id } }),
      this.lastOpenedAt(id),
      this.prisma.tastedPairing.findMany({ where: { wineId: id }, orderBy: { createdAt: 'desc' }, select: TASTED_SELECT }),
    ]);
    let cote: { quote: QuoteView | null; searchLinks: SearchLink[]; idealwineUrl: string; savedUrl: string | null } | undefined;
    if (quotes) {
      const current = currentQuote(quotes);
      const savedUrl = savedSourceUrl(quotes);
      cote = {
        quote: current && quoteView(current),
        searchLinks: searchLinks(row, savedUrl),
        // Compatibilité (client encore en cache) : page iDealwine enregistrée, sinon leur recherche.
        idealwineUrl: savedUrl && quoteSiteOf(savedUrl)?.site === 'idealwine' ? savedUrl : idealwineSearchUrl(row),
        savedUrl,
      };
    }
    return {
      wine: {
        ...toItem(row, rules, new Date().getFullYear()),
        pairing: pairingOf(row),
        // Vignette trouvée sur le web : « Image : {source} » (lien) sous la vignette ; null pour une photo de l'utilisateur.
        referencePhotoSource: row.referencePhotoSource ?? null,
        referencePhotoSourceUrl: row.referencePhotoSourceUrl ?? null,
        // Toujours présente (sauf nom sans lettre ni chiffre) : la fiche peut écrire ou régénérer avant tout profil.
        producerKey: producerKey || null,
        producerProfile: producerProfileOf(profile, role),
        traits: traits && { status: traits.status, tannin: traits.tannin, aromas: traits.aromas, grapes: traits.grapes, country: traits.country, region: traits.region, manualFields: traits.manualFields },
      },
      movements: movements.map(({ location, ...m }) => ({ ...m, locationLabel: location ? labelOf(partsOf(location)) : null })),
      /** Date de la dernière sortie (consommation) non annulée, null s'il n'y en a pas : « Dernière bouteille ouverte en … ». */
      lastOpenedAt,
      /** Accords vécus du vin, le plus récent d'abord. */
      tastedPairings,
      /** Endroits du vin et leur quantité (> 0) ; « Sans emplacement » : id null, en dernier. */
      locations,
      /** Endroit pré-sélectionné à la sortie : id, null = « Sans emplacement », absent = plus de stock. */
      exitDefault,
      /**
       * Propriétaire seulement : cote courante (null sans cote) et `searchLinks`,
       * un lien « Voir sur … » par site (recherche du vin, ou page enregistrée
       * pour le site qui l'héberge) ; `savedUrl` : la page enregistrée de la cote
       * courante, sinon de la plus récente cote qui en a une (null sans lien),
       * pour pré-remplir le formulaire ; `idealwineUrl` : ancien lien unique,
       * gardé pour un client en cache. Pour un membre, ces clés sont absentes,
       * pas nulles.
       */
      ...cote,
    };
  }

  async exitCandidates(caveId: string, photoId: string): Promise<ExitCandidatesResponse> {
    const photo = await this.prisma.photo.findFirst({ where: { id: photoId, caveId } });
    if (!photo) throw new NotFoundException('Photo introuvable');
    if (photo.status === 'PENDING' || photo.status === 'PROCESSING') return { status: photo.status };
    if (photo.status === 'FAILED') return { status: 'FAILED', errorMessage: photo.errorMessage ?? null };

    let read: ExitRead;
    try {
      const e = parseExtraction(photo.rawExtraction);
      read = { producer: e.producer.value, cuvee: e.cuvee.value, appellation: e.appellation.value, vintage: e.vintage.value };
    } catch {
      // Un prix faux est pire qu'un prix absent ; une sortie fausse aussi : une
      // lecture inexploitable renvoie vers la liste, jamais vers un vin deviné.
      return { status: 'FAILED', errorMessage: 'Lecture de l’étiquette inexploitable' };
    }
    const inStock = (await this.allWithStock(caveId))
      .filter((r) => r.quantity > 0)
      .map((r) => ({
        wine: { id: r.id, producer: r.producer, cuvee: r.cuvee, appellationRaw: r.appellationRaw, vintage: r.vintage, color: r.color, formatCl: r.formatCl },
        quantity: r.quantity,
        referencePhotoId: r.referencePhotoId,
      }));
    return { status: 'DONE', read, ...rankExitCandidates(read, inStock) };
  }

  async setManualApogee(caveId: string, id: string, input: ManualApogeeInput): Promise<Apogee> {
    await this.updateWine(caveId, id, { apogeeMin: input.min, apogeeMax: input.max, apogeeSource: 'MANUEL' });
    return (await this.detail(caveId, id, 'OWNER', NO_QUOTE)).wine.apogee;
  }

  async clearManualApogee(caveId: string, id: string): Promise<Apogee> {
    await this.updateWine(caveId, id, { apogeeMin: null, apogeeMax: null, apogeeSource: null });
    return (await this.detail(caveId, id, 'OWNER', NO_QUOTE)).wine.apogee;
  }

  async setRating(caveId: string, id: string, value: number, userId: string): Promise<Rating | null> {
    await this.updateWine(caveId, id, { rating: value, ratedAt: new Date(), ratedById: userId });
    return (await this.detail(caveId, id, 'OWNER', NO_QUOTE)).wine.rating;
  }

  /**
   * Correction manuelle : chaque clé présente rejoint `manualFields` (la génération
   * ne l'écrase plus) et la réservation est levée, pour qu'un lot en cours
   * n'écrase pas la correction. Sans ligne, elle est créée en attente.
   */
  async setTraits(caveId: string, id: string, input: TraitsInput) {
    if (!(await this.prisma.wine.findFirst({ where: { id, caveId }, select: { id: true } }))) throw new NotFoundException('Vin introuvable');
    // Région et pays restent cohérents : une région rend le vin français, un pays étranger efface la région (les deux deviennent manuels).
    if (input.region != null) input = { ...input, country: 'FR' };
    else if (input.country === 'AUTRE') input = { ...input, region: null };
    const edited = (['tannin', 'aromas', 'grapes', 'country', 'region'] as const).filter((k) => input[k] !== undefined);
    const fields = Object.fromEntries(edited.map((k) => [k, input[k]])) as Pick<TraitsInput, (typeof edited)[number]>;
    const current = await this.prisma.wineTraits.findUnique({ where: { wineId: id }, select: { manualFields: true } });
    const manualFields = [...new Set([...(current?.manualFields ?? []), ...edited])];
    const t = await this.prisma.wineTraits.upsert({
      where: { wineId: id },
      create: { wineId: id, ...fields, manualFields },
      update: { ...fields, manualFields, reservedUntil: null },
    });
    return { status: t.status, tannin: t.tannin, aromas: t.aromas, grapes: t.grapes, country: t.country, region: t.region, manualFields: t.manualFields };
  }

  async addTastedPairing(caveId: string, wineId: string, input: TastedPairingInput) {
    if (!(await this.prisma.wine.findFirst({ where: { id: wineId, caveId }, select: { id: true } }))) throw new NotFoundException('Vin introuvable');
    return this.prisma.tastedPairing.create({ data: { wineId, ...input }, select: TASTED_SELECT });
  }

  async deleteTastedPairing(caveId: string, id: string): Promise<null> {
    const { count } = await this.prisma.tastedPairing.deleteMany({ where: { id, wine: { caveId } } });
    if (count === 0) throw new NotFoundException('Accord introuvable');
    return null;
  }

  /**
   * Accords vécus de la cave sur une entrée de la base, le plus récent d'abord,
   * avec l'appellation et la couleur du vin : le client en tire bonus et malus.
   */
  async tastedPairings(caveId: string) {
    const rows = await this.prisma.tastedPairing.findMany({
      where: { wine: { caveId }, dishId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { wineId: true, dishId: true, good: true, wine: { select: { appellationRaw: true, color: true } } },
    });
    return rows.map(({ wine, ...t }) => ({ ...t, appellation: wine.appellationRaw, color: wine.color }));
  }

  async clearRating(caveId: string, id: string): Promise<null> {
    await this.updateWine(caveId, id, { rating: null, ratedAt: null, ratedById: null });
    return null;
  }

  /** Écrit sur un vin de la cave seulement : la condition de cave est vérifiée par la base au moment de l'écriture. */
  private async updateWine(caveId: string, id: string, data: Prisma.WineUncheckedUpdateManyInput) {
    const { count } = await this.prisma.wine.updateMany({ where: { id, caveId }, data });
    if (count === 0) throw new NotFoundException('Vin introuvable');
  }
}
