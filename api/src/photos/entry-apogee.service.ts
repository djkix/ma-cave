import { Injectable, Logger } from '@nestjs/common';
import { Appellation } from '@prisma/client';
import { Apogee, CompiledApogeeRules, estimateApogee } from '../apogee/apogee';
import { ApogeeRulesService } from '../apogee/apogee-rules.service';
import { AppellationsService } from '../appellations/appellations.service';
import { PrismaService } from '../prisma/prisma.service';
import { WineExtraction } from '../vision/vision-provider.interface';

type AppellationRef = Pick<Appellation, 'id' | 'region' | 'guardMinYears' | 'guardMaxYears'>;

/**
 * Apogée d'une étiquette lue, avec les règles d'un vin en cave (`estimateApogee`),
 * sans garde IA ni correction manuelle (le vin n'existe pas encore). Null sans
 * millésime, sans appellation reconnue ou sans garde connue : rien à afficher.
 */
export function extractionApogee(e: WineExtraction | null, appellation: AppellationRef | null, rules: CompiledApogeeRules, currentYear: number): Apogee | null {
  if (!e || !appellation || e.vintage.value == null) return null;
  const apogee = estimateApogee(
    {
      vintage: e.vintage.value, color: e.color.value ?? '', appellationId: appellation.id, region: appellation.region,
      referenceGuardMin: appellation.guardMinYears, referenceGuardMax: appellation.guardMaxYears,
      apogeeMin: null, apogeeMax: null, apogeeSource: null, aiGuardMin: null, aiGuardMax: null, firstEntryYear: null,
    },
    rules, currentYear,
  );
  return apogee.min == null ? null : apogee;
}

/** Apogées des fiches « À confirmer » : aucun appel Gemini, seulement le référentiel et les règles. */
@Injectable()
export class EntryApogeeService {
  private readonly logger = new Logger(EntryApogeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appellations: AppellationsService,
    private readonly rules: ApogeeRulesService,
  ) {}

  /** Une apogée (ou null) par extraction, dans le même ordre. Un échec rend des null : la liste s'affiche quand même. */
  async forExtractions(extractions: (WineExtraction | null)[]): Promise<(Apogee | null)[]> {
    try {
      const names = [...new Set(extractions.flatMap((e) => (e?.vintage.value != null && e.appellation.value ? [e.appellation.value] : [])))];
      if (names.length === 0) return extractions.map(() => null);
      const [rules, matches] = await Promise.all([this.rules.load(), Promise.all(names.map((n) => this.appellations.resolve(n)))]);
      const ids = matches.flatMap((m) => (m.kind === 'none' ? [] : [m.id]));
      const refs = await this.prisma.appellation.findMany({ where: { id: { in: ids } }, select: { id: true, region: true, guardMinYears: true, guardMaxYears: true } });
      const byName = new Map(names.map((n, i) => {
        const m = matches[i];
        return [n, m.kind === 'none' ? null : (refs.find((r) => r.id === m.id) ?? null)] as const;
      }));
      const year = new Date().getFullYear();
      return extractions.map((e) => extractionApogee(e, (e?.appellation.value && byName.get(e.appellation.value)) || null, rules, year));
    } catch (e) {
      this.logger.warn(`Apogée des fiches à confirmer impossible : ${(e as Error).message}`);
      return extractions.map(() => null);
    }
  }
}
