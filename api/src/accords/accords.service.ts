import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { Apogee } from '../apogee/apogee';
import { CaveItem, CaveService } from '../cave/cave.service';
import { LocationsService } from '../locations/locations.service';
import { statusFromMessage } from '../queue/transient-failure';
import { CaveBudgetShareExceededError, PAIRING_BUDGET_SHARE, VisionBudgetExceededError, VisionBudgetService } from '../queue/vision-budget.service';
import { GeminiJournal, GeminiPausedError } from '../vision/gemini-journal';
import { DISH_PAIRING_PROVIDER, DishPairingProvider } from '../vision/pairing-provider.interface';

/** Corps de `POST /api/accords`. */
export const accordsSchema = z.object({
  dish: z
    .string({ required_error: 'Indiquez le plat', invalid_type_error: 'Indiquez le plat' })
    .trim()
    .min(1, 'Indiquez le plat')
    .max(200, 'Le plat tient en 200 caractères au plus'),
});

/** Vins envoyés au modèle au plus : au-delà, les moins pressés à boire sont laissés de côté. */
export const MAX_WINES = 300;
export const MAX_PICKS = 5;
export const MAX_REASON = 120;
const MAX_UNDERSTOOD = 4;
const MAX_CHIP = 40;

const UNAVAILABLE = 'Accords indisponibles pour le moment, réessayez dans un instant';
const INVALID_ANSWER = 'L’IA n’a pas su répondre, réessayez';
const CAVE_SHARE_REACHED = 'Part mensuelle de cette cave atteinte — accords possibles le mois prochain';
const QUOTA_EXHAUSTED = 'Accords impossibles : quota Gemini épuisé';

export interface AccordPick {
  wineId: string;
  producer: string;
  cuvee: string | null;
  appellation: string;
  vintage: number | null;
  color: string;
  quantity: number;
  /** Emplacement qui tient le plus de bouteilles, null s'il n'y en a aucun. */
  place: string | null;
  apogee: Apogee;
  score: number;
  reason: string;
}

export interface AccordsResponse {
  dish: string;
  /** Vins en stock dans la cave : 0 = cave vide (aucun appel à l'IA). */
  wineCount: number;
  understood: string[];
  ideal: string | null;
  picks: AccordPick[];
}

/** À boire d'abord : apogée passée, dernière année, à boire, sans estimation, trop jeune. */
const RANK: Record<string, number> = { PASSEE: 0, A_BOIRE_VITE: 1, A_BOIRE: 2, TROP_JEUNE: 4 };
const rankOf = (a: Apogee) => (a.status ? RANK[a.status] : 3);
export const byApogeePriority = (a: { apogee: Apogee }, b: { apogee: Apogee }) =>
  rankOf(a.apogee) - rankOf(b.apogee) || (a.apogee.max ?? Infinity) - (b.apogee.max ?? Infinity);

const apogeeText = (a: Apogee) => (a.min == null || a.max == null ? null : `${a.min}-${a.max}`);

/** Réponse du modèle, lue avec tolérance : un champ mal formé est vide, un choix mal formé est ignoré. */
const outputSchema = z.object({
  compris: z.array(z.unknown()).catch([]),
  ideal: z.unknown(),
  choix: z.array(z.unknown()).catch([]),
});
const choiceSchema = z.object({ vin: z.number().int(), score: z.number(), raison: z.string().catch('') });

/**
 * Ne garde que les numéros de la liste envoyée (1 à n), une fois chacun ;
 * classe par score puis par priorité d'apogée ; au plus 5.
 */
export function rankPicks<T extends { apogee: Apogee }>(raw: unknown, sent: T[]): { understood: string[]; ideal: string | null; picks: Array<{ wine: T; score: number; reason: string }> } | null {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const understood = parsed.data.compris
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim().slice(0, MAX_CHIP))
    .slice(0, MAX_UNDERSTOOD);
  const ideal = typeof parsed.data.ideal === 'string' && parsed.data.ideal.trim() ? parsed.data.ideal.trim() : null;
  const seen = new Set<number>();
  const picks: Array<{ wine: T; score: number; reason: string }> = [];
  for (const c of parsed.data.choix) {
    const choice = choiceSchema.safeParse(c);
    if (!choice.success) continue;
    const { vin, score, raison } = choice.data;
    if (vin < 1 || vin > sent.length || seen.has(vin)) continue;
    seen.add(vin);
    picks.push({ wine: sent[vin - 1], score: Math.round(Math.min(100, Math.max(0, score))), reason: raison.trim().slice(0, MAX_REASON) });
  }
  picks.sort((a, b) => b.score - a.score || byApogeePriority(a.wine, b.wine));
  return { understood, ideal, picks: picks.slice(0, MAX_PICKS) };
}

