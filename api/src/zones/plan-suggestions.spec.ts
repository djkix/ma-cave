import { nameBlocks, RawBlock, unitsToBlocks, validBlocks } from './plan-suggestions';

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

describe('unitsToBlocks', () => {
  /** Case telle que Gemini la rend : [ymin, xmin, ymax, xmax] en millièmes. */
  const cell = (y0: number, x0: number, y1: number, x1: number) => ({ box_2d: [y0, x0, y1, x1] });
  /** Grille régulière de cases de `w` × `h` millièmes, coin haut gauche (x, y). */
  const grid = (x: number, y: number, cols: number, rows: number, w = 100, h = 100) =>
    Array.from({ length: rows * cols }, (_, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      return cell(y + r * h, x + c * w, y + (r + 1) * h, x + (c + 1) * w);
    });

  it('grille régulière 4 × 4 : 4 rangées, 4 colonnes, cadre = union des cases', () => {
    expect(unitsToBlocks({ length: 1 })).toEqual([]);
    expect(unitsToBlocks([{ kind: 'CASIER', cells: grid(100, 200, 4, 4) }])).toEqual([{ kind: 'CASIER', box: [0.1, 0.2, 0.5, 0.6], rows: 4, cols: 4 }]);
  });

  it('2 colonnes × 4 rangées : rows 4, cols 2', () => {
    expect(unitsToBlocks([{ kind: 'ETAGERE', cells: grid(0, 0, 2, 4) }])).toEqual([{ kind: 'ETAGERE', box: [0, 0, 0.2, 0.4], rows: 4, cols: 2 }]);
  });

  it('meuble irrégulier : 2 cases larges en haut, 4 en dessous sur 2 colonnes décalées → 6 cases, rows 3, cols 2', () => {
    const cells = [
      cell(0, 0, 200, 500), cell(0, 500, 200, 1000),
      cell(200, 100, 400, 500), cell(200, 500, 400, 900),
      cell(400, 100, 600, 500), cell(400, 500, 600, 900),
    ];
    expect(unitsToBlocks([{ kind: 'CASIER', cells }])).toEqual([{ kind: 'CASIER', box: [0, 0, 1, 0.6], rows: 3, cols: 2 }]);
  });

  it('légère inclinaison : centres d’une même rangée décalés de 10 % de la hauteur de case, même nombre de rangées', () => {
    // Chaque colonne descend de 10 millièmes (10 % d'une case de 100) de plus que la précédente.
    const cells = grid(0, 0, 4, 4).map((c, i) => {
      const shift = (i % 4) * 10;
      const [y0, x0, y1, x1] = c.box_2d;
      return cell(y0 + shift, x0, y1 + shift, x1);
    });
    expect(unitsToBlocks([{ kind: 'CASIER', cells }])).toMatchObject([{ rows: 4, cols: 4 }]);
  });

  it('perspective modérée : chaque colonne rétrécit autour du milieu (100 %, 95 %, 90 %), mêmes rangées et colonnes', () => {
    const cells = grid(0, 0, 3, 4).map((c, i) => {
      const scale = 1 - (i % 3) * 0.05;
      const [y0, x0, y1, x1] = c.box_2d;
      return cell(200 + (y0 - 200) * scale, x0, 200 + (y1 - 200) * scale, x1);
    });
    expect(unitsToBlocks([{ kind: 'CASIER', cells }])).toMatchObject([{ rows: 4, cols: 3 }]);
  });

  it('colonnes de cases hautes de 2 rangées à côté d’une colonne de 4 rangées normales : 4 rangées', () => {
    expect(unitsToBlocks([{ kind: 'CASIER', cells: [...grid(0, 0, 2, 2, 100, 200), ...grid(200, 0, 1, 4)] }])).toMatchObject([{ rows: 4, cols: 3 }]);
  });

  it('2 rangées basses puis 2 rangées hautes : 4 rangées', () => {
    expect(unitsToBlocks([{ kind: 'CASIER', cells: [...grid(0, 0, 2, 2, 100, 40), ...grid(0, 80, 2, 2, 100, 160)] }])).toMatchObject([{ rows: 4, cols: 2 }]);
  });

  it('cases invalides ignorées (hors bornes, inversées, aire nulle, mal formées) ; unité de moins de 2 cases valides ignorée', () => {
    const cells = [
      ...grid(0, 0, 2, 1),
      cell(0, 0, 100, 1200), cell(300, 0, 200, 100), cell(0, 100, 0, 200), { box_2d: [0, 0, 100] }, { box_2d: ['0', 0, 100, 100] }, null,
    ];
    expect(unitsToBlocks([
      { kind: 'CASIER', cells },
      { kind: 'CASIER', cells: [cell(500, 500, 600, 600), cell(500, 600, 500, 700)] },
      { kind: 'CAVE', cells: grid(0, 0, 2, 2) },
      { kind: 'AUTRE' },
      null,
    ])).toEqual([{ kind: 'CASIER', box: [0, 0, 0.2, 0.1], rows: 1, cols: 2 }]);
  });

  it('grilles bornées à 26 rangées et 30 colonnes', () => {
    expect(unitsToBlocks([{ kind: 'CASIER', cells: grid(0, 0, 40, 30, 25, 30) }])).toMatchObject([{ rows: 26, cols: 30 }]);
  });

  it('trois meubles accolés : trois blocs distincts, chacun avec son cadre', () => {
    expect(unitsToBlocks([
      { kind: 'CASIER', cells: grid(0, 100, 4, 4) },
      { kind: 'CASIER', cells: grid(400, 100, 2, 4) },
      { kind: 'CASIER', cells: [...grid(600, 100, 2, 2), ...grid(600, 300, 1, 2, 200)] },
    ])).toEqual([
      { kind: 'CASIER', box: [0, 0.1, 0.4, 0.5], rows: 4, cols: 4 },
      { kind: 'CASIER', box: [0.4, 0.1, 0.6, 0.5], rows: 4, cols: 2 },
      { kind: 'CASIER', box: [0.6, 0.1, 0.8, 0.5], rows: 4, cols: 2 },
    ]);
  });
});
