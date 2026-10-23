import { backupAlert } from './backup-status';

const NOW = new Date('2026-10-28T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('backupAlert', () => {
  it('aucune tentative : rien', () => {
    expect(backupAlert(null, null, NOW)).toBeNull();
  });

  it('réussie il y a 10 h : rien', () => {
    expect(backupAlert({ finishedAt: hoursAgo(10), succeeded: true, message: '' }, hoursAgo(10), NOW)).toBeNull();
  });

  it('dernière tentative en échec : son message', () => {
    expect(backupAlert({ finishedAt: hoursAgo(1), succeeded: false, message: 'étape photos (code 23)' }, hoursAgo(25), NOW))
      .toBe('Dernière sauvegarde en échec : étape photos (code 23).');
  });

  it('réussie il y a 37 h : absente depuis 36 h', () => {
    expect(backupAlert({ finishedAt: hoursAgo(37), succeeded: true, message: '' }, hoursAgo(37), NOW))
      .toBe('Aucune sauvegarde réussie depuis 36 h.');
  });
});
