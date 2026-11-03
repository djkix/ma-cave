import { Injectable } from '@nestjs/common';
import { WineColor } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';

export type AppellationMatch =
  | { kind: 'exact' | 'fuzzy'; id: string; canonicalName: string; similarity: number }
  | { kind: 'none'; raw: string };

interface SeedRow {
  canonicalName: string;
  region: string | null;
  allowedColors: WineColor[];
  guardMinYears: number | null;
  guardMaxYears: number | null;
}

export function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Seuil de similarité sous lequel `resolve` ne reconnaît pas l'appellation (répété côté web). */
export const RECOGNIZED_SIMILARITY = 0.5;

@Injectable()
export class AppellationsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(raw: string): Promise<AppellationMatch> {
    const needle = normalizeLabel(raw);
    if (!needle) return { kind: 'none', raw };
    const rows = await this.prisma.$queryRaw<{ id: string; canonical_name: string; sim: number }[]>`
      SELECT id, canonical_name,
             similarity(unaccent_lower(canonical_name), ${needle}) AS sim
      FROM appellation
      ORDER BY sim DESC
      LIMIT 1`;
    const best = rows[0];
    if (!best || best.sim < RECOGNIZED_SIMILARITY) return { kind: 'none', raw };
    return {
      kind: best.sim >= 0.8 ? 'exact' : 'fuzzy',
      id: best.id,
      canonicalName: best.canonical_name,
      similarity: Number(best.sim),
    };
  }

  /** Suggestions pour la saisie : proches par trigrammes ou contenant le texte tapé, les plus proches d'abord. */
  async suggest(q: string, limit = 8): Promise<Array<{ name: string; region: string | null; similarity: number }>> {
    const needle = normalizeLabel(q);
    if (!needle) return [];
    // needle ne contient que [a-z0-9 ] : aucun joker LIKE à échapper. Le nom est
    // normalisé de même (traits d'union en espaces) : « saint em » trouve Saint-Émilion Grand Cru.
    const rows = await this.prisma.$queryRaw<{ canonical_name: string; region: string | null; sim: number }[]>`
      SELECT canonical_name, region, similarity(label, ${needle}) AS sim
      FROM (SELECT canonical_name, region, regexp_replace(unaccent_lower(canonical_name), '[^a-z0-9]+', ' ', 'g') AS label FROM appellation) a
      WHERE label LIKE '%' || ${needle} || '%'
         OR similarity(label, ${needle}) >= ${RECOGNIZED_SIMILARITY}
      ORDER BY sim DESC, canonical_name
      LIMIT ${limit}`;
    return rows.map((r) => ({ name: r.canonical_name, region: r.region, similarity: Number(r.sim) }));
  }

  async seedFromFile(path: string): Promise<number> {
    const rows = JSON.parse(await readFile(path, 'utf8')) as SeedRow[];
    for (const r of rows) {
      await this.prisma.appellation.upsert({
        where: { canonicalName: r.canonicalName },
        update: { region: r.region, allowedColors: r.allowedColors, guardMinYears: r.guardMinYears, guardMaxYears: r.guardMaxYears },
        create: r,
      });
    }
    return rows.length;
  }
}
