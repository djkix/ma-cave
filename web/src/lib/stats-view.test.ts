import { drunkThisYear } from './stats-view';

it('compte les sorties des mois de l’année en cours seulement', () => {
  const months = [{ month: '2025-12', in: 0, out: 4 }, { month: '2026-01', in: 0, out: 2 }, { month: '2026-03', in: 1, out: 1 }];
  expect(drunkThisYear(months, new Date('2026-03-15T12:00:00Z'))).toBe(3);
  expect(drunkThisYear([], new Date('2026-03-15T12:00:00Z'))).toBe(0);
});
