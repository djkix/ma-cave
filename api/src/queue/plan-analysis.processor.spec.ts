import { PrismaClient } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';
import { GeminiPausedError, GeminiQuotaError } from '../vision/gemini-pause';
import { CaveBudgetShareExceededError } from './vision-budget.service';
import { VisionInvalidOutputError } from '../vision/gemini-vision.provider';
import { PlanService } from '../zones/plan.service';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Worker } from 'bullmq';
import { EXTRACTION_ATTEMPTS } from './extraction.queue';
import { clearPlanAnalysisDeferral, planAnalysisJobId, planAnalysisJobState, requeuePendingPlans } from './plan-analysis';
import { deferralOf, failedReasonOf, PlanAnalysisProcessor } from './plan-analysis.processor';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const GEMINI_503 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [503 Service Unavailable] busy');
const GEMINI_429 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [429 Too Many Requests] quota');

/** Analyse d'un plan sur la vraie base : l'écriture conditionnelle (`analysis_requested_at`) ne se vérifie pas avec un faux Prisma. */
describeIfDb('PlanAnalysisProcessor (base réelle)', () => {
  const prisma = new PrismaClient();
  const dir = mkdtempSync(join(tmpdir(), 'cave-plan-analysis-'));
  let caveId: string;
  const vision = { analyzePlan: jest.fn<Promise<{ units: unknown; costCents: number }>, [Buffer, string]>() };
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
  /** Plan en attente d'analyse, avec son image ; rend la donnée de la tâche. Image plus ancienne que la demande (relance). */
  const pendingPlan = async () => {
    const plan = await prisma.cavePlan.create({
      data: {
        caveId, name: `Plan ${++n}`, path: `plans/p${n}.jpg`, width: 100, height: 100, updatedAt: new Date(Date.now() - 60_000), analysisRequestedAt: new Date(),
        analysisStatus: 'PENDING',
      },
    });
    writeFileSync(join(dir, plan.path), `image ${n}`);
    return { planId: plan.id, requestedAt: plan.analysisRequestedAt.toISOString() };
  };
  /** Nouvelle demande d'analyse (photo remplacée ou relance) : la date de la demande avance. */
  const newRequest = (job: { planId: string; requestedAt: string }, data: object = {}) =>
    prisma.cavePlan.update({ where: { id: job.planId }, data: { analysisRequestedAt: new Date(Date.parse(job.requestedAt) + 1000), ...data } });
  const planOf = (id: string) => prisma.cavePlan.findUniqueOrThrow({ where: { id } });
  /**
   * Meuble tel que Gemini le rend : `rows` × `cols` cases remplissant le cadre
   * `box2d` = [ymin, xmin, ymax, xmax] en millièmes (un cadre inversé donne des cases inversées).
   */
  const unit = (kind: string, [ymin, xmin, ymax, xmax]: number[], rows = 2, cols = 3) => ({
    kind,
    cells: Array.from({ length: rows * cols }, (_, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const y = (k: number) => Math.round(ymin + ((ymax - ymin) * k) / rows), x = (k: number) => Math.round(xmin + ((xmax - xmin) * k) / cols);
      return { box_2d: [y(r), x(c), y(r + 1), x(c + 1)] };
    }),
  });

  it('succès : DONE, propositions triées et nommées en sautant les lettres (noms et cases) des zones actives ; coût imputé à la cave', async () => {
    await prisma.caveZone.createMany({
      data: [
        { caveId, name: 'casier a', sortOrder: 0 },
        { caveId, name: 'Mur du fond', sortOrder: 1, gridRows: 2, gridCols: 2, cellPrefix: 'B' },
        { caveId, name: 'Étagère C', sortOrder: 2, archivedAt: new Date() },
        { caveId, name: 'Champagnes', sortOrder: 3, gridRows: 2, gridCols: 2, cellPrefix: 'D', archivedAt: new Date() },
      ],
    });
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ units: [unit('ETAGERE', [0, 500, 400, 900]), unit('CASIER', [200, 100, 900, 400], 6, 4)], costCents: 3 });
    await processor.process(job);
    expect(vision.analyzePlan).toHaveBeenCalledWith(Buffer.from(`image ${n}`), 'image/jpeg');
    expect(budget.assertCaveUnderShare).toHaveBeenCalledWith(caveId);
    const plan = await planOf(job.planId);
    expect(plan.analysisStatus).toBe('DONE');
    expect(plan.suggestions).toEqual([
      { id: expect.any(String), kind: 'CASIER', name: 'Casier C', cellPrefix: 'C', box: [0.1, 0.2, 0.4, 0.9], rows: 6, cols: 4, cellCount: 24, cells: expect.any(Array) },
      { id: expect.any(String), kind: 'ETAGERE', name: 'Étagère D', cellPrefix: 'D', box: [0.5, 0, 0.9, 0.4], rows: 2, cols: 3, cellCount: 6, cells: expect.any(Array) },
    ]);
    // Cases repérées enregistrées avec leur code dans la grille (lettre de la proposition, rangée par rangée).
    expect((plan.suggestions as { cells: { name: string }[] }[])[0].cells.map((c) => c.name)).toEqual(expect.arrayContaining(['C1', 'C24']));
    expect((await prisma.imageSearchCost.findMany({ where: { caveId } })).map((c) => c.costCents)).toEqual([3]);
  });

  it('zéro meuble : DONE sans proposition', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ units: [], costCents: 1 });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'DONE', suggestions: [] });
  });

  it('un meuble hors bornes, inversé, sans case ou d’une seule case est ignoré, les autres gardés', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({
      units: [
        unit('CASIER', [100, 1100, 500, 1200]), unit('CASIER', [100, 600, 500, 300]), unit('CASIER', [100, 100, 500, 300], 0, 3),
        unit('CASIER', [600, 600, 700, 700], 1, 1), unit('AUTRE', [200, 200, 300, 300], 1, 2),
      ],
      costCents: 1,
    });
    await processor.process(job);
    const plan = await planOf(job.planId);
    expect(plan.analysisStatus).toBe('DONE');
    expect(plan.suggestions).toEqual([{ id: expect.any(String), kind: 'AUTRE', name: 'Rangement A', cellPrefix: 'A', box: [0.2, 0.2, 0.3, 0.3], rows: 1, cols: 2, cellCount: 2, cells: expect.any(Array) }]);
  });

  it('réponse inexploitable (pas de liste de meubles) : FAILED, coût imputé', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ units: 'rien', costCents: 2 });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'ILLISIBLE', suggestions: [] });
    expect((await prisma.imageSearchCost.findMany({ where: { caveId } })).map((c) => c.costCents)).toEqual([2]);
  });

  it('JSON illisible (sortie du modèle invalide) : FAILED tout de suite, sans reprise, coût imputé', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockRejectedValueOnce(new VisionInvalidOutputError('Sortie du modèle invalide (JSON illisible)', 2));
    await expect(processor.process(job, false)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'ILLISIBLE' });
    expect((await prisma.imageSearchCost.findMany({ where: { caveId } })).map((c) => c.costCents)).toEqual([2]);
  });

  it('image du plan absente : FAILED, sans erreur ni appel', async () => {
    const job = await pendingPlan();
    rmSync(join(dir, (await planOf(job.planId)).path));
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(vision.analyzePlan).not.toHaveBeenCalled();
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'IMAGE' });
  });

  it('plan supprimé : abandon sans erreur, aucun appel', async () => {
    const job = await pendingPlan();
    await prisma.cavePlan.delete({ where: { id: job.planId } });
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(vision.analyzePlan).not.toHaveBeenCalled();
  });

  it('nouvelle demande (photo remplacée ou relance) avant le traitement : abandon sans appel, rien écrit', async () => {
    const job = await pendingPlan();
    await newRequest(job);
    await processor.process(job);
    expect(vision.analyzePlan).not.toHaveBeenCalled();
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING', suggestions: [] });
  });

  it('nouvelle demande pendant l’analyse : l’ancienne analyse n’écrit rien', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockImplementationOnce(async () => {
      // Remplacement ou relance concurrents : nouvelle demande, propositions vidées, nouvelle analyse en attente.
      await newRequest(job, { analysisStatus: 'PENDING', suggestions: [] });
      return { units: [unit('CASIER', [100, 100, 500, 500])], costCents: 1 };
    });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING', suggestions: [] });
  });

  it('l’ancienne garde (date de l’image) ne compte plus : image changée seule, la demande en cours aboutit', async () => {
    const job = await pendingPlan();
    await prisma.cavePlan.update({ where: { id: job.planId }, data: { updatedAt: new Date() } });
    vision.analyzePlan.mockResolvedValueOnce({ units: [], costCents: 0 });
    await processor.process(job);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'DONE' });
  });

  it('tâche d’avant la 2.17.0 (`updatedAt` dans la donnée) : traitée avec cette date comme demande', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockResolvedValueOnce({ units: [], costCents: 0 });
    await processor.process({ planId: job.planId, updatedAt: job.requestedAt } as never);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'DONE' });
  });

  it('pause Gemini : tâche reportée (relancée), plan toujours en attente, cause GEMINI_PAUSE et fin de pause enregistrées', async () => {
    const job = await pendingPlan();
    const until = new Date(Date.now() + 60_000);
    const paused = new GeminiPausedError(until, 'refus');
    const defer = jest.fn(async () => undefined);
    vision.analyzePlan.mockRejectedValueOnce(paused);
    await expect(processor.process(job, false, defer)).rejects.toBe(paused);
    expect(defer).toHaveBeenCalledWith({ waiting: 'GEMINI_PAUSE', pauseUntil: until.toISOString() });
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING', analysisError: null });
  });

  it('cause du report impossible à enregistrer (Redis) : le report a lieu quand même', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockRejectedValueOnce(GEMINI_503);
    await expect(processor.process(job, false, async () => Promise.reject(new Error('Redis injoignable')))).rejects.toBe(GEMINI_503);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
  });

  it('refus 503 ou 429 : reprise patiente (cause RETRY), puis FAILED à la dernière tentative, raison GEMINI', async () => {
    const job = await pendingPlan();
    const defer = jest.fn(async () => undefined);
    vision.analyzePlan.mockRejectedValueOnce(GEMINI_503).mockRejectedValueOnce(GEMINI_429);
    await expect(processor.process(job, false, defer)).rejects.toBe(GEMINI_503);
    expect(defer).toHaveBeenCalledWith({ waiting: 'RETRY', pauseUntil: null });
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
    await expect(processor.process(job, true, defer)).rejects.toBe(GEMINI_429);
    expect(defer).toHaveBeenCalledTimes(1);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'GEMINI' });
  });

  it('pause Gemini à la dernière tentative : FAILED, raison GEMINI', async () => {
    const job = await pendingPlan();
    vision.analyzePlan.mockRejectedValueOnce(new GeminiPausedError(new Date(Date.now() + 60_000), 'refus'));
    await expect(processor.process(job, true)).rejects.toBeInstanceOf(GeminiPausedError);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'GEMINI' });
  });

  it('budget dépassé : reporté (cause BUDGET), puis FAILED à la dernière tentative, raison BUDGET', async () => {
    const job = await pendingPlan();
    const defer = jest.fn(async () => undefined);
    budget.assertCaveUnderShare.mockRejectedValueOnce(new CaveBudgetShareExceededError()).mockRejectedValueOnce(new CaveBudgetShareExceededError());
    await expect(processor.process(job, false, defer)).rejects.toBeInstanceOf(CaveBudgetShareExceededError);
    expect(defer).toHaveBeenCalledWith({ waiting: 'BUDGET', pauseUntil: null });
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
    await expect(processor.process(job, true, defer)).rejects.toBeInstanceOf(CaveBudgetShareExceededError);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'BUDGET' });
    expect(vision.analyzePlan).not.toHaveBeenCalled();
  });

  it('erreur après l’appel (lecture des zones) : reprise si d’autres tentatives restent, FAILED à la dernière', async () => {
    const job = await pendingPlan();
    const boom = new Error('base injoignable');
    const zones = jest.spyOn(prisma.caveZone, 'findMany').mockRejectedValueOnce(boom).mockRejectedValueOnce(boom);
    vision.analyzePlan.mockResolvedValue({ units: [], costCents: 0 });
    await expect(processor.process(job, false)).rejects.toBe(boom);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'PENDING' });
    await expect(processor.process(job, true)).rejects.toBe(boom);
    expect(await planOf(job.planId)).toMatchObject({ analysisStatus: 'FAILED', analysisError: 'ERREUR' });
    zones.mockRestore();
    vision.analyzePlan.mockReset();
  });

  it('reprise au démarrage : chaque plan en attente remis en file, sans doublon (identifiant fixe, date de la demande)', async () => {
    const pending = await pendingPlan();
    const done = await pendingPlan();
    await prisma.cavePlan.update({ where: { id: done.planId }, data: { analysisStatus: 'DONE' } });
    const queue = new Queue(`plan-analysis-test-${randomUUID()}`, { connection: new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }) });
    try {
      // D'autres suites peuvent avoir des plans en attente dans la même base : on ne compte que les nôtres.
      expect(await requeuePendingPlans(prisma, queue)).toBeGreaterThanOrEqual(1);
      await requeuePendingPlans(prisma, queue);
      const ours = (await queue.getJobs(['waiting'])).filter((j) => [pending.planId, done.planId].includes(j.data.planId));
      expect(ours.map((j) => j.id)).toEqual([planAnalysisJobId(pending)]);
      const job = await queue.getJob(planAnalysisJobId(pending));
      expect(job?.data).toEqual(pending);
      expect(await queue.getJob(planAnalysisJobId(done))).toBeUndefined();
    } finally {
      await queue.obliterate({ force: true });
      const { connection } = queue.opts;
      await queue.close();
      if (connection instanceof Redis) await connection.quit();
    }
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

