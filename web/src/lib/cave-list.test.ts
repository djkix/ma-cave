import { Apogee, CaveRow } from './api-client';
import { ActiveFilterState, activeFilters, apogeeTone, caveSummary, sortCave } from './cave-list';

const ap = (status: Apogee['status']): Apogee => ({ min: 2020, max: 2030, confidence: null, status, reason: null, source: null });

it('résume en bouteilles et références, au singulier jusqu’à un', () => {
  expect(caveSummary([{ quantity: 4 }, { quantity: 0 }, { quantity: 6 }])).toEqual({ bottles: '10 bouteilles', references: '3 références' });
  expect(caveSummary([{ quantity: 1 }])).toEqual({ bottles: '1 bouteille', references: '1 référence' });
  expect(caveSummary([])).toEqual({ bottles: '0 bouteille', references: '0 référence' });
});

it('donne la teinte de la pastille selon l’état d’apogée', () => {
  expect(apogeeTone(ap('A_BOIRE'))?.tone).toBe('ok');
  expect(apogeeTone(ap('A_BOIRE_VITE'))?.tone).toBe('soon');
  expect(apogeeTone(ap('PASSEE'))?.tone).toBe('soon');
  expect(apogeeTone(ap('TROP_JEUNE'))?.tone).toBe('young');
  expect(apogeeTone(ap(null))).toBeNull();
});

const row = (id: string, o: Partial<CaveRow>): CaveRow => ({
  id, producer: id, cuvee: null, appellationRaw: 'x', vintage: null, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 1, ...o,
});
const wines = [
  row('a', { vintage: 2015, quantity: 2, apogee: { ...ap('A_BOIRE'), max: 2030 }, rating: { value: 15, ratedAt: '', ratedBy: null }, createdAt: '2026-01-01T00:00:00Z' }),
  row('b', { vintage: null, quantity: 6, createdAt: '2026-06-01T00:00:00Z' }),
  row('c', { vintage: 2010, quantity: 1, apogee: { ...ap('PASSEE'), max: 2024 }, rating: { value: 18, ratedAt: '', ratedBy: null } }),
];
const ids = (s: Parameters<typeof sortCave>[1]) => sortCave(wines, s).map((w) => w.id);

it('trie la cave ; valeur absente en dernier, égalités dans l’ordre de l’api', () => {
  expect(ids('nom')).toEqual(['a', 'b', 'c']);
  expect(ids('apogee')).toEqual(['c', 'a', 'b']);
  expect(ids('millesime')).toEqual(['c', 'a', 'b']);
  expect(ids('quantite')).toEqual(['b', 'a', 'c']);
  expect(ids('note')).toEqual(['c', 'a', 'b']);
  expect(ids('recent')).toEqual(['b', 'a', 'c']);
  expect(wines.map((w) => w.id)).toEqual(['a', 'b', 'c']);
});

const none: ActiveFilterState = { color: '', colorLabel: '', aromas: [], vintage: '', tannin: '', locationLabel: '', regionLabel: '', apogeeFilter: '', includeEmpty: false };

it('liste les filtres actifs dans l’ordre du panneau', () => {
  expect(activeFilters({ ...none, aromas: [] })).toEqual([]);
  expect(activeFilters({ ...none, vintage: 'abc' })).toEqual([]);
  expect(activeFilters({ color: 'ROUGE', colorLabel: 'Rouge', aromas: ['boisé', 'noisette'], vintage: '2018', tannin: 'PUISSANT', locationLabel: 'Cave 1 / A',
    regionLabel: 'Bourgogne', apogeeFilter: 'drinkSoon', includeEmpty: true }).map((f) => f.label)).toEqual([
    'Rouge', 'Arômes : boisé, noisette', 'Millésime 2018', 'Tanin : Puissant', 'Emplacement : Cave 1 / A', 'Bourgogne', 'À boire en priorité', 'Vins épuisés']);
});
