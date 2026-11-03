import { Apogee } from './api-client';
import { apogeeTone, caveSummary } from './cave-list';

const ap = (status: Apogee['status']): Apogee => ({ min: 2020, max: 2030, confidence: null, status, reason: null, source: null });

it('résume en bouteilles et références, au singulier jusqu’à un', () => {
  expect(caveSummary([{ quantity: 4 }, { quantity: 0 }, { quantity: 6 }])).toEqual({ bottles: '10 bouteilles', references: '3 références' });
  expect(caveSummary([{ quantity: 1 }])).toEqual({ bottles: '1 bouteille', references: '1 référence' });
  expect(caveSummary([])).toEqual({ bottles: '0 bouteille', references: '0 référence' });
});

it('donne la teinte de la pastille selon l’état d’apogée', () => {
  expect(apogeeTone(ap('A_BOIRE'))?.tone).toBe('ok');
  expect(apogeeTone(ap('A_BOIRE_VITE'))?.tone).toBe('soon');
  expect(apogeeTone(ap('PASSEE'))?.tone).toBe('soon');
  expect(apogeeTone(ap('TROP_JEUNE'))?.tone).toBe('young');
  expect(apogeeTone(ap(null))).toBeNull();
});
