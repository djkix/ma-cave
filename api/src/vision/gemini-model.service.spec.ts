/* eslint-disable @typescript-eslint/no-explicit-any */
import { fakeGeminiPrisma as fakePrisma } from '../test-utils/fake-gemini-prisma';
import { GEMINI_MODEL_KEY, GeminiModelService, fallbackModels } from './gemini-model.service';

const quiet = { error: jest.fn() };

/** Réponse de `GET /v1beta/models`, page par page. */
function googleList(pages: Array<{ models: Array<{ name: string; methods?: string[] }>; next?: string }>) {
  let i = 0;
  return jest.fn(async () => {
    const page = pages[i++];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: page.models.map((m) => ({ name: m.name, supportedGenerationMethods: m.methods ?? ['generateContent'] })),
        nextPageToken: page.next,
      }),
    };
  });
}

function setup(opts: { apiKey?: string; fetch?: jest.Mock; prisma?: any } = {}) {
  let now = 1_000_000;
  const prisma = opts.prisma ?? fakePrisma();
  const fetch = opts.fetch ?? googleList([{ models: [] }]);
  const service = new GeminiModelService(prisma, 'gemini-3.5-flash', opts.apiKey ?? 'cle', { fetch: fetch as any, clock: () => now, log: quiet });
  return { prisma, fetch, service, advance: (ms: number) => (now += ms) };
}

describe('GeminiModelService.current', () => {
  it('sans réglage : le modèle du .env (source ENV)', async () => {
    const { service } = setup();
    await expect(service.current()).resolves.toEqual({ model: 'gemini-3.5-flash', source: 'ENV' });
  });

  it('réglage gemini_model : il l’emporte (source ADMIN)', async () => {
    const { prisma, service } = setup();
    prisma.settings.set(GEMINI_MODEL_KEY, 'gemini-3.5-flash-lite');
    await expect(service.current()).resolves.toEqual({ model: 'gemini-3.5-flash-lite', source: 'ADMIN' });
  });

  it('réglage Pro glissé en base à la main : ignoré, le .env sert', async () => {
    const { prisma, service } = setup();
    prisma.settings.set(GEMINI_MODEL_KEY, 'gemini-3.5-pro');
    quiet.error.mockClear();
    await expect(service.current()).resolves.toEqual({ model: 'gemini-3.5-flash', source: 'ENV' });
    expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('gemini-3.5-pro'));
  });

  it('cache de 30 s : la base n’est relue qu’après', async () => {
    const { prisma, service, advance } = setup();
    await service.current();
    prisma.settings.set(GEMINI_MODEL_KEY, 'gemini-3.5-flash-lite'); // écrit par l'autre processus
    advance(29_999);
    expect((await service.current()).model).toBe('gemini-3.5-flash');
    advance(1);
    expect((await service.current()).model).toBe('gemini-3.5-flash-lite');
    expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(2);
  });

  it('base injoignable : dernier modèle connu, sinon le .env ; l’appel n’est jamais bloqué', async () => {
    const { prisma, service, advance } = setup();
    prisma.appSetting.findMany.mockRejectedValueOnce(new Error('base en panne'));
    await expect(service.current()).resolves.toEqual({ model: 'gemini-3.5-flash', source: 'ENV' });
    prisma.settings.set(GEMINI_MODEL_KEY, 'gemini-3.5-flash-lite');
    await service.current();
    advance(30_000);
    prisma.appSetting.findMany.mockRejectedValueOnce(new Error('base en panne'));
    expect((await service.current()).model).toBe('gemini-3.5-flash-lite');
  });
});

describe('GeminiModelService.set', () => {
  it('écrit le réglage et invalide le cache du processus', async () => {
    const { prisma, service } = setup();
    await service.current();
    await expect(service.set('gemini-3.5-flash-lite')).resolves.toEqual({ model: 'gemini-3.5-flash-lite', source: 'ADMIN' });
    expect(prisma.settings.get(GEMINI_MODEL_KEY)).toBe('gemini-3.5-flash-lite');
    await expect(service.current()).resolves.toEqual({ model: 'gemini-3.5-flash-lite', source: 'ADMIN' });
  });
});

