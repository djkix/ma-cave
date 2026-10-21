import { cellNames } from './grid';

it('cases ligne par ligne : lettre de ligne puis numéro de colonne', () => {
  expect(cellNames(2, 3)).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  expect(cellNames(26, 30).at(-1)).toBe('Z30');
});
