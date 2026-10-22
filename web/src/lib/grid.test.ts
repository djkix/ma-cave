import { casierLabel, cellCodeOf, cellNames, cleanCellNames } from './grid';

it('cases ligne par ligne : lettre de ligne puis numéro de colonne', () => {
  expect(cellNames(2, 3)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  expect(cellNames(26, 30).at(-1)).toBe('Z30');
});

describe('noms des cases', () => {
  const names = { B3: 'Champagnes', A1: 'Bordeaux' };

  it('cellCodeOf : un nom connu (casse et espaces ignorés) donne son code ; sinon le casier tel quel', () => {
    expect(cellCodeOf(' champagnes ', names)).toBe('B3');
    expect(cellCodeOf('b3', names)).toBe('b3');
    expect(cellCodeOf('Loire', names)).toBe('Loire');
    expect(cellCodeOf(null, names)).toBeNull();
    expect(cellCodeOf('Champagnes')).toBe('Champagnes');
  });

  it('casierLabel : « Nom (code) » pour une case nommée, saisie par code ou par nom ; sinon le casier', () => {
    expect(casierLabel('b3', names)).toBe('Champagnes (B3)');
    expect(casierLabel('Champagnes', names)).toBe('Champagnes (B3)');
    expect(casierLabel('A2', names)).toBe('A2');
    expect(casierLabel('A2')).toBe('A2');
    expect(casierLabel(null, names)).toBeNull();
  });

  it('cleanCellNames : noms sans espaces autour, vides retirés, seulement les cases de la grille', () => {
    expect(cleanCellNames({ A1: ' Bordeaux ', A2: '  ', C1: 'Hors grille', B2: 'Loire' }, { rows: 2, cols: 2 })).toEqual({ A1: 'Bordeaux', B2: 'Loire' });
  });
});
