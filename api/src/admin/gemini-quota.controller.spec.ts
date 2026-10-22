/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { GeminiQuotaError } from '../vision/gemini-pause';
import { AdminGeminiQuotaController } from './admin.controller';
import { GeminiUsageService } from './gemini-usage.service';

const LIMITS = { rpm: 5, tpm: 250000, rpd: 20 };
const USAGE = {
  current: 'gemini-3-flash-lite',
  minute: { requests: 1, tokens: 2700 },
  dayResetsAt: '2026-10-22T07:00:00.000Z',
  models: [
    { model: 'gemini-3-flash', requests: 20, limits: LIMITS, exhaustedUntil: '2026-10-22T07:00:00.000Z' },
    { model: 'gemini-3-flash-lite', requests: 3, limits: LIMITS, exhaustedUntil: null },
  ],
};

describe('AdminGeminiQuotaController', () => {
  const setup = (available = { models: ['gemini-3-flash-lite', 'gemini-3-flash'], error: null as string | null }) => {
    const quota = { usage: jest.fn(async () => USAGE), setLimits: jest.fn(async (_m: string, l: unknown) => l) };
    const models = { available: jest.fn(async () => available), candidates: jest.fn(async () => ['gemini-3-flash', 'gemini-3-flash-lite']) };
    return { quota, controller: new AdminGeminiQuotaController(quota as any, models as any) };
  };

  it('GET : modèle en cours, modèles dans l’ordre d’emploi, erreur de la liste de Google', async () => {
    const { quota, controller } = setup({ models: ['gemini-3-flash'], error: 'Liste des modèles indisponible : x' });
    await expect(controller.get()).resolves.toEqual({ ...USAGE, error: 'Liste des modèles indisponible : x' });
    expect(quota.usage).toHaveBeenCalledWith(['gemini-3-flash']);
  });

  it('PUT sans modèle : limites du modèle en cours', async () => {
    const { quota, controller } = setup();
    await expect(controller.update({ rpm: 10, tpm: 1000000, rpd: 500 })).resolves.toEqual({ ...USAGE, error: null });
    expect(quota.setLimits).toHaveBeenCalledWith('gemini-3-flash-lite', { rpm: 10, tpm: 1000000, rpd: 500 });
  });

  it('PUT avec modèle de la liste : ses limites', async () => {
    const { quota, controller } = setup();
    await controller.update({ model: 'gemini-3-flash', rpm: 10, tpm: 1000000, rpd: 500 });
    expect(quota.setLimits).toHaveBeenCalledWith('gemini-3-flash', { rpm: 10, tpm: 1000000, rpd: 500 });
  });

  it.each([
    [{ model: 'gemini-3-pro', rpm: 1, tpm: 1, rpd: 1 }, 'Seuls les modèles Gemini Flash ou Flash-Lite stables sont acceptés'],
    [{ model: 'gemini-3-flash-preview-tts', rpm: 1, tpm: 1, rpd: 1 }, 'Seuls les modèles Gemini Flash ou Flash-Lite stables sont acceptés'],
    [{ model: 3, rpm: 1, tpm: 1, rpd: 1 }, 'Seuls les modèles Gemini Flash ou Flash-Lite stables sont acceptés'],
    [{ model: 'gemini-9-flash', rpm: 1, tpm: 1, rpd: 1 }, 'Modèle absent de la liste des modèles employés'],
  ])('PUT %j : 400 « %s »', async (body, message) => {
    const { quota, controller } = setup();
    const e = await controller.update(body).catch((x: Error) => x);
    expect(e).toBeInstanceOf(BadRequestException);
    expect((e as Error).message).toBe(message);
    expect(quota.setLimits).not.toHaveBeenCalled();
  });

  it.each([{ rpm: 0, tpm: 1, rpd: 1 }, { rpm: 1.5, tpm: 1, rpd: 1 }, { rpm: -1, tpm: 1, rpd: 1 }, { rpm: '5', tpm: 1, rpd: 1 }, { rpm: 5, tpm: 1 }, {}, null])(
    'PUT %j : 400 « Limites invalides : entiers positifs attendus »',
    async (body) => {
      const { quota, controller } = setup();
      const e = await controller.update(body).catch((x: Error) => x);
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as Error).message).toBe('Limites invalides : entiers positifs attendus');
      expect(quota.setLimits).not.toHaveBeenCalled();
    },
  );
});

describe('GeminiUsageService — bandeau de pause', () => {
  const NOW = new Date('2026-10-21T12:02:30Z');
  const service = (pause: { until: Date; reason: string } | null, blocked: GeminiQuotaError | null | Error) =>
    new GeminiUsageService(
      { geminiCall: { findMany: jest.fn(async () => []) } } as any,
      { currentPause: jest.fn(async () => pause) } as any,
      { blocked: jest.fn(async () => { if (blocked instanceof Error && !(blocked instanceof GeminiQuotaError)) throw blocked; return blocked; }) } as any,
      { candidates: jest.fn(async () => ['gemini-3-flash']) } as any,
    );

  it('limiteur en panne (Redis) : la consommation s’affiche quand même, sans limite', async () => {
    const r = await service(null, new Error('ECONNREFUSED')).report(7, NOW);
    expect(r.pause).toEqual({ until: null, reason: null, message: null });
    expect(r.rows).toEqual([]);
  });

  it('sans pause ni limite atteinte : rien', async () => {
    expect((await service(null, null).report(7, NOW)).pause).toEqual({ until: null, reason: null, message: null });
  });

  it('pause commune après un 429 de Google : QUOTA_GOOGLE et son texte', async () => {
    const until = new Date('2026-10-21T12:40:00Z');
    expect((await service({ until, reason: 'QUOTA_GOOGLE' }, null).report(7, NOW)).pause).toEqual({
      until: until.toISOString(), reason: 'QUOTA_GOOGLE', message: 'Quota Gemini dépassé chez Google : reprise à 14:40.',
    });
  });

  it('pause commune pour saturation : motif, sans texte de quota', async () => {
    const until = new Date('2026-10-21T12:05:00Z');
    expect((await service({ until, reason: 'modèle saturé' }, null).report(7, NOW)).pause).toEqual({ until: until.toISOString(), reason: 'modèle saturé', message: null });
  });

  it('limite locale atteinte : sa raison, son heure de reprise et son texte', async () => {
    const until = new Date('2026-10-22T07:00:00Z');
    expect((await service(null, new GeminiQuotaError(until, 'QUOTA_JOUR', 20, NOW)).report(7, NOW)).pause).toEqual({
      until: until.toISOString(), reason: 'QUOTA_JOUR', message: 'Quota Gemini du jour atteint (20 requêtes) : reprise jeudi à 09:00.',
    });
  });

  it('les deux : la plus lointaine l’emporte', async () => {
    const pause = { until: new Date('2026-10-21T12:05:00Z'), reason: 'modèle saturé' };
    const r = await service(pause, new GeminiQuotaError(new Date('2026-10-22T07:00:00Z'), 'QUOTA_JOUR', 20, NOW)).report(7, NOW);
    expect(r.pause.reason).toBe('QUOTA_JOUR');
  });
});
