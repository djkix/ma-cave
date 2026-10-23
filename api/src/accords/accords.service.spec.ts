import { ServiceUnavailableException } from '@nestjs/common';
import { Apogee } from '../apogee/apogee';
import { VisionBudgetExceededError } from '../queue/vision-budget.service';
import { GeminiPausedError } from '../vision/gemini-pause';
import { AccordsService, accordsSchema, MAX_WINES, rankPicks } from './accords.service';

const apogee = (status: Apogee['status'], min: number | null = 2020, max: number | null = 2030): Apogee =>
  ({ min, max, status, confidence: status ? 'FAIBLE' : null, reason: status ? null : 'NON_MILLESIME', source: status ? 'REGLE' : null });

const wine = (id: string, a: Apogee, extra: Record<string, unknown> = {}) => ({
  id, producer: `Domaine ${id}`, cuvee: null, appellationRaw: 'Chablis', vintage: 2020, color: 'BLANC', formatCl: 75,
  referencePhotoId: null, quantity: 3, apogee: a, rating: null, ...extra,
});

function setup(wines: ReturnType<typeof wine>[], raw: unknown = { compris: ['Blanc sec'], ideal: 'Un blanc sec', choix: [] }, error?: Error) {
  const provider = { pairDish: jest.fn(async () => { if (error) throw error; return { raw, model: 'm', costCents: 0 }; }) };
  const cave = { list: jest.fn(async () => wines) };
  const locations = { placesByWine: jest.fn(async (_c: string, ids: string[]) => new Map(ids.map((id) => [id, [{ label: 'Cave 1 / A', quantity: 1 }, { label: 'Garage', quantity: 2 }]]))) };
  const budget = { assertUnderShare: jest.fn(async () => undefined), assertCaveUnderShare: jest.fn(async () => undefined) };
  const journal = { currentPause: jest.fn(async () => null) };
  const service = new AccordsService(cave as never, locations as never, budget as never, journal as never, provider as never);
  return { service, provider, budget };
}

describe('validation du plat', () => {
  it.each([[''], ['   '], ['x'.repeat(201)], [42]])('refuse %p', (dish) => {
    expect(accordsSchema.safeParse({ dish }).success).toBe(false);
  });
  it('accepte et nettoie', () => {
    expect(accordsSchema.parse({ dish: '  Sole meunière ' })).toEqual({ dish: 'Sole meunière' });
  });
  it('message en français', () => {
    const r = accordsSchema.safeParse({});
    expect(!r.success && r.error.issues[0].message).toBe('Indiquez le plat');
  });
});

describe('rankPicks', () => {
  const sent = [wine('a', apogee('TROP_JEUNE', 2030, 2040)), wine('b', apogee('A_BOIRE_VITE', 2020, 2026)), wine('c', apogee('A_BOIRE'))];

  it('écarte les numéros inconnus, en double ou mal formés ; classe par score puis apogée', () => {
    const r = rankPicks({
      compris: ['Blanc sec', 3, ' Belle acidité ', 'a', 'b', 'c'],
      ideal: 'Un blanc sec et vif',
      choix: [{ vin: 1, score: 90, raison: 'Vif' }, { vin: 2, score: 90, raison: 'Prêt' }, { vin: 9, score: 99, raison: 'inconnu' },
        { vin: 0, score: 99 }, { vin: 2, score: 10, raison: 'doublon' }, { vin: 'c', score: 80 }, { vin: 3, score: 150, raison: 'x'.repeat(300) }],
    }, sent)!;
    expect(r.understood).toEqual(['Blanc sec', 'Belle acidité', 'a', 'b']);
    expect(r.ideal).toBe('Un blanc sec et vif');
    expect(r.picks.map((p) => [p.wine.id, p.score])).toEqual([['c', 100], ['b', 90], ['a', 90]]);
    expect(r.picks[0].reason).toHaveLength(120);
  });

  it('au plus 5 vins ; une réponse qui n’est pas un objet est inexploitable', () => {
    const many = Array.from({ length: 8 }, (_, i) => wine(`w${i}`, apogee('A_BOIRE')));
    expect(rankPicks({ choix: many.map((_, i) => ({ vin: i + 1, score: 50 })) }, many)!.picks).toHaveLength(5);
    expect(rankPicks('texte', many)).toBeNull();
  });
});

describe('AccordsService.suggest', () => {
  it('cave vide : réponse vide, aucun appel à l’IA', async () => {
    const { service, provider, budget } = setup([]);
    expect(await service.suggest('c1', 'Sole')).toEqual({ dish: 'Sole', wineCount: 0, understood: [], ideal: null, picks: [] });
    expect(provider.pairDish).not.toHaveBeenCalled();
    expect(budget.assertUnderShare).not.toHaveBeenCalled();
  });

  it('envoie les vins à boire d’abord, enrichit les choix (emplacement principal)', async () => {
    const wines = [wine('jeune', apogee('TROP_JEUNE', 2030, 2040)), wine('sans', apogee(null, null, null)), wine('vite', apogee('A_BOIRE_VITE', 2020, 2026))];
    const { service, provider } = setup(wines, { compris: ['Blanc sec'], ideal: 'Blanc sec', choix: [{ vin: 1, score: 88, raison: 'Vif' }] });
    const res = await service.suggest('c1', 'Sole');
    const [, sent] = provider.pairDish.mock.calls[0] as unknown as [string, Array<{ producer: string; apogee: string | null }>];
    expect(sent.map((w) => w.producer)).toEqual(['Domaine vite', 'Domaine sans', 'Domaine jeune']);
    expect(sent[0].apogee).toBe('2020-2026');
    expect(sent[1].apogee).toBeNull();
    expect(res).toMatchObject({ wineCount: 3, understood: ['Blanc sec'], picks: [{ wineId: 'vite', score: 88, reason: 'Vif', place: 'Garage', quantity: 3, appellation: 'Chablis' }] });
  });

  it(`coupe aux ${MAX_WINES} premiers par priorité d’apogée`, async () => {
    const wines = Array.from({ length: MAX_WINES + 20 }, (_, i) => wine(`w${i}`, apogee(i < 20 ? 'TROP_JEUNE' : 'A_BOIRE')));
    const { service, provider } = setup(wines);
    await service.suggest('c1', 'Sole');
    const sent = (provider.pairDish.mock.calls[0] as unknown as [string, Array<{ producer: string }>])[1];
    expect(sent).toHaveLength(MAX_WINES);
    expect(sent.some((w) => w.producer === 'Domaine w0')).toBe(false);
  });

  it('pause Gemini, budget atteint, panne, réponse illisible : 503 au message lisible', async () => {
    const wines = [wine('a', apogee('A_BOIRE'))];
    const paused = new GeminiPausedError(new Date('2026-10-23T10:00:00Z'), 'REFUS_503');
    await expect(setup(wines, null, paused).service.suggest('c1', 'Sole')).rejects.toThrow(new ServiceUnavailableException(paused.message));
    await expect(setup(wines, null, new Error('boom')).service.suggest('c1', 'Sole')).rejects.toThrow('Accords indisponibles pour le moment, réessayez dans un instant');
    await expect(setup(wines, 'pas un objet').service.suggest('c1', 'Sole')).rejects.toThrow('L’IA n’a pas su répondre, réessayez');
    const s = setup(wines);
    s.budget.assertUnderShare.mockRejectedValueOnce(new VisionBudgetExceededError());
    await expect(s.service.suggest('c1', 'Sole')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(s.provider.pairDish).not.toHaveBeenCalled();
  });
});
