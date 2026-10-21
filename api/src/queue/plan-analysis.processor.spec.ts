import { PrismaClient } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';
import { GeminiPausedError } from '../vision/gemini-pause';
import { VisionInvalidOutputError } from '../vision/gemini-vision.provider';
import { PlanService } from '../zones/plan.service';
import { PlanAnalysisProcessor } from './plan-analysis.processor';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const GEMINI_503 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [503 Service Unavailable] busy');
const GEMINI_429 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [429 Too Many Requests] quota');

/** Analyse d'un plan sur la vraie base : l'écriture conditionnelle (`updated_at`) ne se vérifie pas avec un faux Prisma. */
describeIfDb('PlanAnalysisProcessor (base réelle)', () => {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'cave-plan-analysis-'));
  let caveId: string;
  const vision = { analyzePlan: jest.fn<Promise<{ blocks: unknown; costCents: number }>, [Buffer, string]>() };
  const budget = { assertUnderCap: jest.fn(async () => undefined), assertCaveUnderShare: jest.fn<Promise<void>, [string]>(async () => undefined) };
  const plans = new PlanService(prisma as never, null as never, null as never, dir, null as never);
  const processor = new PlanAnalysisProcessor(prisma as never, plans, vision, budget as never, dir);

  beforeAll(async () => {
    caveId = (await createTestCave(prisma)).id;
    mkdirSync(join(dir, 'plans'));
  });
  afterAll(async () => {
    await deleteTestCaves(prisma, [caveId]);
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.caveZone.deleteMany({ where: { caveId } });
    await prisma.cavePlan.deleteMany({ where: { caveId } });
    await prisma.imageSearchCost.deleteMany({ where: { caveId } });
  });

  let n = 0;
  /** Plan en attente d'analyse, avec son image ; rend la donnée de la tâche. */
  const pendingPlan = async () => {
    const plan = await prisma.cavePlan.create({
      data: { caveId, name: `Plan ${++n}`, path: `plans/p${n}.jpg`, width: 100, height: 100, updatedAt: new Date(), analysisStatus: 'PENDING' },
    });
    writeFileSync(join(dir, plan.path), `image ${n}`);
    return { planId: plan.id, updatedAt: plan.updatedAt.toISOString() };
  };
  const planOf = (id: string) => prisma.cavePlan.findUniqueOrThrow({ where: { id } });
  const block = (kind: string, box: number[], rows = 2, cols = 3) => ({ kind, box, rows, cols });

  it('succès : DONE, propositions triées et nommées en sautant les lettres des zones actives ; coût imputé à la cave', async () => {
    await prisma.caveZone.createMany({
      data: [
        { caveId, name: 'casier a', sortOrder: 0 },
        { caveId, name: 'Étagère C', sortOrder: 1, archivedAt: new Date() },
      ],
    });
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ blocks: [block('ETAGERE', [0.5, 0, 0.9, 0.4]), block('CASIER', [0.1, 0.2, 0.4, 0.9], 6, 4)], costCents: 3 });
    await processor.process(job);
    expect(vision.analyzePlan).toHaveBeenCalledWith(Buffer.from(`image ${n}`), 'image/jpeg');
    expect(budget.assertCaveUnderShare).toHaveBeenCalledWith(caveId);
    const plan = await planOf(job.planId);
    expect(plan.analysisStatus).toBe('DONE');
    expect(plan.suggestions).toEqual([
      { id: expect.any(String), kind: 'CASIER', name: 'Casier B', box: [0.1, 0.2, 0.4, 0.9], rows: 6, cols: 4 },
      { id: expect.any(String), kind: 'ETAGERE', name: 'Étagère C', box: [0.5, 0, 0.9, 0.4], rows: 2, cols: 3 },
    ]);
    expect((await prisma.imageSearchCost.findMany({ where: { caveId } })).map((c) => c.costCents)).toEqual([3]);
  });

  it('zéro bloc : DONE sans proposition', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ blocks: [], costCents: 1 });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'DONE', suggestions: [] });
  });

  it('un bloc hors bornes, inversé ou à 0 case est ignoré, les autres gardés', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({
      blocks: [block('CASIER', [0.1, 0.1, 1.2, 0.5]), block('CASIER', [0.6, 0.1, 0.3, 0.5]), block('CASIER', [0.1, 0.1, 0.3, 0.5], 0, 3), block('AUTRE', [0.2, 0.2, 0.3, 0.3], 1, 1)],
      costCents: 1,
    });
    await processor.process(job);
    const plan = await planOf(job.planId);
    expect(plan.analysisStatus).toBe('DONE');
    expect(plan.suggestions).toEqual([{ id: expect.any(String), kind: 'AUTRE', name: 'Rangement A', box: [0.2, 0.2, 0.3, 0.3], rows: 1, cols: 1 }]);
  });

  it('réponse inexploitable (pas de liste de blocs) : FAILED, coût imputé', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ blocks: 'rien', costCents: 2 });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', suggestions: [] });
    expect((await prisma.imageSearchCost.findMany({ where: { caveId } })).map((c) => c.costCents)).toEqual([2]);
  });

  it('JSON illisible (sortie du modèle invalide) : FAILED tout de suite, sans reprise, coût imputé', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockRejectedValueOnce(new VisionInvalidOutputError('Sortie du modèle invalide (JSON illisible)', 2));
    await expect(processor.process(job, false)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED' });
    expect((await prisma.imageSearchCost.findMany({ where: { caveId } })).map((c) => c.costCents)).toEqual([2]);
  });

  it('plan supprimé : abandon sans erreur, aucun appel', async () => {
    const job = await pendingPlan();
    await prisma.cavePlan.delete({ where: { id: job.planId } });
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(vision.analyzePlan).not.toHaveBeenCalled();
  });

  it('photo remplacée avant le traitement : abandon sans appel, rien écrit', async () => {
    const job = await pendingPlan();
    await prisma.cavePlan.update({ where: { id: job.planId }, data: { updatedAt: new Date(Date.parse(job.updatedAt) + 1000) } });
    await processor.process(job);
    expect(vision.analyzePlan).not.toHaveBeenCalled();
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING', suggestions: [] });
  });

  it('photo remplacée pendant l’analyse : l’ancienne analyse n’écrit rien', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockImplementationOnce(async () => {
      // Remplacement concurrent : nouvelle date, propositions vidées, nouvelle analyse en attente.
      await prisma.cavePlan.update({ where: { id: job.planId }, data: { updatedAt: new Date(Date.parse(job.updatedAt) + 1000), analysisStatus: 'PENDING', suggestions: [] } });
      return { blocks: [block('CASIER', [0.1, 0.1, 0.5, 0.5])], costCents: 1 };
    });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING', suggestions: [] });
  });

  it('pause Gemini : tâche reportée (relancée), plan toujours en attente', async () => {
    const job = await pendingPlan();
    const paused = new GeminiPausedError(new Date(Date.now() + 60_000), 'refus');
    vision.analyzePlan.mockRejectedValueOnce(paused);
    await expect(processor.process(job, false)).rejects.toBe(paused);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
  });

  it('refus 503 ou 429 : reprise patiente, puis FAILED à la dernière tentative', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockRejectedValueOnce(GEMINI_503).mockRejectedValueOnce(GEMINI_429);
    await expect(processor.process(job, false)).rejects.toBe(GEMINI_503);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
    await expect(processor.process(job, true)).rejects.toBe(GEMINI_429);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED' });
  });

  it('budget de la cave atteint : reporté sans appel', async () => {
    const job = await pendingPlan();
    const over = new Error('Part mensuelle de cette cave atteinte');
    budget.assertCaveUnderShare.mockRejectedValueOnce(over);
    await expect(processor.process(job, false)).rejects.toBe(over);
    expect(vision.analyzePlan).not.toHaveBeenCalled();
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
  });
});
