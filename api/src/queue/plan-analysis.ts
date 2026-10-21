import { Queue } from 'bullmq';
import { EXTRACTION_ATTEMPTS, EXTRACTION_BACKOFF, redisConnection } from './extraction.queue';

export const PLAN_ANALYSIS_QUEUE = 'plan-analysis';
export const PLAN_ANALYSIS_QUEUE_TOKEN = 'PLAN_ANALYSIS_QUEUE';

/** `updatedAt` : date ISO de l'image à analyser ; une autre date en base = photo remplacée depuis. */
export interface PlanAnalysisJobData {
  planId: string;
  updatedAt: string;
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
 * Identifiant fixe par plan et par image : remettre en file la même analyse
 * (reprise au démarrage) ne crée pas de doublon. Pas de « : » (refusé par
 * BullMQ) : la date en millisecondes.
 */
export function planAnalysisJobId({ planId, updatedAt }: PlanAnalysisJobData): string {
  return `${planId}_${Date.parse(updatedAt)}`;
}

/** Mise en file bornée dans le temps : Redis injoignable ferait sinon attendre la requête indéfiniment. */
export async function enqueuePlanAnalysis(queue: Pick<Queue<PlanAnalysisJobData>, 'add'>, data: PlanAnalysisJobData): Promise<void> {
  let timer!: NodeJS.Timeout;
  try {
    await Promise.race([
      queue.add('analyse', data, { jobId: planAnalysisJobId(data) }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Au démarrage du worker : chaque plan resté en attente (tâche perdue par Redis,
 * arrêt brutal) est remis en file. Sans doublon grâce à l'identifiant fixe :
 * une tâche encore présente pour la même image n'est pas recréée.
 */
export async function requeuePendingPlans(
  prisma: { cavePlan: { findMany(args: unknown): Promise<Array<{ id: string; updatedAt: Date }>> } },
  queue: Pick<Queue<PlanAnalysisJobData>, 'add'>,
  log: (message: string) => void = () => undefined,
): Promise<number> {
  const plans = await prisma.cavePlan.findMany({ where: { analysisStatus: 'PENDING' }, select: { id: true, updatedAt: true }, orderBy: { createdAt: 'asc' } });
  for (const p of plans) await enqueuePlanAnalysis(queue, { planId: p.id, updatedAt: p.updatedAt.toISOString() });
  if (plans.length > 0) log(`Reprise au démarrage : ${plans.length} analyse(s) de plan remise(s) en file`);
  return plans.length;
}
