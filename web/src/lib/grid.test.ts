import { casierLabel, cellCode, cellCodeOf, cellNames, cellsPreview, cleanCellNames, placeCell, renamePrefix, suggestPrefix } from './grid';

it('cases rangée par rangée : lettre du casier puis numéro de 1 à rangées × colonnes', () => {
  expect(cellNames(2, 3, 'C')).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  expect(cellNames(26, 30, 'A').at(-1)).toBe('A780');
  expect(cellCode('C', 1, 0, 12)).toBe('C13');
});

it('cellsPreview : « Cases C1 à C48 », « Case B1 » pour une seule', () => {
  expect(cellsPreview(4, 12, 'C')).toBe('Cases C1 à C48');
  expect(cellsPreview(1, 1, 'B')).toBe('Case B1');
});

it('suggestPrefix : lettre finale du nom si libre, sinon la première libre ; aucune : null', () => {
  expect(suggestPrefix('Casier c', [])).toBe('C');
  expect(suggestPrefix('Casier C', ['C'])).toBe('A');
  expect(suggestPrefix('Cellier', ['A', 'B'])).toBe('C');
  expect(suggestPrefix('Cellier', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBeNull();
});

it('renamePrefix : les codes de l’ancienne lettre passent à la nouvelle, le reste est gardé', () => {
  expect(renamePrefix({ A1: 'x', B3: 'z' }, 'A', 'C')).toEqual({ C1: 'x', B3: 'z' });
  expect(renamePrefix({ A12: 'x', AB1: 'y' }, 'A', 'D')).toEqual({ D12: 'x', AB1: 'y' });
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
    expect(cleanCellNames({ A1: ' Bordeaux ', A2: '  ', A5: 'Hors grille', A4: 'Loire' }, { rows: 2, cols: 2 }, 'A')).toEqual({ A1: 'Bordeaux', A4: 'Loire' });
    expect(cleanCellNames({ C1: ' x ', A1: 'y' }, { rows: 1, cols: 2 }, 'C')).toEqual({ C1: 'x' });
  });
});

it('placeCell : centre de la case au point touché, taille gardée, bornée à l’image', () => {
  const boxes = { A1: [0.1, 0.1, 0.2, 0.3] as [number, number, number, number] };
  expect(placeCell(boxes, 'A1', 0.5, 0.5)).toEqual({ A1: [0.45, 0.4, 0.55, 0.6] });
  expect(placeCell(boxes, 'A1', 0.98, 0)).toEqual({ A1: [0.9, 0, 1, 0.2] });
  expect(boxes.A1).toEqual([0.1, 0.1, 0.2, 0.3]);
});

it('placeCell : case sans position posée à la taille moyenne des cases placées, sinon 4 % × 4 %', () => {
  const boxes = { A1: [0, 0, 0.1, 0.2] as [number, number, number, number], A2: [0, 0, 0.3, 0.4] as [number, number, number, number] };
  expect(placeCell(boxes, 'A3', 0.5, 0.5).A3).toEqual([0.4, 0.35, 0.6, 0.65]);
  expect(placeCell({}, 'A1', 0.5, 0.5)).toEqual({ A1: [0.48, 0.48, 0.52, 0.52] });
});
