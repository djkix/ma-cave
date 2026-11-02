import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BatchAnswer, GenerationBatchProcessor, Prepared, QueueTable, ReservedRequest } from '../pairing/generation-batch.processor';
import { PrismaService } from '../prisma/prisma.service';
import { VisionBudgetService } from '../queue/vision-budget.service';
import { GeminiJournal } from '../vision/gemini-journal';
import { TRAITS_PROVIDER, TraitsProvider, TraitsWine } from '../vision/traits-provider.interface';
import { Country, Tannin } from './traits';

type Out = { tannin: Tannin | null; aromas: string[]; country: Country | null };

/**
 * Tanin, arômes et pays des vins par lots de dix vins au plus (voir
 * GenerationBatchProcessor). La ligne `wine_traits` d'un vin supprimé disparaît
 * avec lui (cascade). Un champ corrigé à la main (`manualFields`) n'est jamais écrasé.
 */
@Injectable()
export class TraitsBatchProcessor extends GenerationBatchProcessor<TraitsWine, Out> {
  protected readonly logger = new Logger(TraitsBatchProcessor.name);
  protected readonly label = 'Caractéristiques';
  protected readonly tableName = 'wine_traits';

  constructor(
    prisma: PrismaService,
    @Inject(TRAITS_PROVIDER) private readonly provider: TraitsProvider,
    budget: VisionBudgetService,
    pause: GeminiJournal,
  ) {
    super(prisma, budget, pause);
  }

  protected table(db: Prisma.TransactionClient = this.prisma): QueueTable {
    return db.wineTraits as unknown as QueueTable;
  }

  protected async prepare(requests: ReservedRequest[]): Promise<Array<Prepared<TraitsWine>>> {
    const rows = await this.prisma.wineTraits.findMany({
      where: { id: { in: requests.map((r) => r.id) } },
      select: {
        id: true,
        wine: { select: { producer: true, cuvee: true, appellationRaw: true, color: true, vintage: true, appellation: { select: { canonicalName: true } } } },
      },
    });
    const wineOf = new Map(rows.map((r) => [r.id, r.wine]));
    return requests.flatMap((request) => {
      const wine = wineOf.get(request.id);
      if (!wine) return [];
      const input: TraitsWine = {
        producer: wine.producer,
        cuvee: wine.cuvee,
        appellation: wine.appellation?.canonicalName ?? wine.appellationRaw,
        vintage: wine.vintage,
        color: wine.color,
      };
      return [{ request, input, dedupKey: JSON.stringify([input.producer, input.cuvee, input.appellation, input.color, input.vintage]) }];
    });
  }

  protected generate(wines: TraitsWine[]): Promise<BatchAnswer<Out>> {
    return this.provider.characterizeWinesBatch(wines);
  }

  protected async save(request: ReservedRequest, item: Out, meta: { model: string; costCents: number }, deadline: Date): Promise<void> {
    const [row] = await this.prisma.wineTraits.findMany({ where: { id: request.id }, select: { manualFields: true }, take: 1 });
    const manual = new Set(row?.manualFields ?? []);
    await this.prisma.wineTraits.updateMany({
      where: { id: request.id, reservedUntil: deadline },
      data: {
        ...(manual.has('tannin') ? {} : { tannin: item.tannin }),
        ...(manual.has('aromas') ? {} : { aromas: item.aromas }),
        ...(manual.has('country') ? {} : { country: item.country }),
        status: 'DONE',
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
