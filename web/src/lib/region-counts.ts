import type { CaveRow } from './api-client';

export interface RegionCount { bottles: number; producers: Array<{ producer: string; producerKey: string; bottles: number }> }

/**
 * Bouteilles en cave par région viticole, pour la carte de l'accueil. Les vins épuisés ne
 * comptent pas ; un vin sans région va « hors de France » s'il est étranger, sinon « sans région ».
 * Domaines triés par bouteilles décroissantes.
 */
export function regionCounts(rows: CaveRow[]): { total: number; byRegion: Map<string, RegionCount>; horsFrance: RegionCount; sansRegion: number } {
  const byRegion = new Map<string, RegionCount>();
  const horsFrance: RegionCount = { bottles: 0, producers: [] };
  let total = 0;
  let sansRegion = 0;
  const add = (c: RegionCount, r: CaveRow) => {
    c.bottles += r.quantity;
    const key = r.producerKey ?? r.producer;
    const p = c.producers.find((x) => x.producerKey === key);
    if (p) p.bottles += r.quantity;
    else c.producers.push({ producer: r.producer, producerKey: key, bottles: r.quantity });
  };
  for (const r of rows) {
    if (r.quantity <= 0) continue;
    total += r.quantity;
    if (r.region) {
      if (!byRegion.has(r.region)) byRegion.set(r.region, { bottles: 0, producers: [] });
      add(byRegion.get(r.region)!, r);
    } else if (r.country === 'AUTRE') add(horsFrance, r);
    else sansRegion += r.quantity;
  }
  for (const c of [...byRegion.values(), horsFrance]) c.producers.sort((a, b) => b.bottles - a.bottles);
  return { total, byRegion, horsFrance, sansRegion };
}
