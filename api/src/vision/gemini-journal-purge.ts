import { PrismaClient } from '@prisma/client';

/** Le worker purge le journal des appels Gemini une fois par jour (et au démarrage). */
export const GEMINI_JOURNAL_PURGE_TICK_MS = 24 * 3600_000;

/**
 * Efface les lignes `gemini_call` de plus de `retentionDays` jours. Le budget ne
 * lit que le mois en cours et l'Administration 90 jours au plus : la durée de
 * conservation est donc bornée à 92 jours au minimum (voir env.ts). Rend le
 * nombre de lignes effacées.
 */
export async function purgeGeminiJournal(prisma: Pick<PrismaClient, 'geminiCall'>, retentionDays: number, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - retentionDays * 24 * 3600_000);
  const { count } = await prisma.geminiCall.deleteMany({ where: { createdAt: { lt: before } } });
  return count;
}
