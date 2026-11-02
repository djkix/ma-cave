import { accordLevel, at, momentLabel, momentOf, timelineScale } from './accord-view';
import { AccordPick, Apogee } from './api-client';

const pick = (apogee: Partial<Apogee>): AccordPick => ({
  wineId: 'w', producer: 'P', cuvee: null, appellation: '', vintage: 2018, color: 'ROUGE', quantity: 1, place: null, score: 90, reason: '',
  apogee: { min: 2022, max: 2032, confidence: null, status: 'A_BOIRE', reason: null, source: 'REGLE', ...apogee },
});

it('trois niveaux d’accord', () => {
  expect([95, 85, 84, 70, 69, 10].map(accordLevel)).toEqual([3, 3, 2, 2, 1, 1]);
});

it('moment et libellé selon l’apogée ; sans apogée, à point', () => {
  expect(momentLabel(pick({ status: 'PASSEE', max: 2025 }))).toBe('Apogée dépassée depuis 2025, risque de déclin');
  expect(momentLabel(pick({ status: 'TROP_JEUNE', min: 2029 }))).toBe('Trop jeune, attendre 2029');
  expect(momentOf(pick({ status: null, min: null, max: null }))).toBe('A_POINT');
  expect(momentLabel(pick({ status: null, min: null, max: null }))).toBe('Sans apogée connue');
});

it('échelle commune des frises, année en cours comprise', () => {
  const s = timelineScale([pick({ min: 2012, max: 2025 }), pick({ min: 2029, max: 2045 }), pick({ min: null, max: null })], 2026);
  expect(s).toEqual({ from: 2011, to: 2046 });
  expect(at(2011, s)).toBe(0);
  expect(at(2046, s)).toBe(100);
});
