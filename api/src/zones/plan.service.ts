import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CavePlan, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CaveContextService } from '../caves/cave-context.service';
import { ImageNormalizationService } from '../photos/image-normalization.service';
import { PHOTO_STORAGE_DIR } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  enqueuePlanAnalysis, PLAN_ANALYSIS_QUEUE_TOKEN, PlanAnalysisJobData, PlanAnalysisJobState, planAnalysisJobState, QUEUED_STATE, withTimeout,
} from '../queue/plan-analysis';
import { PlanSuggestion } from './plan-suggestions';
import {
  ANALYSIS_IN_PROGRESS, PLAN_LIMIT, PLAN_MAX_COUNT, PLAN_MAX_SIDE, PLAN_NAME_TAKEN, PLAN_NOT_FOUND, PlanAnalysisInfo, PlanFailedReason, PlanMarker, PlanMeta,
  planPath, SUGGESTION_NOT_FOUND, ZONE_NAME_TAKEN, ZoneView, zoneView,
} from './zone';
import { placeImage, unlinkIgnoringMissing } from './zones.service';

/** Lecture de l'avancement dans Redis : au-delà, la valeur par défaut (GET plans ne tombe ni ne traîne jamais). */
const JOB_STATE_TIMEOUT_MS = 1000;

/** Détail de l'analyse ; `state` : avancement lu sur la tâche (défaut : QUEUED, première tentative). */
function analysisInfo(p: CavePlan, state: PlanAnalysisJobState = QUEUED_STATE): PlanAnalysisInfo {
  const since = p.updatedAt.toISOString();
  if (p.analysisStatus === 'PENDING') return { since, ...state };
  if (p.analysisStatus === 'FAILED') return { since, failedReason: (p.analysisError ?? 'ERREUR') as PlanFailedReason };
  return null;
}

const meta = (p: CavePlan, state?: PlanAnalysisJobState): PlanMeta => ({
  id: p.id, name: p.name, width: p.width, height: p.height, updatedAt: p.updatedAt.toISOString(),
  analysis: p.analysisStatus as PlanMeta['analysis'], suggestions: p.suggestions as unknown as PlanSuggestion[], analysisInfo: analysisInfo(p, state),
});

/** Nom déjà pris dans la cave (index unique sur lower(name)) : 409. */
function nameTaken(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(PLAN_NAME_TAKEN);
  throw e;
}

