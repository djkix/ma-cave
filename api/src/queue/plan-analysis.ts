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

/** Mise en file bornée dans le temps : Redis injoignable ferait sinon attendre la requête indéfiniment. */
export async function enqueuePlanAnalysis(queue: Pick<Queue<PlanAnalysisJobData>, 'add'>, data: PlanAnalysisJobData): Promise<void> {
  let timer!: NodeJS.Timeout;
  try {
    await Promise.race([
      queue.add('analyse', data),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ENQUEUE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