/** État d'une tâche d'analyse lu dans une vraie file BullMQ de test. */
describeIfDb('planAnalysisJobState (file réelle)', () => {
  const connection = () => new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  let queue: Queue;
  const data = (planId = randomUUID()) => ({ planId, requestedAt: new Date(Date.now() - 5000).toISOString() });
  beforeEach(() => {
    queue = new Queue(`plan-analysis-test-${randomUUID()}`, { connection: connection(), defaultJobOptions: { attempts: 7 } });
  });
  afterEach(async () => {
    await queue.obliterate({ force: true });
    const { connection: c } = queue.opts;
    await queue.close();
    if (c instanceof Redis) await c.quit();
  });

  it('tâche introuvable : QUEUED, première tentative', async () => {
    expect(await planAnalysisJobState(queue, data())).toEqual({ attempt: 1, maxAttempts: EXTRACTION_ATTEMPTS, nextAttemptAt: null, waiting: 'QUEUED', pauseUntil: null });
  });

  it('en attente : QUEUED, tentatives de la tâche', async () => {
    const d = data();
    await queue.add('analyse', d, { jobId: planAnalysisJobId(d) });
    expect(await planAnalysisJobState(queue, d)).toEqual({ attempt: 1, maxAttempts: 7, nextAttemptAt: null, waiting: 'QUEUED', pauseUntil: null });
  });

  it('active : RUNNING', async () => {
    const d = data();
    await queue.add('analyse', d, { jobId: planAnalysisJobId(d) });
    const workerConnection = connection();
    const worker = new Worker(queue.name, null, { connection: workerConnection });
    try {
      expect((await worker.getNextJob('jeton'))?.id).toBe(planAnalysisJobId(d));
      expect(await planAnalysisJobState(queue, d)).toMatchObject({ attempt: 1, waiting: 'RUNNING', nextAttemptAt: null });
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  });

  it('retardée après un échec : cause enregistrée, n° de tentative et heure de la prochaine', async () => {
    const d = data();
    // Création datée d'il y a longtemps : l'heure de reprise part de l'échec, pas de la création.
    await queue.add('analyse', d, { jobId: planAnalysisJobId(d), backoff: { type: 'fixed', delay: 90_000 }, timestamp: Date.now() - 3_600_000 });
    const workerConnection = connection();
    const worker = new Worker(queue.name, null, { connection: workerConnection });
    try {
      const job = (await worker.getNextJob('jeton'))!;
      const pauseUntil = new Date(Date.now() + 120_000).toISOString();
      await job.updateData({ ...d, waiting: 'GEMINI_PAUSE', pauseUntil });
      const failedAt = Date.now();
      await job.moveToFailed(new Error('pause'), 'jeton');
      const state = await planAnalysisJobState(queue, d);
      expect(state).toMatchObject({ attempt: 2, maxAttempts: 7, waiting: 'GEMINI_PAUSE', pauseUntil });
      expect(Math.abs(Date.parse(state.nextAttemptAt!) - (failedAt + 90_000))).toBeLessThan(1000);
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  });

  it('retardée par une limite de débit : QUOTA, sa nature, et le texte calculé à la lecture', async () => {
    const d = data();
    await queue.add('analyse', d, { jobId: planAnalysisJobId(d), backoff: { type: 'fixed', delay: 90_000 } });
    const workerConnection = connection();
    const worker = new Worker(queue.name, null, { connection: workerConnection });
    try {
      const job = (await worker.getNextJob('jeton'))!;
      const until = new Date(Date.now() + 60_000);
      await job.updateData({ ...d, ...deferralOf(new GeminiQuotaError(until, 'QUOTA_MINUTE', 5)) });
      await job.moveToFailed(new Error('limite'), 'jeton');
      // Heure affichée arrondie à la minute supérieure (jamais plus tôt que la vraie).
      const hhmm = new Date(Math.ceil(until.getTime() / 60_000) * 60_000).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
      expect(await planAnalysisJobState(queue, d)).toMatchObject({
        waiting: 'QUOTA', pauseUntil: until.toISOString(), quotaKind: 'MINUTE', message: expect.stringMatching(new RegExp(`^Limite de 5 requêtes par minute atteinte : reprise ([a-zé]+ )?à ${hhmm}\\.$`)),
      });
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  });

  it('au démarrage d’une tentative, la cause du report précédent est effacée de la tâche', async () => {
    const d = data();
    await queue.add('analyse', { ...d, waiting: 'QUOTA', pauseUntil: null, quotaKind: 'JOUR', quotaLimit: 20 }, { jobId: planAnalysisJobId(d) });
    const job = (await queue.getJob(planAnalysisJobId(d)))!;
    await clearPlanAnalysisDeferral(job);
    expect((await queue.getJob(planAnalysisJobId(d)))!.data).toEqual(d);
    // Sans cause : aucune écriture.
    const update = jest.spyOn(job, 'updateData');
    await clearPlanAnalysisDeferral(job);
    expect(update).not.toHaveBeenCalled();
  });

  it('effacement de la cause impossible (Redis) : sans erreur, la tentative a lieu', async () => {
    const job = { data: { ...data(), waiting: 'RETRY' as const }, updateData: jest.fn(async () => Promise.reject(new Error('Redis injoignable'))) };
    await expect(clearPlanAnalysisDeferral(job)).resolves.toBeUndefined();
  });

  it('terminée ou en échec alors que le plan attend encore : valeur par défaut (jamais tentative > maximum)', async () => {
    const d = data();
    await queue.add('analyse', d, { jobId: planAnalysisJobId(d), attempts: 1 });
    const workerConnection = connection();
    const worker = new Worker(queue.name, null, { connection: workerConnection });
    try {
      const job = (await worker.getNextJob('jeton'))!;
      await job.moveToFailed(new Error('boum'), 'jeton');
      expect(await job.getState()).toBe('failed');
      expect(await planAnalysisJobState(queue, d)).toEqual({ attempt: 1, maxAttempts: EXTRACTION_ATTEMPTS, nextAttemptAt: null, waiting: 'QUEUED', pauseUntil: null });
    } finally {
      await worker.close();
      await workerConnection.quit();
    }
  });

  it('retardée sans cause enregistrée : RETRY, sans fin de pause', async () => {
    const d = data();
    const at = Date.now() + 60_000;
    await queue.add('analyse', d, { jobId: planAnalysisJobId(d), delay: at - Date.now() });
    const state = await planAnalysisJobState(queue, d);
    expect(state).toMatchObject({ attempt: 1, waiting: 'RETRY', pauseUntil: null });
    expect(Math.abs(Date.parse(state.nextAttemptAt!) - at)).toBeLessThan(1000);
  });
});

describe('deferralOf', () => {
  const until = new Date('2026-10-22T07:00:00.000Z');
  it('limite de débit : QUOTA, sa nature et la limite réglée', () => {
    expect(deferralOf(new GeminiQuotaError(until, 'QUOTA_JOUR', 20))).toEqual({ waiting: 'QUOTA', pauseUntil: until.toISOString(), quotaKind: 'JOUR', quotaLimit: 20 });
    expect(deferralOf(new GeminiQuotaError(until, 'QUOTA_TOKENS', 250000))).toMatchObject({ waiting: 'QUOTA', quotaKind: 'TOKENS' });
  });
  it('pause après un 429 de Google : QUOTA GOOGLE ; autre pause : GEMINI_PAUSE', () => {
    expect(deferralOf(new GeminiPausedError(until, 'QUOTA_GOOGLE'))).toEqual({ waiting: 'QUOTA', pauseUntil: until.toISOString(), quotaKind: 'GOOGLE', quotaLimit: null });
    expect(deferralOf(new GeminiPausedError(until, 'modèle saturé'))).toEqual({ waiting: 'GEMINI_PAUSE', pauseUntil: until.toISOString() });
  });
});

describe('failedReasonOf', () => {
  it('coupure réseau vers Gemini : GEMINI ; erreur interne : ERREUR', () => {
    for (const m of ['fetch failed', 'read ECONNRESET', 'connect ETIMEDOUT 1.2.3.4:443', 'getaddrinfo ENOTFOUND generativelanguage.googleapis.com', 'socket hang up']) {
      expect(failedReasonOf(new Error(m))).toBe('GEMINI');
    }
    expect(failedReasonOf(new Error('base injoignable'))).toBe('ERREUR');
  });

  it('refus 4xx de Gemini (hors 429) : REFUS ; 429 et 503 : GEMINI', () => {
    for (const status of ['400 Bad Request', '403 Forbidden', '404 Not Found']) {
      expect(failedReasonOf(new Error(`[GoogleGenerativeAI Error]: Error fetching from https://x:generateContent: [${status}] Request contains an invalid argument.`))).toBe('REFUS');
    }
    expect(failedReasonOf(GEMINI_429)).toBe('GEMINI');
    expect(failedReasonOf(GEMINI_503)).toBe('GEMINI');
  });
});
