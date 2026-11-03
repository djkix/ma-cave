import { CaveRow, countryOf, filterCave, publishedRegion } from './cave-filter';

const row = (id: string, producer: string, appellationRaw: string, quantity: number, extra: Partial<CaveRow> = {}): CaveRow => ({
  id, producer, cuvee: null, appellationRaw, vintage: 2019, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity, ...extra,
});

const rows = [
  row('a', 'Château de Beaucastel', 'Châteauneuf-du-Pape', 3),
  row('b', 'Domaine Tempier', 'Bandol', 0),
  row('c', 'Domaine Leflaive', 'Puligny-Montrachet', 2, { color: 'BLANC', cuvee: 'Clavoillon' }),
];

describe('filterCave', () => {
  it('masque les vins épuisés par défaut', () => {
    expect(filterCave(rows, {}).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('les montre sur demande', () => {
    expect(filterCave(rows, { includeEmpty: true }).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(filterCave(rows, { q: 'chateauneuf' }).map((r) => r.id)).toEqual(['a']);
  });

  it('cherche aussi dans la cuvée', () => {
    expect(filterCave(rows, { q: 'CLAVOILLON' }).map((r) => r.id)).toEqual(['c']);
  });

  it('exige tous les mots de la recherche', () => {
    expect(filterCave(rows, { q: 'leflaive puligny' }).map((r) => r.id)).toEqual(['c']);
    expect(filterCave(rows, { q: 'leflaive bandol' })).toEqual([]);
  });

  it('filtre par couleur', () => {
    expect(filterCave(rows, { color: 'BLANC' }).map((r) => r.id)).toEqual(['c']);
  });

  describe('caractéristiques', () => {
    const w = [
      row('a', 'A', 'x', 1, { vintage: 2012, aromas: ['boisé', 'noisette'], tannin: 'MOYEN', region: 'Bourgogne', appellationId: 'ap' }),
      row('b', 'B', 'x', 1, { vintage: 2015, aromas: ['boisé'], tannin: 'LEGER', region: 'Rhône' }),
      row('c', 'C', 'x', 1, { vintage: 2018, aromas: [], tannin: null, country: 'AUTRE' }),
      row('d', 'D', 'x', 1, { vintage: null }),
    ];
    const ids = (f: Parameters<typeof filterCave>[1]) => filterCave(w, f).map((r) => r.id);
    it('arômes : tous requis', () => expect(ids({ aromas: ['boisé', 'noisette'] })).toEqual(['a']));
    it('millésime minimum seul', () => expect(ids({ vintageMin: 2015 })).toEqual(['b', 'c']));
    it('millésime maximum seul', () => expect(ids({ vintageMax: 2015 })).toEqual(['a', 'b']));
    it('tanin', () => expect(ids({ tannin: 'MOYEN' })).toEqual(['a']));
    it('région', () => expect(ids({ region: 'Bourgogne' })).toEqual(['a']));
    it('hors France', () => expect(ids({ region: 'HORS_FRANCE' })).toEqual(['c']));
    it('pays : appellation reconnue = FR', () => {
      expect(countryOf({ appellationId: 'x', country: 'AUTRE' })).toBe('FR');
      expect(countryOf({ appellationId: null, country: null })).toBeNull();
    });
  });

  describe('région publiée', () => {
    it('manuelle > référentiel > IA', () => {
      expect(publishedRegion({ refRegion: 'Rhône', aiRegion: 'Loire', traitsManual: ['region'] })).toEqual({ region: 'Loire', regionSource: 'MANUEL' });
      expect(publishedRegion({ refRegion: 'Rhône', aiRegion: 'Loire', traitsManual: [] })).toEqual({ region: 'Rhône', regionSource: 'REFERENTIEL' });
      expect(publishedRegion({ refRegion: null, aiRegion: 'Loire', traitsManual: null })).toEqual({ region: 'Loire', regionSource: 'IA' });
      expect(publishedRegion({})).toEqual({ region: null, regionSource: null });
    });
    it('région manuelle effacée : null, même avec une appellation reconnue', () => {
      expect(publishedRegion({ refRegion: 'Rhône', aiRegion: null, traitsManual: ['region'], appellationId: 'ap' })).toEqual({ region: null, regionSource: 'MANUEL' });
    });
    it('pays manuel AUTRE sur une appellation reconnue : hors de France, sans région', () => {
      const r = { appellationId: 'ap', country: 'AUTRE' as const, traitsManual: ['country'], refRegion: 'Bordeaux' };
      expect(countryOf(r)).toBe('AUTRE');
      expect(publishedRegion(r)).toEqual({ region: null, regionSource: null });
      const found = filterCave([row('x', 'X', 'Bordeaux', 1, { ...r, ...publishedRegion(r) })], { region: 'HORS_FRANCE' });
      expect(found.map((f) => f.id)).toEqual(['x']);
    });
    it('pays manuel FR l’emporte sur un pays IA AUTRE', () => {
      expect(countryOf({ appellationId: null, country: 'FR', traitsManual: ['country'] })).toBe('FR');
      expect(countryOf({ appellationId: 'ap', country: 'AUTRE', traitsManual: [] })).toBe('FR');
    });
  });
});
