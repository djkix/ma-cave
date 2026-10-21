import { nameBlocks, RawBlock, validBlocks } from './plan-suggestions';

const block = (kind: RawBlock['kind'], x0: number, y0 = 0.1, rows = 4, cols = 6): RawBlock => ({ kind, box: [x0, y0, x0 + 0.1, y0 + 0.2], rows, cols });

describe('validBlocks', () => {
  it('garde les blocs valides, ignore les autres', () => {
    const ok = block('CASIER', 0.2);
    expect(validBlocks([
      ok,
      { ...ok, kind: 'CAVE' },
      { ...ok, box: [0.5, 0.1, 0.4, 0.3] }, // x0 > x1
      { ...ok, box: [0.1, 0.3, 0.2, 0.3] }, // y0 = y1
      { ...ok, box: [-0.1, 0.1, 0.2, 0.3] },
      { ...ok, box: [0.1, 0.1, 1.2, 0.3] },
      { ...ok, box: [0.1, 0.1, 0.2] },
      { ...ok, box: [0.1, '0.1', 0.2, 0.3] },
      { ...ok, rows: 0 },
      { ...ok, rows: 27 },
      { ...ok, cols: 31 },
      { ...ok, cols: 2.5 },
      null,
      'casier',
      { ...block('ETAGERE', 0.6, 0.1, 26, 30), extra: 'ignoré' },
    ])).toEqual([ok, block('ETAGERE', 0.6, 0.1, 26, 30)]);
  });

  it('réponse qui n’est pas une liste : aucun bloc', () => {
    expect(validBlocks(undefined)).toEqual([]);
    expect(validBlocks({ blocks: [] })).toEqual([]);
  });

  it('13 blocs valides : 12 gardés', () => {
    expect(validBlocks(Array.from({ length: 13 }, (_, i) => block('CASIER', i * 0.05)))).toHaveLength(12);
  });
});

describe('nameBlocks', () => {
  it('tri par x0 puis y0 ; une lettre par bloc, tous types confondus', () => {
    const named = nameBlocks([block('ETAGERE', 0.5), block('AUTRE', 0.1, 0.6), block('CASIER', 0.1, 0.2)], []);
    expect(named.map((s) => s.name)).toEqual(['Casier A', 'Rangement B', 'Étagère C']);
    expect(named[0]).toEqual({ ...block('CASIER', 0.1, 0.2), id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: 'Casier A' });
    expect(new Set(named.map((s) => s.id)).size).toBe(3);
  });

  it('« Casier A » puis « Étagère B »', () => {
    expect(nameBlocks([block('CASIER', 0.1), block('ETAGERE', 0.5)], []).map((s) => s.name)).toEqual(['Casier A', 'Étagère B']);
  });

  it('saute une lettre prise par une zone active, sans tenir compte de la casse', () => {
    expect(nameBlocks([block('CASIER', 0.1), block('ETAGERE', 0.5)], ['casier a', 'Cave du bas']).map((s) => s.name)).toEqual(['Casier B', 'Étagère C']);
    expect(nameBlocks([block('CASIER', 0.1)], ['ÉTAGÈRE A', 'Rangement B']).map((s) => s.name)).toEqual(['Casier C']);
    // « Étagère A » saisi en forme décomposée (E + accent combinant) : même nom.
    expect(nameBlocks([block('CASIER', 0.1)], ['E\u0301tage\u0300re A']).map((s) => s.name)).toEqual(['Casier B']);
  });

  it('une lettre seulement employée par une zone archivée (non passée par l’appelant) n’est pas sautée', () => {
    expect(nameBlocks([block('CASIER', 0.1)], []).map((s) => s.name)).toEqual(['Casier A']);
  });
});