/**
 * Plans de la cave : jusqu'à 20 images (photo d'une pièce ou d'un schéma), chacune
 * avec son nom ; une zone porte au plus un repère, sur l'un d'eux. Un plan d'une
 * autre cave est « introuvable ».
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalization: ImageNormalizationService,
    private readonly caves: CaveContextService,
    @Inject(PHOTO_STORAGE_DIR) private readonly dir: string,
    @Inject(PLAN_ANALYSIS_QUEUE_TOKEN) private readonly analysisQueue: Pick<Queue<PlanAnalysisJobData>, 'add' | 'getJob' | 'client' | 'toKey'>,
  ) {}

  /**
   * Plans dans l'ordre de création, et repères des zones non archivées, dans
   * l'ordre d'affichage des zones, numérotés à partir de 1 sur chaque plan.
   * Analyse en attente : avancement lu sur sa tâche (voir `jobState`).
   */
  async list(caveId: string): Promise<{ plans: PlanMeta[]; markers: PlanMarker[] }> {
    const plans = await this.prisma.cavePlan.findMany({ where: { caveId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const zones = await this.prisma.caveZone.findMany({
      where: { caveId, archivedAt: null, planId: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const counts = new Map<string, number>();
    const markers = zones.map((z) => {
      const number = (counts.get(z.planId!) ?? 0) + 1;
      counts.set(z.planId!, number);
      return { zoneId: z.id, planId: z.planId!, name: z.name, number, x: z.planX!, y: z.planY! };
    });
    return { plans: await Promise.all(plans.map(async (p) => meta(p, p.analysisStatus === 'PENDING' ? await this.jobState(p) : undefined))), markers };
  }

  /** Avancement lu dans Redis ; injoignable, en erreur ou lent (> 1 s) : valeur par défaut, jamais d'erreur. */
  private async jobState(p: CavePlan): Promise<PlanAnalysisJobState> {
    try {
      return await withTimeout(planAnalysisJobState(this.analysisQueue, { planId: p.id, requestedAt: p.analysisRequestedAt.toISOString() }), JOB_STATE_TIMEOUT_MS);
    } catch (e) {
      this.logger.warn(`Avancement de l'analyse du plan ${p.id} illisible : ${(e as Error).message}`);
      return QUEUED_STATE;
    }
  }

  /**
   * Nouveau plan : image redressée selon l'EXIF, 2400 px au plus sur le grand
   * côté, JPEG, en `plans/<id>.jpg`. Sous verrou de la cave : la limite de 20
   * tient face à deux créations simultanées. Enregistré avant la mise en place
   * du fichier : un nom pris (409) annule tout, sans fichier laissé.
   */
  async create(caveId: string, name: string, input: Buffer): Promise<PlanMeta> {
    const id = randomUUID();
    const path = planPath(id);
    let saved: CavePlan | undefined;
    await placeImage(this.normalization.normalize(input, { maxSide: PLAN_MAX_SIDE }), this.dir, path, (place, size) =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM cave WHERE id = ${caveId} FOR UPDATE`;
        if ((await tx.cavePlan.count({ where: { caveId } })) >= PLAN_MAX_COUNT) throw new ConflictException(PLAN_LIMIT);
        const now = new Date();
        saved = await tx.cavePlan.create({
          data: {
            id, caveId, name, path, width: size.width, height: size.height, updatedAt: now, createdAt: now, analysisRequestedAt: now, analysisStatus: 'PENDING',
            suggestions: [],
          },
        });
        await place();
      }).catch(nameTaken));
    return this.analyze(saved!);
  }

  async rename(caveId: string, id: string, name: string): Promise<PlanMeta> {
    const { count } = await this.prisma.cavePlan.updateMany({ where: { id, caveId }, data: { name } }).catch(nameTaken);
    if (count === 0) throw new NotFoundException(PLAN_NOT_FOUND);
    return meta(await this.findOwn(caveId, id));
  }

  /**
   * Nouvelle image du plan, au même chemin ; les repères (fractions) sont
   * gardés. Mise en place et enregistrée sous verrou du plan : une suppression
   * simultanée passe avant (404, fichier temporaire effacé) ou après (elle
   * efface l'image).
   */
  async replaceImage(caveId: string, id: string, input: Buffer): Promise<PlanMeta> {
    const plan = await this.findOwn(caveId, id);
    let saved: CavePlan | undefined;
    await placeImage(this.normalization.normalize(input, { maxSide: PLAN_MAX_SIDE }), this.dir, plan.path, (place, size) =>
      this.prisma.$transaction(async (tx) => {
        await this.lockOwn(tx, caveId, id);
        await place();
        // Anciennes propositions effacées avec la date : elles ne survivent jamais à la photo.
        const now = new Date();
        saved = await tx.cavePlan.update({
          where: { id },
          data: { width: size.width, height: size.height, updatedAt: now, analysisRequestedAt: now, analysisStatus: 'PENDING', suggestions: [], analysisError: null },
        });
      }));
    return this.analyze(saved!);
  }

  /**
   * Supprime le plan ; ses zones (archivées comprises) sont gardées et perdent
   * leur repère, dans la même transaction. L'image n'est effacée qu'une fois la
   * transaction validée : un échec en base ne laisse jamais un plan sans image.
   */
  async remove(caveId: string, id: string): Promise<void> {
    const path = await this.prisma.$transaction(async (tx) => {
      const { path } = await this.lockOwn(tx, caveId, id);
      await tx.caveZone.updateMany({ where: { planId: id }, data: { planId: null, planX: null, planY: null } });
      await tx.cavePlan.delete({ where: { id } });
      return path;
    });
    await unlinkIgnoringMissing(join(this.dir, path));
  }

  /**
   * Accepte une proposition : crée la zone (fin de liste) avec son repère au
   * centre du cadre sur ce plan et sa grille, et retire la proposition, dans la
   * même transaction, sous verrou du plan. Deux acceptations simultanées de la
   * même proposition : la seconde attend le verrou, ne la trouve plus (404).
   * Nom pris : 409, rien n'est écrit.
   */
  async acceptSuggestion(caveId: string, id: string, sid: string, input: { name: string; rows: number; cols: number }): Promise<ZoneView> {
    return this.prisma.$transaction(async (tx) => {
      const { suggestions } = await this.lockOwn(tx, caveId, id);
      const s = suggestions.find((x) => x.id === sid);
      if (!s) throw new NotFoundException(SUGGESTION_NOT_FOUND);
      const last = await tx.caveZone.aggregate({ where: { caveId, archivedAt: null }, _max: { sortOrder: true } });
      const [x0, y0, x1, y1] = s.box;
      const zone = await tx.caveZone.create({
        data: {
          caveId, name: input.name, sortOrder: (last._max.sortOrder ?? -1) + 1, planId: id, planX: (x0 + x1) / 2, planY: (y0 + y1) / 2,
          gridRows: input.rows, gridCols: input.cols,
        },
      });
      await tx.cavePlan.update({ where: { id }, data: { suggestions: suggestions.filter((x) => x.id !== sid) as object[] } });
      return zoneView(zone);
    }).catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(ZONE_NAME_TAKEN);
      throw e;
    });
  }

  /** Retire une proposition, sous verrou du plan. */
  async rejectSuggestion(caveId: string, id: string, sid: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { suggestions } = await this.lockOwn(tx, caveId, id);
      if (!suggestions.some((x) => x.id === sid)) throw new NotFoundException(SUGGESTION_NOT_FOUND);
      await tx.cavePlan.update({ where: { id }, data: { suggestions: suggestions.filter((x) => x.id !== sid) as object[] } });
    });
  }

  /**
   * Relance l'analyse de la photo actuelle (après un échec, ou pour en refaire
   * une) : nouvelle demande, propositions et raison d'échec effacées, nouvelle
   * tâche. L'image et sa date ne changent pas. En une seule instruction : deux
   * relances simultanées, la seconde trouve l'analyse en cours (409).
   */
  async retryAnalysis(caveId: string, id: string): Promise<PlanMeta> {
    const { count } = await this.prisma.cavePlan.updateMany({
      where: { id, caveId, analysisStatus: { not: 'PENDING' } },
      data: { analysisStatus: 'PENDING', suggestions: [], analysisError: null, analysisRequestedAt: new Date() },
    });
    const plan = await this.findOwn(caveId, id);
    if (count === 0) throw new ConflictException(ANALYSIS_IN_PROGRESS);
    return this.analyze(plan);
  }

  /**
   * Résultat de l'analyse : écrit seulement s'il n'y a pas eu de nouvelle
   * demande depuis la mise en file (`analysis_requested_at` vaut encore
   * `expectedRequestedAt`), en une seule instruction. Plan supprimé, photo
   * remplacée ou analyse relancée : rien n'est écrit, false.
   */
  async setAnalysis(
    planId: string, expectedRequestedAt: Date,
    result: { status: 'DONE'; suggestions: PlanSuggestion[] } | { status: 'FAILED'; reason: PlanFailedReason },
  ): Promise<boolean> {
    const { count } = await this.prisma.cavePlan.updateMany({
      where: { id: planId, analysisRequestedAt: expectedRequestedAt },
      data: {
        analysisStatus: result.status, suggestions: result.status === 'DONE' ? (result.suggestions as object[]) : [],
        analysisError: result.status === 'FAILED' ? result.reason : null,
      },
    });
    return count > 0;
  }

  /**
   * Met en file l'analyse de la photo qui vient d'être enregistrée. File
   * injoignable : le plan reste utilisable, l'analyse passe en échec (on place
   * les zones à la main) ; la requête ne tombe jamais pour autant.
   */
  private async analyze(plan: CavePlan): Promise<PlanMeta> {
    try {
      await enqueuePlanAnalysis(this.analysisQueue, { planId: plan.id, requestedAt: plan.analysisRequestedAt.toISOString() });
      return meta(plan);
    } catch (e) {
      this.logger.warn(`Analyse du plan ${plan.id} impossible à mettre en file : ${(e as Error).message}`);
      await this.setAnalysis(plan.id, plan.analysisRequestedAt, { status: 'FAILED', reason: 'ERREUR' });
      return meta({ ...plan, analysisStatus: 'FAILED', analysisError: 'ERREUR' });
    }
  }

  /** Image du plan, pour tout compte qui a accès à sa cave (cave courante ou non) ; sinon « Plan introuvable ». */
  async image(userId: string, planId: string): Promise<Buffer> {
    const plan = await this.prisma.cavePlan.findUnique({ where: { id: planId } });
    if (!plan || !(await this.caves.findAccess(userId, plan.caveId))) throw new NotFoundException(PLAN_NOT_FOUND);
    try {
      return await readFile(join(this.dir, plan.path));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException(PLAN_NOT_FOUND);
      throw e;
    }
  }

  private async findOwn(caveId: string, id: string): Promise<CavePlan> {
    const plan = await this.prisma.cavePlan.findFirst({ where: { id, caveId } });
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND);
    return plan;
  }

  /** Plan de la cave, verrouillé (FOR UPDATE) jusqu'à la fin de la transaction ; sinon 404. */
  private async lockOwn(tx: Prisma.TransactionClient, caveId: string, id: string): Promise<{ path: string; suggestions: PlanSuggestion[] }> {
    const [plan] = await tx.$queryRaw<{ path: string; suggestions: PlanSuggestion[] }[]>`
      SELECT path, suggestions FROM cave_plan WHERE id = ${id}::uuid AND cave_id = ${caveId} FOR UPDATE`;
    if (!plan) throw new NotFoundException(PLAN_NOT_FOUND);
    return plan;
  }
}
