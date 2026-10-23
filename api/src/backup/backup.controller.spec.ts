/* eslint-disable @typescript-eslint/no-explicit-any */
import { BackupController } from './backup.controller';

describe('BackupController', () => {
  const setup = (runs: { finishedAt: Date; succeeded: boolean; message: string }[], requests = 0) => {
    const sorted = [...runs].sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
    const prisma = {
      backupRun: { findFirst: jest.fn(async ({ where }: any) => sorted.find((r) => !where || r.succeeded) ?? null) },
      backupRequest: { count: jest.fn(async () => requests), create: jest.fn(async () => ({})) },
    };
    return { prisma, controller: new BackupController(prisma as any) };
  };

  it('GET : dernière réussite, dernière tentative en échec, alerte', async () => {
    const ok = new Date(Date.now() - 3_600_000);
    const ko = new Date();
    const { controller } = setup([
      { finishedAt: ok, succeeded: true, message: '' },
      { finishedAt: ko, succeeded: false, message: 'étape base (code 1)' },
    ], 1);
    await expect(controller.status()).resolves.toEqual({
      lastSuccessAt: ok.toISOString(),
      lastRun: { finishedAt: ko.toISOString(), succeeded: false, message: 'étape base (code 1)' },
      requested: true,
      alert: 'Dernière sauvegarde en échec : étape base (code 1).',
    });
  });

  it('GET sans aucune tentative : tout à null, sans alerte', async () => {
    await expect(setup([]).controller.status()).resolves.toEqual({ lastSuccessAt: null, lastRun: null, requested: false, alert: null });
  });

  it('POST request : une seule demande en attente, même après deux appuis', async () => {
    const first = setup([]);
    await first.controller.request();
    expect(first.prisma.backupRequest.create).toHaveBeenCalledTimes(1);
    const second = setup([], 1);
    await second.controller.request();
    expect(second.prisma.backupRequest.create).not.toHaveBeenCalled();
  });
});
