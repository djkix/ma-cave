import { movementNote, movementTypeLabel } from './movement-note';

const out = { id: '4c2061a1-3206-4d45-92c8-a21495cd26fc', type: 'OUT' as const, occurredAt: '2026-10-23T12:02:00Z', note: null, reversesId: null };
const undo = { id: 'u1', type: 'ADJUST' as const, occurredAt: '2026-10-23T12:05:00Z', note: `Annulation du mouvement ${out.id}`, reversesId: out.id };

it('une annulation dit ce qu’elle annule, sans identifiant', () => {
  expect(movementNote(undo, [undo, out])).toMatch(/^Annulation de la sortie du 23 oct\. 2026, \d\d:\d\d$/);
});

it('origine absente de la liste : « Annulation d’un mouvement »', () => {
  expect(movementNote(undo, [undo])).toBe('Annulation d’un mouvement');
});

it('les autres notes restent telles quelles', () => {
  expect(movementNote({ ...out, note: 'Inventaire : 2 comptées' }, [])).toBe('Inventaire : 2 comptées');
  expect(movementNote({ ...undo, note: 'Annulation de la sortie du 23 oct. 2026, 14:02' }, [])).toBe('Annulation de la sortie du 23 oct. 2026, 14:02');
});

it('nomme un ajustement : annulation s’il en annule un autre, sinon inventaire', () => {
  expect(movementTypeLabel({ type: 'ADJUST', reversesId: 'm1' })).toBe('Annulation');
  expect(movementTypeLabel({ type: 'ADJUST', reversesId: null })).toBe('Inventaire');
  expect(movementTypeLabel({ type: 'IN', reversesId: null })).toBe('Entrée');
  expect(movementTypeLabel({ type: 'OUT', reversesId: null })).toBe('Sortie');
  expect(movementTypeLabel({ type: 'MOVE', reversesId: null })).toBe('Déplacement');
  expect(movementTypeLabel({ type: 'MOVE', reversesId: null }, 'Déplacé')).toBe('Déplacé');
});

it('l’annulation d’un inventaire le dit', () => {
  const inv = { id: 'a', type: 'ADJUST' as const, occurredAt: '2026-11-04T12:43:00Z', note: null, reversesId: null };
  const cancel = { id: 'b', type: 'ADJUST' as const, occurredAt: '2026-11-05T09:00:00Z', note: null, reversesId: 'a' };
  expect(movementNote(cancel, [inv, cancel])).toMatch(/^Annulation de l'inventaire du 4 nov\. 2026/);
});
