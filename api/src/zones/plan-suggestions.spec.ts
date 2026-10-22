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
    expect(unitsToBlocks([{ kind: 'CASIER', cells: grid(100, 200, 4, 4) }])).toMatchObject([{ kind: 'CASIER', box: [0.1, 0.2, 0.5, 0.6], rows: 4, cols: 4 }]);
  });

  it('2 colonnes × 4 rangées : rows 4, cols 2', () => {
    expect(unitsToBlocks([{ kind: 'ETAGERE', cells: grid(0, 0, 2, 4) }])).toMatchObject([{ kind: 'ETAGERE', box: [0, 0, 0.2, 0.4], rows: 4, cols: 2 }]);
  });

  it('meuble irrégulier : 2 cases larges en haut, 4 en dessous sur 2 colonnes décalées → 6 cases, rows 3, cols 2', () => {
    const cells = [
      cell(0, 0, 200, 500), cell(0, 500, 200, 1000),
      cell(200, 100, 400, 500), cell(200, 500, 400, 900),
      cell(400, 100, 600, 500), cell(400, 500, 600, 900),
    ];
    expect(unitsToBlocks([{ kind: 'CASIER', cells }])).toMatchObject([{ kind: 'CASIER', box: [0, 0, 1, 0.6], rows: 3, cols: 2 }]);
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
    ])).toMatchObject([{ kind: 'CASIER', box: [0, 0, 0.2, 0.1], rows: 1, cols: 2, cellCount: 2 }]);
  });

  it('grilles bornées à 26 rangées et 30 colonnes', () => {
    expect(unitsToBlocks([{ kind: 'CASIER', cells: grid(0, 0, 40, 30, 25, 30) }])).toMatchObject([{ rows: 26, cols: 30 }]);
  });

  it('trois meubles accolés : trois blocs distincts, chacun avec son cadre', () => {
    expect(unitsToBlocks([
      { kind: 'CASIER', cells: grid(0, 100, 4, 4) },
      { kind: 'CASIER', cells: grid(400, 100, 2, 4) },
      { kind: 'CASIER', cells: [...grid(600, 100, 2, 2), ...grid(600, 300, 1, 2, 200)] },
    ])).toMatchObject([
      { kind: 'CASIER', box: [0, 0.1, 0.4, 0.5], rows: 4, cols: 4 },
      { kind: 'CASIER', box: [0.4, 0.1, 0.6, 0.5], rows: 4, cols: 2 },
      { kind: 'CASIER', box: [0.6, 0.1, 0.8, 0.5], rows: 4, cols: 2 },
    ]);
  });

  /**
   * Mur de 12 colonnes × 4 rangées en forte perspective horizontale : colonnes
   * verticales de 250 à 50 de large (en proportion, sur 950 millièmes), mur
   * haut de 800 au premier plan et de 160 au fond, tablettes qui descendent
   * vers le fond (celle du haut passe de 50 à 520 : bien plus qu'une hauteur de
   * case). Chaque case est un trapèze dont on prend le cadre. `vertical` : axes
   * échangés, 4 rangées horizontales de hauteurs décroissantes (250 à 175) et
   * 12 colonnes inclinées qui se resserrent vers le bas (rapport 0,7 : sur 4
   * rangées, un rapport de 5 décalerait les colonnes du bord de deux cases
   * d'une tablette à l'autre, illisible même à l'œil). `angle` : rotation en
   * degrés autour du centre ; `missing` : cases [rangée, colonne] oubliées ;
   * `drop` : descente des tablettes d'un bout à l'autre ; `jitter` : bruit
   * sur chaque bord, en fraction de la case (tirage fixé par `seed`).
   * Cases rendues colonne par colonne (rangée par rangée si `vertical`).
   */
  type WallOptions = { vertical?: boolean; angle?: number; missing?: [number, number][]; drop?: number; jitter?: number; seed?: number };
  const wall = ({ vertical = false, angle = 0, missing = [], drop = vertical ? 0 : 150, jitter = 0, seed = 1 }: WallOptions = {}) => {
    let state = seed;
    const rnd = () => ((state = (state * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    const [along, across, far] = vertical ? [4, 12, 0.7] : [12, 4, 0.2];
    const raw = Array.from({ length: along }, (_, i) => 250 * (1 - ((1 - far) * i) / (along - 1)));
    const k = 950 / raw.reduce((a, b) => a + b);
    const height = (x: number) => 800 - ((x - 20) / 950) * 800 * (1 - far);
    const mid = (x: number) => 450 + ((x - 20) / 950) * drop;
    const shelf = (r: number, x: number) => mid(x) + (r / across - 0.5) * height(x);
    const t = (angle * Math.PI) / 180;
    const place = ([x, y]: [number, number]): [number, number] => {
      const [u, v] = vertical ? [y, x] : [x, y];
      return [500 + (u - 500) * Math.cos(t) - (v - 500) * Math.sin(t), 500 + (u - 500) * Math.sin(t) + (v - 500) * Math.cos(t)];
    };
    const cells = [];
    let x = 20;
    for (let l = 0; l < along; l++) {
      const x1 = x + raw[l] * k;
      for (let a = 0; a < across; a++) {
        const [row, col] = vertical ? [l, a] : [a, l];
        if (missing.some(([mr, mc]) => mr === row && mc === col)) continue;
        const pts = ([[x, shelf(a, x)], [x1, shelf(a, x1)], [x, shelf(a + 1, x)], [x1, shelf(a + 1, x1)]] as [number, number][]).map(place);
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
        const [y0, x0, y1, xx1] = [Math.min(...ys) + rnd() * jitter * h, Math.min(...xs) + rnd() * jitter * w, Math.max(...ys) + rnd() * jitter * h, Math.max(...xs) + rnd() * jitter * w]
          .map((v) => Math.round(Math.min(1000, Math.max(0, v))));
        cells.push(cell(y0, x0, y1, xx1));
      }
      x = x1;
    }
    return cells;
  };
  /** Noms attendus des cases du mur, dans l'ordre où `wall` les rend. */
  const wallNames = ({ vertical = false, missing = [] }: WallOptions = {}) => {
    const [along, across] = vertical ? [4, 12] : [12, 4];
    return Array.from({ length: along * across }, (_, i) => (vertical ? [Math.floor(i / across), i % across] : [i % across, Math.floor(i / across)]))
      .filter(([r, c]) => !missing.some(([mr, mc]) => mr === r && mc === c))
      .map(([r, c]) => `${String.fromCharCode(65 + r)}${c + 1}`);
  };
  const namesOf = (o: WallOptions) => unitsToBlocks([{ kind: 'CASIER', cells: wall(o) }])[0].cells!.map((c) => c.name);
  const names = (rows: number, cols: number) =>
    Array.from({ length: rows * cols }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / cols))}${(i % cols) + 1}`);

  it('mur 12 × 4 en forte perspective horizontale : 4 rangées, 12 colonnes, 48 cases', () => {
    const [b] = unitsToBlocks([{ kind: 'CASIER', cells: wall() }]);
    expect(b).toMatchObject({ rows: 4, cols: 12, cellCount: 48 });
    expect(b.cells).toHaveLength(48);
  });

  it('cases nommées rangée par rangée depuis la topologie : A1 en haut à gauche, D12 en bas à droite', () => {
    const [b] = unitsToBlocks([{ kind: 'CASIER', cells: wall() }]);
    // Le mur est rendu colonne par colonne : noms triés pour les comparer à la grille.
    expect(b.cells!.map((c) => c.name).sort()).toEqual(names(4, 12).sort());
    expect(b.cells![0]).toMatchObject({ row: 0, col: 0, name: 'A1' });
    expect(b.cells![1]).toMatchObject({ row: 1, col: 0, name: 'B1' });
    expect(b.cells![47]).toMatchObject({ row: 3, col: 11, name: 'D12' });
    expect(b.cells![0].box).toEqual(wall()[0].box_2d.map((v, i, a) => a[[1, 0, 3, 2][i]] / 1000));
  });

  it('le même mur en perspective verticale (rangées horizontales, colonnes inclinées) : 4 rangées, 12 colonnes', () => {
    const [b] = unitsToBlocks([{ kind: 'CASIER', cells: wall({ vertical: true }) }]);
    expect(b).toMatchObject({ rows: 4, cols: 12, cellCount: 48 });
    expect(b.cells!.map((c) => c.name)).toEqual(names(4, 12));
  });

  it('perspective et légère rotation : 4 rangées, 12 colonnes', () => {
    for (const angle of [3, -3]) {
      expect(unitsToBlocks([{ kind: 'CASIER', cells: wall({ angle }) }])).toMatchObject([{ rows: 4, cols: 12, cellCount: 48 }]);
      expect(unitsToBlocks([{ kind: 'CASIER', cells: wall({ vertical: true, angle }) }])).toMatchObject([{ rows: 4, cols: 12, cellCount: 48 }]);
    }
  });

  it('3 cases oubliées sur 48 : grille 4 × 12, 45 cases ; leurs noms manquent sans décaler les autres', () => {
    const [b] = unitsToBlocks([{ kind: 'CASIER', cells: wall({ missing: [[0, 5], [2, 0], [3, 11]] }) }]);
    expect(b).toMatchObject({ rows: 4, cols: 12, cellCount: 45 });
    expect(b.cells!.map((c) => c.name).sort()).toEqual(names(4, 12).filter((n) => !['A6', 'C1', 'D12'].includes(n)).sort());
  });

  it('case oubliée dont la voisine de la colonne suivante est d’une autre rangée : noms gardés (un seul prédécesseur par case)', () => {
    for (const missing of [[[1, 9]], [[0, 9]], [[1, 3]], [[0, 8], [1, 10], [3, 9]]] as [number, number][][]) {
      expect(namesOf({ missing })).toEqual(wallNames({ missing }));
    }
    expect(namesOf({ vertical: true, missing: [[1, 5]] })).toEqual(wallNames({ vertical: true, missing: [[1, 5]] }));
  });

  it('cadres bruités (± 10 % de la case sur chaque bord) : 4 × 12 et noms gardés', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(unitsToBlocks([{ kind: 'CASIER', cells: wall({ jitter: 0.1, seed }) }])).toMatchObject([{ rows: 4, cols: 12 }]);
      expect(namesOf({ jitter: 0.1, seed })).toEqual(wallNames());
    }
  });

  it('rangée partielle loin de sa place moyenne (tablettes très inclinées, rangée du haut seulement au fond) : rangées ordonnées par voisinage', () => {
    const missing = Array.from({ length: 9 }, (_, c) => [0, c] as [number, number]);
    expect(namesOf({ drop: 300, missing })).toEqual(wallNames({ missing }));
    const bottom = Array.from({ length: 9 }, (_, c) => [3, c + 3] as [number, number]);
    expect(namesOf({ drop: 300, missing: bottom })).toEqual(wallNames({ missing: bottom }));
  });

  it('colonnes incohérentes, rangées cohérentes : rang dans la rangée pour les rangées complètes, sans nom ailleurs', () => {
    // Trois cases en haut, une case large sous les deux premières, une sous la troisième.
    const [b] = unitsToBlocks([{ kind: 'CASIER', cells: [...grid(0, 0, 3, 1), cell(100, 0, 200, 200), cell(100, 200, 200, 300), ...grid(0, 200, 3, 1)] }]);
    expect(b).toMatchObject({ rows: 3, cols: 3 });
    expect(b.cells!.map((c) => c.name)).toEqual(['A1', 'A2', 'A3', null, null, 'C1', 'C2', 'C3']);
  });

  it('casier irrégulier en perspective : 2 colonnes de cases hautes de 2 rangées à côté d’une colonne de 4, plus petite et plus bas → 4 rangées', () => {
    const cells = [...grid(0, 100, 2, 2, 150, 300), cell(250, 300, 330, 400), cell(330, 300, 410, 400), cell(410, 300, 490, 400), cell(490, 300, 570, 400)];
    expect(unitsToBlocks([{ kind: 'CASIER', cells }])).toMatchObject([{ rows: 4, cols: 3, cellCount: 8 }]);
  });

  it('au plus 200 cases gardées ; rangée ou colonne indéterminée : nom absent, cadre gardé', () => {
    const [big] = unitsToBlocks([{ kind: 'CASIER', cells: grid(0, 0, 30, 10, 30, 90) }]);
    expect(big).toMatchObject({ cellCount: 300 });
    expect(big.cells).toHaveLength(200);
    // Deux cases en haut, une case large dessous : colonnes incohérentes (une case sous deux colonnes) ;
    // la rangée du haut, complète, nomme ses cases, la case large n'a pas de colonne.
    const [odd] = unitsToBlocks([{ kind: 'CASIER', cells: [...grid(0, 0, 2, 1), cell(100, 0, 200, 200)] }]);
    expect(odd).toMatchObject({ rows: 2, cols: 2, cellCount: 3 });
    expect(odd.cells).toEqual([
      { box: [0, 0, 0.1, 0.1], row: 0, col: 0, name: 'A1' },
      { box: [0.1, 0, 0.2, 0.1], row: 0, col: 1, name: 'A2' },
      { box: [0, 0.1, 0.2, 0.2], row: 1, col: null, name: null },
    ]);
  });
});

describe('validBlocks : cases repérées', () => {
  it('garde cellCount et cells des blocs issus de unitsToBlocks', () => {
    const b: RawBlock = { kind: 'CASIER', box: [0, 0, 0.1, 0.1], rows: 1, cols: 1, cellCount: 1, cells: [{ box: [0, 0, 0.1, 0.1], row: 0, col: 0, name: 'A1' }] };
    expect(validBlocks([b])).toEqual([b]);
    const bad = [{ box: [0, 0, 1.2, 0.1] }, { box: [0.2, 0, 0.1, 0.1] }, { box: [0, 0, 0.1] }, null];
    expect(validBlocks([{ ...b, cells: [...bad, ...b.cells!] }])).toEqual([b]);
  });
});