describe('GeminiModelService.available', () => {
  it('liste de Google : Flash ou Lite, jamais Pro, generateContent, sans « models/ », triée, toutes pages', async () => {
    const fetch = googleList([
      {
        models: [
          { name: 'models/gemini-3.5-flash' },
          { name: 'models/gemini-3.5-pro' },
          { name: 'models/gemini-3.5-flash-pro' },
          { name: 'models/text-embedding-004', methods: ['embedContent'] },
          { name: 'models/gemini-embedding-lite', methods: ['embedContent'] },
          { name: 'models/gemini flash<lite>' },
        ],
        next: 'p2',
      },
      { models: [{ name: 'models/gemini-2.0-flash-lite' }, { name: 'models/gemini-2.0-flash-light' }] },
    ]);
    const { service } = setup({ fetch });
    await expect(service.available()).resolves.toEqual({ models: ['gemini-2.0-flash-light', 'gemini-2.0-flash-lite', 'gemini-3.5-flash'], error: null });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1] as any;
    expect(String(url)).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?/);
    expect(new URL(String(url)).searchParams.get('pageToken')).toBe('p2');
    expect(init.headers['x-goog-api-key']).toBe('cle');
  });

  it('cache d’une heure', async () => {
    const fetch = googleList([{ models: [{ name: 'models/gemini-3.5-flash' }] }, { models: [{ name: 'models/gemini-3.5-flash-lite' }] }]);
    const { service, advance } = setup({ fetch });
    await service.available();
    advance(3_600_000 - 1);
    expect((await service.available()).models).toEqual(['gemini-3.5-flash']);
    advance(1);
    expect((await service.available()).models).toEqual(['gemini-3.5-flash-lite']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('Google en échec : le modèle en vigueur seul, avec l’erreur ; échec gardé 60 s puis réessayé', async () => {
    const fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const { prisma, service, advance } = setup({ fetch });
    prisma.settings.set(GEMINI_MODEL_KEY, 'gemini-3.5-flash-lite');
    const failed = { models: ['gemini-3.5-flash-lite'], error: 'Liste des modèles indisponible : Google a répondu 503' };
    await expect(service.available()).resolves.toEqual(failed);
    advance(59_999);
    await expect(service.available()).resolves.toEqual(failed);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    await service.available();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('réseau en panne : même repli', async () => {
    const fetch = jest.fn(async () => {
      throw new Error('fetch failed');
    });
    const { service } = setup({ fetch });
    await expect(service.available()).resolves.toEqual({ models: ['gemini-3.5-flash'], error: 'Liste des modèles indisponible : fetch failed' });
  });

  it('pas de clé : aucun appel à Google, repli sur le modèle en vigueur', async () => {
    const { service, fetch } = setup({ apiKey: '' });
    await expect(service.available()).resolves.toEqual({ models: ['gemini-3.5-flash'], error: 'Liste des modèles indisponible : clé GEMINI_API_KEY absente' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fallbackModels (liste de bascule)', () => {
  it('le modèle choisi d’abord, puis les Flash et Flash-Lite stables, du plus récent au plus ancien, Flash avant Lite', () => {
    const available = [
      'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-3-flash-lite',
      'gemini-3.5-flash-preview-09-2026', 'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts', 'gemini-2.0-flash-exp',
      'gemini-2.5-flash-live', 'gemini-2.5-flash-native-audio', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.5-flash-pro',
      'gemini-10-flash',
    ];
    expect(fallbackModels('gemini-2.5-flash-lite', available)).toEqual([
      'gemini-2.5-flash-lite', 'gemini-10-flash', 'gemini-3-flash', 'gemini-3-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash',
    ]);
  });

  it('un modèle choisi hors des règles (preview…) reste en tête, sans doublon', () => {
    expect(fallbackModels('gemini-3.5-flash-preview-09-2026', ['gemini-3.5-flash-preview-09-2026', 'gemini-3-flash'])).toEqual(['gemini-3.5-flash-preview-09-2026', 'gemini-3-flash']);
  });

  it('liste de Google indisponible (le modèle choisi seul) : le modèle choisi seul', async () => {
    const service = new GeminiModelService(fakePrisma(), 'gemini-3-flash', '', { log: quiet });
    await expect(service.candidates()).resolves.toEqual(['gemini-3-flash']);
  });
});

