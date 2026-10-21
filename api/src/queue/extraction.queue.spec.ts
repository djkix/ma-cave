import { GeminiPausedError, GeminiQuotaError } from '../vision/gemini-pause';
import { deferredBackoffDelay, extractionBackoffDelay } from './extraction.queue';

describe('deferredBackoffDelay', () => {
  const now = new Date('2026-10-21T12:02:30Z');

  it('pause ou limite atteinte : reprise juste après `until`, pas après un délai aveugle', () => {
    expect(deferredBackoffDelay(1, new GeminiQuotaError(new Date('2026-10-21T12:03:00Z'), 'QUOTA_MINUTE', 5), now)).toBe(31_000);
    expect(deferredBackoffDelay(9, new GeminiQuotaError(new Date('2026-10-22T07:00:00Z'), 'QUOTA_JOUR', 20), now)).toBe(68_251_000);
    expect(deferredBackoffDelay(1, new GeminiPausedError(new Date('2026-10-21T12:07:30Z'), 'modèle saturé'), now)).toBe(301_000);
  });

  it('pause déjà échue : reprise presque immédiate', () => {
    expect(deferredBackoffDelay(3, new GeminiPausedError(new Date('2026-10-21T12:00:00Z'), 'x'), now)).toBe(1000);
  });

  it('autre erreur : le report croissant habituel', () => {
    expect(deferredBackoffDelay(3, new Error('[500] boom'), now)).toBe(extractionBackoffDelay(3));
    expect(deferredBackoffDelay(3, undefined, now)).toBe(extractionBackoffDelay(3));
  });
});
