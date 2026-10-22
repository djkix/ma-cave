import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiJournal } from '../vision/gemini-journal';
import { QUOTA_REASONS, QuotaReason, quotaMessage } from '../vision/gemini-pause';
import { GeminiModelService } from '../vision/gemini-model.service';
import { GeminiQuotaService } from '../vision/gemini-quota';
import { GeminiUsageRow, GeminiUsageTotals, aggregateGeminiUsage, usageSince } from './gemini-usage';

export interface GeminiUsageReport {
  rows: GeminiUsageRow[];
  totals: GeminiUsageTotals;
  /** `message` : texte affiché pour une attente de quota (limite locale ou 429 de Google), null sinon. */
  pause: { until: string | null; reason: string | null; message: string | null };
}

/** Consommation Gemini (journal `gemini_call`, toutes caves) et attente en cours : pause commune ou limite de débit atteinte (la plus lointaine). */
@Injectable()
export class GeminiUsageService {
  private readonly logger = new Logger(GeminiUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: GeminiJournal,
    private readonly quota: GeminiQuotaService,
    private readonly models: GeminiModelService,
  ) {}

  async report(days: number, now = new Date()): Promise<GeminiUsageReport> {
    const [calls, common, blocked] = await Promise.all([
      this.prisma.geminiCall.findMany({
        where: { createdAt: { gte: usageSince(now, days), lte: now } },
        select: { createdAt: true, usage: true, outcome: true, httpStatus: true, costCents: true, model: true },
      }),
      this.journal.currentPause(now),
      // Limiteur illisible (Redis) : la consommation s'affiche quand même, sans limite.
      this.models.candidates().then((models) => this.quota.blocked(models, now)).catch((e: unknown) => {
        this.logger.error(`Limites de débit illisibles : ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }),
    ]);
    const pause = blocked && (!common || blocked.until > common.until) ? blocked : common;
    const message = pause && QUOTA_REASONS.includes(pause.reason) ? (blocked === pause ? blocked.message : quotaMessage(pause.reason as QuotaReason, pause.until, null, now)) : null;
    return {
      ...aggregateGeminiUsage(calls, now, days),
      pause: { until: pause?.until.toISOString() ?? null, reason: pause?.reason ?? null, message },
    };
  }
}
