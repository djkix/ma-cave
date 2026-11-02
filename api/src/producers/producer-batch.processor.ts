import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BatchAnswer, GenerationBatchProcessor, Prepared, QueueTable, QueueWhere, ReservedRequest } from '../pairing/generation-batch.processor';
import { PrismaService } from '../prisma/prisma.service';
import { VisionBudgetService } from '../queue/vision-budget.service';
import { GeminiJournal } from '../vision/gemini-journal';
import { PRODUCER_FIELDS } from '../vision/producer-output';
import { PRODUCER_PROVIDER, ProducerBatchItem, ProducerProvider, ProducerQuery } from '../vision/producer-provider.interface';
import { findWinesByProducer } from './producer-wines';

type Description = Omit<ProducerBatchItem, 'index'>;

/** Domaine sans plus aucun vin : réexaminé au plus tôt après ce délai. */
export const ORPHAN_RECHECK_MS = 6 * 60 * 60_000;

/**
 * Fiches de domaine (cinq champs) par lots de dix domaines au plus (voir
 * GenerationBatchProcessor). Chaque lecture et écriture exige source = GEMINI.
 * Un champ corrigé à la main (`manualFields`) n'est jamais écrasé ; un domaine
 * inconnu de Gemini garde ses champs.
 */
@Injectable()
export class ProducerBatchProcessor extends GenerationBatchProcessor<ProducerQuery, Description> {
  protected readonly logger = new Logger(ProducerBatchProcessor.name);
  protected readonly label = 'Descriptifs';
  protected readonly tableName = 'producer_profile';
  protected readonly scope: QueueWhere = { source: 'GEMINI' };
  protected readonly scopeSql = Prisma.sql`AND source = 'GEMINI'`;

  constructor(
    prisma: PrismaService,
    @Inject(PRODUCER_PROVIDER) private readonly provider: ProducerProvider,
    budget: VisionBudgetService,
    pause: GeminiJournal,
  ) {
    super(prisma, budget, pause);
  }

  protected table(db: Prisma.TransactionClient = this.prisma): QueueTable {
    return db.producerProfile as unknown as QueueTable;
  }

  /**
   * Un domaine qui n'a plus aucun vin (tous supprimés depuis la demande) est
   * laissé en attente, comme le faisait l'appel par domaine, sans appel à
   * Gemini ni tentative consommée : il est seulement réexaminé plus tard
   * (`ORPHAN_RECHECK_MS`), au cas où un vin de ce domaine reviendrait.
   */
  protected async prepare(requests: ReservedRequest[], deadline: Date, now: Date): Promise<Array<Prepared<ProducerQuery>>> {
    const rows = await this.prisma.producerProfile.findMany({ where: { id: { in: requests.map((r) => r.id) } }, select: { id: true, producerKey: true } });
    const keyOf = new Map(rows.map((r) => [r.id, r.producerKey]));
    const winesOf = await findWinesByProducer(this.prisma, rows.map((r) => r.producerKey));
    const prepared: Array<Prepared<ProducerQuery>> = [];
    for (const request of requests) {
      const key = keyOf.get(request.id) ?? '';
      const wines = winesOf.get(key) ?? [];
      if (!wines.length) {
        await this.write(request, deadline, { reservedUntil: null, nextAttemptAt: new Date(now.getTime() + ORPHAN_RECHECK_MS) });
        continue;
      }
      prepared.push({
        request,
        dedupKey: key,
        input: {
          producer: wines[0].producer,
          appellations: [...new Set(wines.map((w) => w.appellation?.canonicalName ?? w.appellationRaw))],
          region: wines.find((w) => w.appellation?.region)?.appellation?.region ?? null,
        },
      });
    }
    return prepared;
  }

  protected generate(queries: ProducerQuery[]): Promise<BatchAnswer<Description>> {
    return this.provider.describeProducersBatch(queries);
  }

  protected async save(request: ReservedRequest, item: Description, meta: { model: string; costCents: number }, deadline: Date): Promise<void> {
    const [row] = await this.prisma.producerProfile.findMany({ where: { id: request.id }, select: { manualFields: true }, take: 1 });
    const manual = new Set(row?.manualFields ?? []);
    const fields = item.known && item.fields ? item.fields : null;
    await this.prisma.producerProfile.updateMany({
      where: { id: request.id, source: 'GEMINI', reservedUntil: deadline },
      data: {
        ...(fields ? Object.fromEntries(PRODUCER_FIELDS.filter((f) => !manual.has(f)).map((f) => [f, fields[f]])) : {}),
        status: fields ? 'DONE' : 'UNKNOWN',
        model: meta.model,
        costCents: meta.costCents,
        errorMessage: null,
        generatedAt: new Date(),
        attempts: 0,
        nextAttemptAt: null,
        reservedUntil: null,
      },
    });
  }
}
