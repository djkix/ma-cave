import { fakeGenerationQueue } from '../test-utils/fake-generation-queue';
import { TraitsBatchProcessor } from './traits-batch.processor';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const MIN = 60_000;

function harness(answer: { tannin: string | null; aromas: string[]; country: string | null; region?: string | null; guard?: { min: number; max: number } | null }) {
  const wines = { w0: { producer: 'Domaine 0', cuvee: null, appellationRaw: 'bandol', color: 'ROUGE', vintage: 2019, appellation: { canonicalName: 'Bandol' } } };
  const q = fakeGenerationQueue('wineTraits', { wines });
  q.clock.now = NOW;
  const provider = { characterizeWinesBatch: jest.fn(async (w: unknown[]) => ({ items: w.map((_, index) => ({ index, ...answer })), model: 'gemini-test', costCents: 2 })) };
  const budget = { assertUnderShare: jest.fn(async () => undefined) };
  const pause = { currentPause: jest.fn(async () => null) };
  const processor = new TraitsBatchProcessor(q.prisma, provider as any, budget as any, pause as any);
  return { ...q, provider, processor };
}

describe('TraitsBatchProcessor', () => {
  it('save écrit tanin, arômes, pays et passe DONE', async () => {
    const h = harness({ tannin: 'MOYEN', aromas: ['floral'], country: 'FR' });
    h.add({ id: 't0', wineId: 'w0', requestedAt: new Date(NOW.getTime() - 3 * MIN) });
    expect(await h.processor.tick(NOW)).toEqual({ processed: 1 });
    expect(h.provider.characterizeWinesBatch).toHaveBeenCalledWith([
      { producer: 'Domaine 0', cuvee: null, appellation: 'Bandol', vintage: 2019, color: 'ROUGE' },
    ]);
    expect(h.row('t0')).toMatchObject({
      status: 'DONE', tannin: 'MOYEN', aromas: ['floral'], country: 'FR', model: 'gemini-test', costCents: 2,
      errorMessage: null, generatedAt: expect.any(Date), attempts: 0, nextAttemptAt: null, reservedUntil: null,
    });
  });

  it('save écrit la garde et la région, sauf région corrigée à la main', async () => {
    const h = harness({ tannin: null, aromas: [], country: 'FR', region: 'Rhône', guard: { min: 3, max: 10 } });
    h.add({ id: 't0', wineId: 'w0', requestedAt: new Date(NOW.getTime() - 3 * MIN) });
    h.add({ id: 't1', wineId: 'w0', requestedAt: new Date(NOW.getTime() - 3 * MIN), region: 'Alsace', manualFields: ['region'] });
    await h.processor.tick(NOW);
    expect(h.row('t0')).toMatchObject({ region: 'Rhône', guardMin: 3, guardMax: 10 });
    expect(h.row('t1')).toMatchObject({ region: 'Alsace', guardMin: 3, guardMax: 10 });
  });

  it('save garde les champs manuels', async () => {
    const h = harness({ tannin: 'LEGER', aromas: ['floral'], country: 'FR' });
    h.add({ id: 't0', wineId: 'w0', requestedAt: new Date(NOW.getTime() - 3 * MIN), tannin: 'PUISSANT', manualFields: ['tannin'] });
    await h.processor.tick(NOW);
    expect(h.row('t0')).toMatchObject({ status: 'DONE', tannin: 'PUISSANT', aromas: ['floral'], country: 'FR' });
  });
});