/**
 * « Accords vins » : un plat, les vins en stock de la cave courante, un appel
 * Gemini (journal, quotas, bascule de modèle et pause commune par le
 * fournisseur ; plafond et part de la cave vérifiés ici). Une panne de l'IA
 * rend un 503 au message lisible, jamais une erreur brute.
 */
@Injectable()
export class AccordsService {
  private readonly logger = new Logger(AccordsService.name);

  constructor(
    private readonly cave: CaveService,
    private readonly locations: LocationsService,
    private readonly budget: VisionBudgetService,
    private readonly journal: GeminiJournal,
    @Inject(DISH_PAIRING_PROVIDER) private readonly provider: DishPairingProvider,
  ) {}

  async suggest(caveId: string, dish: string): Promise<AccordsResponse> {
    const inStock = await this.cave.list(caveId, {});
    if (inStock.length === 0) return { dish, wineCount: 0, understood: [], ideal: null, picks: [] };
    const sent = [...inStock].sort(byApogeePriority).slice(0, MAX_WINES);

    await this.assertBudget(caveId);
    let raw: unknown;
    try {
      ({ raw } = await this.provider.pairDish(
        dish,
        sent.map((w) => ({ producer: w.producer, cuvee: w.cuvee, appellation: w.appellationRaw, color: w.color, vintage: w.vintage, apogee: apogeeText(w.apogee) })),
      ));
    } catch (e) {
      throw await this.unavailable(e);
    }
    // ponytail: dépense non enregistrée (≈ 0 ct par appel, arrondie) ; table de coûts dédiée si le volume grossit.
    const ranked = rankPicks(raw, sent);
    if (!ranked) throw new ServiceUnavailableException(INVALID_ANSWER);

    const places = await this.locations.placesByWine(caveId, ranked.picks.map((p) => p.wine.id));
    return {
      dish,
      wineCount: inStock.length,
      understood: ranked.understood,
      ideal: ranked.ideal,
      picks: ranked.picks.map(({ wine, score, reason }) => toPick(wine, score, reason, mainPlace(places.get(wine.id)))),
    };
  }

  private async assertBudget(caveId: string): Promise<void> {
    try {
      await this.budget.assertUnderShare(PAIRING_BUDGET_SHARE);
      await this.budget.assertCaveUnderShare(caveId);
    } catch (e) {
      if (e instanceof CaveBudgetShareExceededError) throw new ServiceUnavailableException(CAVE_SHARE_REACHED);
      if (e instanceof VisionBudgetExceededError) throw new ServiceUnavailableException(UNAVAILABLE);
      throw e;
    }
  }

  /** Pause commune ou limite atteinte : son message (jusqu'à quand) ; 429 : la pause que le journal vient de poser. */
  private async unavailable(e: unknown): Promise<ServiceUnavailableException> {
    const message = e instanceof Error ? e.message : String(e);
    this.logger.warn(`Accords pour un plat impossibles : ${message}`);
    if (e instanceof GeminiPausedError) return new ServiceUnavailableException(e.message);
    if (statusFromMessage(message) === 429) {
      const pause = await this.journal.currentPause().catch(() => null);
      return new ServiceUnavailableException(pause ? new GeminiPausedError(pause.until, pause.reason).message : QUOTA_EXHAUSTED);
    }
    if (message.startsWith('Sortie du modèle invalide')) return new ServiceUnavailableException(INVALID_ANSWER);
    return new ServiceUnavailableException(UNAVAILABLE);
  }
}

function mainPlace(places: Array<{ label: string; quantity: number }> | undefined): string | null {
  if (!places?.length) return null;
  return places.reduce((best, p) => (p.quantity > best.quantity ? p : best)).label;
}

function toPick(w: CaveItem, score: number, reason: string, place: string | null): AccordPick {
  return {
    wineId: w.id, producer: w.producer, cuvee: w.cuvee, appellation: w.appellationRaw, vintage: w.vintage, color: w.color,
    quantity: w.quantity, place, apogee: w.apogee, score, reason,
  };
}
