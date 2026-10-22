import { BadRequestException } from '@nestjs/common';
import { cellNamesFor, CELL_NAME_TAKEN, keptCellNames, UNKNOWN_CELL, updateZoneSchema } from './zone';

const grid = { rows: 3, cols: 4 };
const fails = (f: () => unknown, message: string) => {
  expect(f).toThrow(BadRequestException);
  expect(f).toThrow(message);
};

describe('cellNamesFor', () => {
  it('codes en majuscules, noms sans espaces autour ; nom vide = case sans nom', () => {
    expect(cellNamesFor({ b3: '  Champagnes ', A1: '', C4: '   ' }, grid)).toEqual({ B3: 'Champagnes' });
  });

  it('case hors de la grille (ou zone sans grille) : 400 « Case inconnue dans cette zone »', () => {
    fails(() => cellNamesFor({ D1: 'Loire' }, grid), UNKNOWN_CELL);
    fails(() => cellNamesFor({ A5: 'Loire' }, grid), UNKNOWN_CELL);
    fails(() => cellNamesFor({ X: 'Loire' }, grid), UNKNOWN_CELL);
    fails(() => cellNamesFor({ A1: 'Loire' }, null), UNKNOWN_CELL);
    expect(cellNamesFor({}, null)).toEqual({});
  });

  it('même nom pour deux cases (casse ignorée) ou nom égal au code d’une autre case : 400 « Ce nom est déjà pris dans cette zone »', () => {
    fails(() => cellNamesFor({ A1: 'Loire', B2: ' loire' }, grid), CELL_NAME_TAKEN);
    fails(() => cellNamesFor({ A1: 'b2' }, grid), CELL_NAME_TAKEN);
    expect(cellNamesFor({ A1: 'a1' }, grid)).toEqual({ A1: 'a1' });
  });
});

describe('keptCellNames', () => {
  it('grille réduite ou retirée : les noms des cases disparues sont supprimés', () => {
    const names = { A1: 'Bordeaux', C4: 'Champagnes', B2: 'Loire' };
    expect(keptCellNames(names, { rows: 2, cols: 4 })).toEqual({ A1: 'Bordeaux', B2: 'Loire' });
    expect(keptCellNames(names, { rows: 3, cols: 3 })).toEqual({ A1: 'Bordeaux', B2: 'Loire' });
    expect(keptCellNames(names, null)).toEqual({});
  });

  it('grille agrandie : un nom égal au code d’une nouvelle case est retiré (il désignerait deux cases)', () => {
    expect(keptCellNames({ A1: 'c1', A2: 'Loire', B1: 'b1' }, { rows: 3, cols: 2 })).toEqual({ A2: 'Loire', B1: 'b1' });
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
