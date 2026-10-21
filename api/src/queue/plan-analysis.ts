import { Queue } from 'bullmq';
import { EXTRACTION_ATTEMPTS, EXTRACTION_BACKOFF, redisConnection } from './extraction.queue';

export const PLAN_ANALYSIS_QUEUE = 'plan-analysis';
export const PLAN_ANALYSIS_QUEUE_TOKEN = 'PLAN_ANALYSIS_QUEUE';

/** Cause du dernier report d'une analyse, enregistrée sur la tâche pour l'afficher. */
export interface PlanAnalysisDeferral {
  waiting: 'GEMINI_PAUSE' | 'BUDGET' | 'RETRY';
  /** Fin de la pause Gemini (ISO), seulement pour GEMINI_PAUSE. */
  pauseUntil: string | null;
}

/**
 * `requestedAt` : date ISO de la demande d'analyse (`analysis_requested_at`) ;
 * une autre date en base = photo remplacée ou analyse relancée depuis.
 * `updatedAt` : même rôle, nom des tâches mises en file avant la 2.17.0 (la
 * migration a recopié cette date dans `analysis_requested_at`).
 */
export interface PlanAnalysisJobData extends Partial<PlanAnalysisDeferral> {
  planId: string;
  requestedAt: string;
  updatedAt?: string;
}

/** Avancement d'une analyse en attente, lu sur sa tâche. */
export interface PlanAnalysisJobState {
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  waiting: 'QUEUED' | 'RUNNING' | PlanAnalysisDeferral['waiting'];
  pauseUntil: string | null;
}

/** Même patience que les photos d'entrée : reprises espacées jusqu'à 15 min, pendant une dizaine de jours. */
export function createPlanAnalysisQueue(): Queue<PlanAnalysisJobData> {
  return new Queue<PlanAnalysisJobData>(PLAN_ANALYSIS_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: { attempts: EXTRACTION_ATTEMPTS, backoff: { type: EXTRACTION_BACKOFF }, removeOnComplete: 1000, removeOnFail: 1000 },
  });
}

const ENQUEUE_TIMEOUT_MS = 5000;

/**
 * Identifiant fixe par plan et par demande d'analyse : remettre en file la même
 * analyse (reprise au démarrage) ne crée pas de doublon ; une relance, nouvelle
 * demande, en crée une nouvelle. Pas de « : » (refusé par BullMQ) : la date en
 * millisecondes.
 */
export function planAnalysisJobId({ planId, requestedAt }: Pick<PlanAnalysisJobData, 'planId' | 'requestedAt'>): string {
  return `${planId}_${Date.parse(requestedAt)}`;
}

/** Promesse bornée dans le temps : Redis injoignable ferait sinon attendre la requête indéfiniment. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer!: NodeJS.Timeout;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function enqueuePlanAnalysis(queue: Pick<Queue<PlanAnalysisJobData>, 'add'>, data: PlanAnalysisJobData): Promise<void> {
  await withTimeout(queue.add('analyse', data, { jobId: planAnalysisJobId(data) }), ENQUEUE_TIMEOUT_MS);
}

/** Avancement par défaut : tâche pas encore prise (ou illisible), première tentative. */
export const QUEUED_STATE: PlanAnalysisJobState = { attempt: 1, maxAttempts: EXTRACTION_ATTEMPTS, nextAttemptAt: null, waiting: 'QUEUED', pauseUntil: null };

/**
 * Avancement d'une analyse en attente, lu sur sa tâche : active → RUNNING ;
 * retardée → cause du dernier report (RETRY si aucune) et heure de la reprise ;
 * en attente ou introuvable → QUEUED. L'heure de reprise est le score de la
 * tâche dans l'ensemble `delayed` de BullMQ (date × 0x1000 + rang) : après un
 * échec, `timestamp + delay` partirait de la création de la tâche, pas de l'échec.
 */
export async function planAnalysisJobState(
  queue: Pick<Queue<PlanAnalysisJobData>, 'getJob' | 'client' | 'toKey'>, data: Pick<PlanAnalysisJobData, 'planId' | 'requestedAt'>,
): Promise<PlanAnalysisJobState> {
  const job = await queue.getJob(planAnalysisJobId(data));
  if (!job) return QUEUED_STATE;
  const base = { ...QUEUED_STATE, attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts ?? EXTRACTION_ATTEMPTS };
  const state = await job.getState();
  if (state === 'active') return { ...base, waiting: 'RUNNING' };
  if (state !== 'delayed') return base;
  const score = await (await queue.client).zscore(queue.toKey('delayed'), job.id!);
  const waiting = job.data.waiting ?? 'RETRY';
  return {
    ...base,
    waiting,
    nextAttemptAt: score === null ? null : new Date(Math.floor(Number(score) / 0x1000)).toISOString(),
    pauseUntil: waiting === 'GEMINI_PAUSE' ? (job.data.pauseUntil ?? null) : null,
  };
}

/**
 * Au démarrage du worker : chaque plan resté en attente (tâche perdue par Redis,
 * arrêt brutal) est remis en file. Sans doublon grâce à l'identifiant fixe :
 * une tâche encore présente pour la même demande n'est pas recréée.
 */
export async function requeuePendingPlans(
  prisma: { cavePlan: { findMany(args: unknown): Promise<Array<{ id: string; analysisRequestedAt: Date }>> } },
  queue: Pick<Queue<PlanAnalysisJobData>, 'add'>,
  log: (message: string) => void = () => undefined,
): Promise<number> {
  const plans = await prisma.cavePlan.findMany({
    where: { analysisStatus: 'PENDING' }, select: { id: true, analysisRequestedAt: true }, orderBy: { createdAt: 'asc' },
  });
  for (const p of plans) await enqueuePlanAnalysis(queue, { planId: p.id, requestedAt: p.analysisRequestedAt.toISOString() });
  if (plans.length > 0) log(`Reprise au démarrage : ${plans.length} analyse(s) de plan remise(s) en file`);
  return plans.length;
}
