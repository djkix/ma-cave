import type { CaveRow } from './api-client';
import { regionCounts } from './region-counts';

const row = (o: Partial<CaveRow>): CaveRow => ({
  id: 'x', producer: 'P', cuvee: null, appellationRaw: '', vintage: null, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 1, ...o,
});

it('ignore les bouteilles épuisées, range sans région et hors de France à part, trie les domaines', () => {
  const c = regionCounts([
    row({ region: 'Bourgogne', producer: 'Rapet', producerKey: 'rapet', quantity: 2 }),
    row({ region: 'Bourgogne', producer: 'Faiveley', producerKey: 'faiveley', quantity: 5 }),
    row({ region: 'Bourgogne', producer: 'Rapet', producerKey: 'rapet', quantity: 4 }),
    row({ region: 'Bourgogne', producer: 'Jadot', producerKey: 'jadot', quantity: 0 }),
    row({ region: null, country: 'FR', quantity: 3 }),
    row({ region: null, country: null, quantity: 1 }),
    row({ region: null, country: 'AUTRE', producer: 'Vega Sicilia', producerKey: 'vega', quantity: 2 }),
  ]);
  expect(c.total).toBe(17);
  expect(c.sansRegion).toBe(4);
  expect(c.horsFrance).toEqual({ bottles: 2, producers: [{ producer: 'Vega Sicilia', producerKey: 'vega', bottles: 2 }] });
  expect(c.byRegion.get('Bourgogne')).toEqual({
    bottles: 11,
    producers: [
      { producer: 'Rapet', producerKey: 'rapet', bottles: 6 },
      { producer: 'Faiveley', producerKey: 'faiveley', bottles: 5 },
    ],
  });
});

it('liste vide : total 0', () => {
  const c = regionCounts([]);
  expect(c.total).toBe(0);
  expect(c.byRegion.size).toBe(0);
  expect(c.horsFrance.bottles).toBe(0);
  expect(c.sansRegion).toBe(0);
});
