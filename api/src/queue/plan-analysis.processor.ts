import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PHOTO_STORAGE_DIR } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiPausedError, GeminiQuotaError } from '../vision/gemini-pause';
import { VISION_PROVIDER, VisionProvider } from '../vision/vision-provider.interface';
import { nameBlocks, unitsToBlocks, validBlocks } from '../zones/plan-suggestions';
import { PlanService } from '../zones/plan.service';
import { PlanFailedReason } from '../zones/zone';
import { PlanAnalysisDeferral, PlanAnalysisJobData, QuotaKind } from './plan-analysis';
import { isConfigurationError, isTransientVisionFailure, statusFromMessage, TRANSIENT_NETWORK } from './transient-failure';
import { VisionBudgetExceededError, VisionBudgetService } from './vision-budget.service';

/** Cause d'un report, affichée tant que la tâche attend sa reprise. */
export function deferralOf(error: unknown): PlanAnalysisDeferral {
  if (error instanceof GeminiQuotaError) {
    return { waiting: 'QUOTA', pauseUntil: error.until.toISOString(), quotaKind: error.reason.replace('QUOTA_', '') as QuotaKind, quotaLimit: error.limit };
  }
  if (error instanceof GeminiPausedError && error.reason === 'QUOTA_GOOGLE') {
    return { waiting: 'QUOTA', pauseUntil: error.until.toISOString(), quotaKind: 'GOOGLE', quotaLimit: null };
  }
  if (error instanceof GeminiPausedError) return { waiting: 'GEMINI_PAUSE', pauseUntil: error.until.toISOString() };
  if (error instanceof VisionBudgetExceededError) return { waiting: 'BUDGET', pauseUntil: null };
  return { waiting: 'RETRY', pauseUntil: null };
}

/**
 * Raison d'un échec : budget, réponse inexploitable, demande refusée par Gemini
 * (400, 403, 404… : tout 4xx hors 429), Gemini (pause commune, quota,
 * saturation, clé ou API mal configurées, service injoignable), sinon autre erreur.
 */
export function failedReasonOf(error: unknown): PlanFailedReason {
  if (error instanceof VisionBudgetExceededError) return 'BUDGET';
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Sortie du modèle invalide')) return 'ILLISIBLE';
  if (error instanceof GeminiPausedError) return 'GEMINI';
  const status = statusFromMessage(message);
  if (status !== null && status >= 400 && status < 500 && status !== 429) return 'REFUS';
  if (status !== null || isConfigurationError(error)) return 'GEMINI';
  if (TRANSIENT_NETWORK.some((needle) => message.includes(needle))) return 'GEMINI';
  return 'ERREUR';
}

// Fichier séparé de la file (plan-analysis.ts) : PlanService importe la file, le traitement importe PlanService.
/**
 * Analyse de la photo d'un plan par Gemini : propositions de zones. Jamais
 * d'erreur visible ailleurs que dans l'état du plan (`analysis_status`).
 */
@Injectable()
export class PlanAnalysisProcessor {
  private readonly logger = new Logger(PlanAnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    @Inject(VISION_PROVIDER) private readonly vision: Pick<VisionProvider, 'analyzePlan'>,
    private readonly budget: VisionBudgetService,
    @Inject(PHOTO_STORAGE_DIR) private readonly dir: string,
  ) {}

  /**
   * `defer` : enregistre sur la tâche la cause d'un report (voir worker.ts) ;
   * son échec n'empêche jamais le report.
   */
  async process(
    { planId, requestedAt, updatedAt }: PlanAnalysisJobData, isLastAttempt = true, defer: (cause: PlanAnalysisDeferral) => Promise<unknown> = async () => undefined,
  ): Promise<void> {
    // Tâche d'avant la 2.17.0 : `updatedAt`, recopiée par la migration dans `analysis_requested_at`.
    const expected = new Date(requestedAt ?? updatedAt ?? NaN);
    const plan = await this.prisma.cavePlan.findUnique({ where: { id: planId } });
    // Plan supprimé, photo remplacée ou analyse relancée : la tâche de la nouvelle demande s'en charge.
    if (!plan || plan.analysisRequestedAt.getTime() !== expected.getTime()) return;

    try {
      await this.budget.assertUnderCap();
      await this.budget.assertCaveUnderShare(plan.caveId);
      const image = await readFile(join(this.dir, plan.path));
      const output = await this.vision.analyzePlan(image, 'image/jpeg');
      await this.charge(plan.caveId, output.costCents);
      if (!Array.isArray(output.units)) {
        this.logger.warn(`Analyse du plan ${planId} échouée : réponse sans liste de meubles`);
        await this.plans.setAnalysis(planId, expected, { status: 'FAILED', reason: 'ILLISIBLE' });
        return;
      }
      const zones = await this.prisma.caveZone.findMany({ where: { caveId: plan.caveId, archivedAt: null }, select: { name: true, cellPrefix: true } });
      const suggestions = nameBlocks(
        validBlocks(unitsToBlocks(output.units)), zones.map((z) => z.name), zones.flatMap((z) => (z.cellPrefix ? [z.cellPrefix] : [])),
      );
      await this.plans.setAnalysis(planId, expected, { status: 'DONE', suggestions });
    } catch (e) {
      // Image absente : plan supprimé pendant la lecture (setAnalysis sans effet), ou fichier manquant sur un plan qui existe (FAILED, pas d'attente éternelle).
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.plans.setAnalysis(planId, expected, { status: 'FAILED', reason: 'IMAGE' });
        return;
      }
      // Sortie inexploitable mais facturée : son coût est porté par l'erreur.
      await this.charge(plan.caveId, (e as { costCents?: unknown }).costCents);
      const message = e instanceof Error ? e.message : String(e);
      const transient = isTransientVisionFailure(e);
      this.logger.warn(`Analyse du plan ${planId} ${transient && !isLastAttempt ? 'reportée' : 'échouée'} : ${message}`);
      if (transient && !isLastAttempt) {
        await defer(deferralOf(e)).catch((err: unknown) => this.logger.warn(`Cause du report du plan ${planId} non enregistrée : ${(err as Error).message}`));
        throw e;
      }
      // Dernière tentative (ou erreur définitive), y compris après l'appel : jamais de plan laissé en attente.
      await this.plans.setAnalysis(planId, expected, { status: 'FAILED', reason: failedReasonOf(e) });
      throw transient ? e : new UnrecoverableError(message);
    }
  }

  /**
   * Coût de l'appel imputé à la cave : la table des dépenses Gemini attribuables
   * à une cave hors photos et accords (`image_search_cost`, sans vin) est celle
   * que lit le budget par cave.
   */
  private async charge(caveId: string, costCents: unknown): Promise<void> {
    if (typeof costCents !== 'number' || !(costCents > 0)) return;
    await this.prisma.imageSearchCost.create({ data: { caveId, costCents: Math.ceil(costCents) } });
  }
}
