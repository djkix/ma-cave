/* eslint-disable @typescript-eslint/no-explicit-any */
import { GeminiModelService, fallbackModels } from './gemini-model.service';

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

function setup(opts: { apiKey?: string; fetch?: jest.Mock; envModel?: string } = {}) {
  let now = 1_000_000;
  const fetch = opts.fetch ?? googleList([{ models: [] }]);
  const service = new GeminiModelService(opts.envModel ?? 'gemini-3.5-flash', opts.apiKey ?? 'cle', { fetch: fetch as any, clock: () => now });
  return { fetch, service, advance: (ms: number) => (now += ms) };
}

describe('GeminiModelService.available', () => {
  it('liste de Google : Flash ou Flash-Lite stables (ni Pro, ni tts, ni preview), generateContent, sans « models/ », triée, toutes pages', async () => {
    const fetch = googleList([
      {
        models: [
          { name: 'models/gemini-3.5-flash' },
          { name: 'models/gemini-3.5-pro' },
          { name: 'models/gemini-3.5-flash-pro' },
          { name: 'models/text-embedding-004', methods: ['embedContent'] },
          { name: 'models/gemini-embedding-lite', methods: ['embedContent'] },
          { name: 'models/gemini flash<lite>' },
          { name: 'models/gemini-3.8-flash-lite-tts' },
          { name: 'models/gemini-3.5-flash-preview-09-2026' },
        ],
        next: 'p2',
      },
      { models: [{ name: 'models/gemini-2.0-flash-lite' }, { name: 'models/gemini-2.0-flash-light' }] },
    ]);
    const { service } = setup({ fetch });
    await expect(service.available()).resolves.toEqual({ models: ['gemini-2.0-flash-lite', 'gemini-3.5-flash'], error: null });
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

  it('Google en échec : le modèle du .env seul, avec l’erreur ; échec gardé 60 s puis réessayé', async () => {
    const fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const { service, advance } = setup({ fetch, envModel: 'gemini-3.5-flash-lite' });
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

  it('pas de clé : aucun appel à Google, repli sur le modèle du .env', async () => {
    const { service, fetch } = setup({ apiKey: '' });
    await expect(service.available()).resolves.toEqual({ models: ['gemini-3.5-flash'], error: 'Liste des modèles indisponible : clé GEMINI_API_KEY absente' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fallbackModels (ordre d’emploi)', () => {
  it('Flash et Flash-Lite stables seulement, du plus récent au plus ancien, Flash avant Lite, sans doublon', () => {
    const available = [
      'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-3-flash-lite',
      'gemini-3.5-flash-preview-09-2026', 'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts', 'gemini-2.0-flash-exp',
      'gemini-2.5-flash-live', 'gemini-2.5-flash-native-audio', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.5-flash-pro',
      'gemini-10-flash', 'gemini-3-flash',
    ];
    expect(fallbackModels(available)).toEqual([
      'gemini-10-flash', 'gemini-3-flash', 'gemini-3-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash',
    ]);
  });
});

describe('GeminiModelService.candidates', () => {
  it('choix automatique : la liste de Google dans l’ordre d’emploi, sans modèle mis en tête', async () => {
    const fetch = googleList([{ models: [{ name: 'models/gemini-2.5-flash-lite' }, { name: 'models/gemini-3-flash-lite' }, { name: 'models/gemini-3-flash' }] }]);
    const { service } = setup({ fetch, envModel: 'gemini-2.5-flash-lite' });
    await expect(service.candidates()).resolves.toEqual(['gemini-3-flash', 'gemini-3-flash-lite', 'gemini-2.5-flash-lite']);
  });

  it('liste de Google indisponible : le modèle du .env seul', async () => {
    await expect(setup({ apiKey: '', envModel: 'gemini-3-flash' }).service.candidates()).resolves.toEqual(['gemini-3-flash']);
  });

  it('liste indisponible et modèle du .env non stable (preview) : aucun modèle', async () => {
    await expect(setup({ apiKey: '', envModel: 'gemini-3.5-flash-preview-09-2026' }).service.candidates()).resolves.toEqual([]);
  });
});
