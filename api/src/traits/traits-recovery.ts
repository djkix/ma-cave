import { PrismaService } from '../prisma/prisma.service';
import { requestTraits } from '../pairing/generation-requests';

/**
 * Au démarrage du worker : tout vin sans ligne de caractéristiques en reçoit
 * une, en attente (vins d'avant la fonction, écriture ratée à la création).
 * Idempotent, sans appel à Gemini.
 */
export async function requeueMissingTraits(
  prisma: Pick<PrismaService, 'wine' | 'wineTraits'>,
  log: (message: string) => void = () => undefined,
): Promise<number> {
  const wines = await prisma.wine.findMany({ where: { traits: null }, select: { id: true } });
  const created = await requestTraits(prisma, wines.map((w) => w.id));
  if (created) log(`caractéristiques : ${created} vin(s) mis en attente`);
  return created;
}
