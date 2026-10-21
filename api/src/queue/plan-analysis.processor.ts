import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PHOTO_STORAGE_DIR } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { VISION_PROVIDER, VisionProvider } from '../vision/vision-provider.interface';
import { nameBlocks, validBlocks } from '../zones/plan-suggestions';
import { PlanService } from '../zones/plan.service';
import { PlanAnalysisJobData } from './plan-analysis';
import { isTransientVisionFailure } from './transient-failure';
import { VisionBudgetService } from './vision-budget.service';

/**
 * Cadres de Gemini (`box_2d` : [ymin, xmin, ymax, xmax], entiers de 0 à 1000,
 * sa convention native) ramenés à `box` : [x0, y0, x1, y1] en fractions de
 * l'image. Le reste du bloc est gardé tel quel ; tout est validé ensuite par
 * `validBlocks` (un cadre absent ou mal formé y est écarté).
 */
export function fromGeminiBlocks(blocks: unknown[]): unknown[] {
  return blocks.map((b) => {
    const box2d = (b as { box_2d?: unknown } | null)?.box_2d;
    if (!Array.isArray(box2d) || box2d.length !== 4) return b;
    const [ymin, xmin, ymax, xmax] = box2d.map((v) => (typeof v === 'number' ? v / 1000 : NaN));
    return { ...(b as object), box: [xmin, ymin, xmax, ymax] };
  });
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

  async process({ planId, updatedAt }: PlanAnalysisJobData, isLastAttempt = true): Promise<void> {
    const expected = new Date(updatedAt);
    const plan = await this.prisma.cavePlan.findUnique({ where: { id: planId } });
    // Plan supprimé, ou photo remplacée : la tâche de la nouvelle photo s'en charge.
    if (!plan || plan.updatedAt.getTime() !== expected.getTime()) return;

    try {
      await this.budget.assertUnderCap();
      await this.budget.assertCaveUnderShare(plan.caveId);
      const image = await readFile(join(this.dir, plan.path));
      const output = await this.vision.analyzePlan(image, 'image/jpeg');
      await this.charge(plan.caveId, output.costCents);
      if (!Array.isArray(output.blocks)) {
        this.logger.warn(`Analyse du plan ${planId} échouée : réponse sans liste de blocs`);
        await this.plans.setAnalysis(planId, expected, { status: 'FAILED' });
        return;
      }
      const zones = await this.prisma.caveZone.findMany({ where: { caveId: plan.caveId, archivedAt: null }, select: { name: true } });
      const suggestions = nameBlocks(validBlocks(fromGeminiBlocks(output.blocks)), zones.map((z) => z.name));
      await this.plans.setAnalysis(planId, expected, { status: 'DONE', suggestions });
    } catch (e) {
      // Image effacée entre-temps : plan supprimé pendant la lecture.
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      // Sortie inexploitable mais facturée : son coût est porté par l'erreur.
      await this.charge(plan.caveId, (e as { costCents?: unknown }).costCents);
      const message = e instanceof Error ? e.message : String(e);
      const transient = isTransientVisionFailure(e);
      this.logger.warn(`Analyse du plan ${planId} ${transient && !isLastAttempt ? 'reportée' : 'échouée'} : ${message}`);
      if (transient && !isLastAttempt) throw e;
      // Dernière tentative (ou erreur définitive), y compris après l'appel : jamais de plan laissé en attente.
      await this.plans.setAnalysis(planId, expected, { status: 'FAILED' });
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
