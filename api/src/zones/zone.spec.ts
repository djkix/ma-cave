import { BadRequestException } from '@nestjs/common';
import {
  acceptSuggestionSchema, cellNamesFor, CELL_NAME_TAKEN, gridCodes, INVALID_CELL_PREFIX, keptCellNames, renamePrefix, suggestPrefix, UNKNOWN_CELL, updateZoneSchema,
} from './zone';

const grid = { rows: 3, cols: 4 };
const fails = (f: () => unknown, message: string) => {
  expect(f).toThrow(BadRequestException);
  expect(f).toThrow(message);
};

describe('gridCodes', () => {
  it('codes <lettre><n>, rangée par rangée ; sans lettre (zone d’avant la 2.27) : « A » ; sans grille : aucun', () => {
    expect(gridCodes({ rows: 2, cols: 3 }, 'C')).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    expect(gridCodes({ rows: 4, cols: 12 }, 'A').at(-1)).toBe('A48');
    expect(gridCodes({ rows: 1, cols: 2 }, null)).toEqual(['A1', 'A2']);
    expect(gridCodes(null, 'A')).toEqual([]);
  });
});

describe('suggestPrefix', () => {
  it('lettre finale du nom (seule, après une espace, casse ignorée) si libre ; sinon première libre de A à Z ; aucune : null', () => {
    expect(suggestPrefix('Casier C', [])).toBe('C');
    expect(suggestPrefix('casier c', [])).toBe('C');
    expect(suggestPrefix(' Casier C ', [])).toBe('C');
    expect(suggestPrefix('Casier C', ['C'])).toBe('A');
    expect(suggestPrefix('Champagnes', ['A', 'B'])).toBe('C');
    expect(suggestPrefix('Mur AB', [])).toBe('A');
    expect(suggestPrefix('X', [])).toBe('A');
    expect(suggestPrefix('Casier Z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBeNull();
  });
});

describe('renamePrefix', () => {
  it('seules les clés <ancienne lettre><n> changent', () => {
    expect(renamePrefix({ A1: 'x', A12: 'y', B3: 'z' }, 'A', 'C')).toEqual({ C1: 'x', C12: 'y', B3: 'z' });
    expect(renamePrefix({ A1: [0, 0, 1, 1], AB: 'w', A0: 'v' }, 'A', 'C')).toEqual({ C1: [0, 0, 1, 1], AB: 'w', A0: 'v' });
  });
});

describe('cellNamesFor', () => {
  it('codes en majuscules, noms sans espaces autour ; nom vide = case sans nom', () => {
    expect(cellNamesFor({ c10: '  Champagnes ', C1: '', C4: '   ' }, grid, 'C')).toEqual({ C10: 'Champagnes' });
    expect(cellNamesFor({ c5: ' Loire ' }, { rows: 2, cols: 3 }, 'C')).toEqual({ C5: 'Loire' });
  });

  it('case hors de la grille, d’une autre lettre (ou zone sans grille) : 400 « Case inconnue dans cette zone »', () => {
    fails(() => cellNamesFor({ C13: 'Loire' }, grid, 'C'), UNKNOWN_CELL);
    fails(() => cellNamesFor({ C0: 'Loire' }, grid, 'C'), UNKNOWN_CELL);
    fails(() => cellNamesFor({ X: 'Loire' }, grid, 'C'), UNKNOWN_CELL);
    fails(() => cellNamesFor({ A1: 'x' }, { rows: 2, cols: 3 }, 'C'), UNKNOWN_CELL);
    fails(() => cellNamesFor({ A1: 'Loire' }, null, null), UNKNOWN_CELL);
    expect(cellNamesFor({}, null, null)).toEqual({});
    // Zone d'avant la 2.27 (sans lettre) : codes lus avec « A ».
    expect(cellNamesFor({ a12: 'Loire' }, grid, null)).toEqual({ A12: 'Loire' });
  });

  it('même nom pour deux cases (casse ignorée) ou nom égal au code d’une autre case : 400 « Ce nom est déjà pris dans cette zone »', () => {
    fails(() => cellNamesFor({ C1: 'Loire', C6: ' loire' }, grid, 'C'), CELL_NAME_TAKEN);
    fails(() => cellNamesFor({ C1: 'c6' }, grid, 'C'), CELL_NAME_TAKEN);
    expect(cellNamesFor({ C1: 'c1' }, grid, 'C')).toEqual({ C1: 'c1' });
  });
});

describe('keptCellNames', () => {
  it('grille réduite ou retirée : les noms des cases disparues sont supprimés', () => {
    const names = { C1: 'Bordeaux', C12: 'Champagnes', C6: 'Loire' };
    expect(keptCellNames(names, { rows: 2, cols: 4 }, 'C')).toEqual({ C1: 'Bordeaux', C6: 'Loire' });
    expect(keptCellNames(names, { rows: 3, cols: 3 }, 'C')).toEqual({ C1: 'Bordeaux', C6: 'Loire' });
    expect(keptCellNames(names, null, null)).toEqual({});
  });

  it('grille agrandie : un nom égal au code d’une nouvelle case est retiré (il désignerait deux cases)', () => {
    expect(keptCellNames({ C1: 'c7', C2: 'Loire', C3: 'c3' }, { rows: 3, cols: 3 }, 'C')).toEqual({ C2: 'Loire', C3: 'c3' });
  });
});

describe('updateZoneSchema (cellNames)', () => {
  it('un objet { code: nom } de 40 caractères au plus par nom', () => {
    expect(updateZoneSchema.safeParse({ cellNames: { A1: 'Bordeaux' } }).success).toBe(true);
    const long = updateZoneSchema.safeParse({ cellNames: { A1: 'x'.repeat(41) } });
    expect(long.success || long.error.issues[0].message).toBe('Le nom d\'une case fait 40 caractères au plus');
    const bad = updateZoneSchema.safeParse({ cellNames: ['A1'] });
    expect(bad.success || bad.error.issues[0].message).toBe('Noms des cases invalides');
  });
});

describe('cellPrefix (updateZoneSchema, acceptSuggestionSchema)', () => {
  it('une lettre, mise en majuscule ; facultative', () => {
    expect(updateZoneSchema.parse({ cellPrefix: 'c' }).cellPrefix).toBe('C');
    expect(updateZoneSchema.parse({}).cellPrefix).toBeUndefined();
    expect(acceptSuggestionSchema.parse({ name: 'Casier C', rows: 2, cols: 3, cellPrefix: 'd' }).cellPrefix).toBe('D');
    expect(acceptSuggestionSchema.parse({ name: 'Casier C', rows: 2, cols: 3 }).cellPrefix).toBeUndefined();
  });

  it('autre chose qu’une lettre de A à Z : « La lettre des cases est une lettre de A à Z »', () => {
    for (const cellPrefix of ['CC', '1', 'É', '', 3]) {
      const r = updateZoneSchema.safeParse({ cellPrefix });
      expect(r.success || r.error.issues[0].message).toBe(INVALID_CELL_PREFIX);
    }
    const r = acceptSuggestionSchema.safeParse({ name: 'Casier C', rows: 2, cols: 3, cellPrefix: 'CC' });
    expect(r.success || r.error.issues[0].message).toBe(INVALID_CELL_PREFIX);
  });
});
