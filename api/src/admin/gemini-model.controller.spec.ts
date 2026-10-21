/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { AdminGeminiModelController } from './admin.controller';

function setup(available: { models: string[]; error: string | null }) {
  const models = {
    current: jest.fn(async () => ({ model: 'gemini-3.5-flash', source: 'ENV' as const })),
    available: jest.fn(async () => available),
    set: jest.fn(async (model: string) => ({ model, source: 'ADMIN' as const })),
  };
  return { models, controller: new AdminGeminiModelController(models as any) };
}

async function badRequest(p: Promise<unknown>): Promise<string> {
  const e = await p.catch((x: Error) => x);
  expect(e).toBeInstanceOf(BadRequestException);
  return (e as Error).message;
}

describe('AdminGeminiModelController', () => {
  it('GET : modèle en vigueur, source, modèles proposés et erreur éventuelle', async () => {
    const { controller } = setup({ models: ['gemini-3.5-flash'], error: 'Liste des modèles indisponible : x' });
    await expect(controller.get()).resolves.toEqual({
      model: 'gemini-3.5-flash',
      source: 'ENV',
      models: ['gemini-3.5-flash'],
      error: 'Liste des modèles indisponible : x',
    });
  });

  it('PUT : modèle connu de Google, enregistré', async () => {
    const { controller, models } = setup({ models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'], error: null });
    await expect(controller.update({ model: 'gemini-3.5-flash-lite' })).resolves.toEqual({ model: 'gemini-3.5-flash-lite', source: 'ADMIN' });
    expect(models.set).toHaveBeenCalledWith('gemini-3.5-flash-lite');
  });

  it.each([{ model: 'gemini-3.5-pro' }, { model: 'gemini-3.5-flash-pro' }, { model: 'gemini-embedding' }, { model: 'gemini-3.5-flash lite' }, { model: 'gemini-3.5-flash/x' }, { model: '' }, { model: 3 }, {}, null])(
    'PUT %j : 400, seuls Flash ou Lite',
    async (body) => {
      const { controller, models } = setup({ models: ['gemini-3.5-pro'], error: null });
      expect(await badRequest(controller.update(body))).toBe('Seuls les modèles Gemini Flash ou Lite sont acceptés');
      expect(models.set).not.toHaveBeenCalled();
    },
  );

  it('PUT : modèle absent de la liste de Google : 400', async () => {
    const { controller, models } = setup({ models: ['gemini-3.5-flash'], error: null });
    expect(await badRequest(controller.update({ model: 'gemini-9-flash' }))).toBe('Modèle inconnu de Google');
    expect(models.set).not.toHaveBeenCalled();
  });

  it('PUT : liste de Google indisponible : un modèle Flash ou Lite est accepté', async () => {
    const { controller, models } = setup({ models: ['gemini-3.5-flash'], error: 'Liste des modèles indisponible : x' });
    await controller.update({ model: 'gemini-3.5-flash-lite' });
    expect(models.set).toHaveBeenCalledWith('gemini-3.5-flash-lite');
  });
});
