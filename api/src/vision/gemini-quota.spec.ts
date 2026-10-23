/* eslint-disable @typescript-eslint/no-explicit-any */
import Redis from 'ioredis';
import { GeminiModelAsideError, GeminiQuotaError, nextPacificMidnight, pacificDay, pauseAfter429, quotaMessage } from './gemini-pause';
import { DEFAULT_LIMITS, GEMINI_RPD_KEY, GEMINI_RPM_KEY, GEMINI_TPM_KEY, GeminiQuotaService } from './gemini-quota';
import { fakeGeminiPrisma as fakePrisma } from '../test-utils/fake-gemini-prisma';

describe('minuit du Pacifique', () => {
  it('heure d’été (PDT, UTC−7) et d’hiver (PST, UTC−8)', () => {
    expect(nextPacificMidnight(new Date('2026-10-21T20:00:00Z')).toISOString()).toBe('2026-10-22T07:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-12-10T20:00:00Z')).toISOString()).toBe('2026-12-11T08:00:00.000Z');
    // Juste avant minuit là-bas, et juste après.
    expect(nextPacificMidnight(new Date('2026-10-22T06:59:59Z')).toISOString()).toBe('2026-10-22T07:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-10-22T07:00:00Z')).toISOString()).toBe('2026-10-23T07:00:00.000Z');
  });

  it('jours de changement d’heure (1er novembre et 8 mars 2026)', () => {
    expect(nextPacificMidnight(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-03-07T20:00:00Z')).toISOString()).toBe('2026-03-08T08:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-03-08T12:00:00Z')).toISOString()).toBe('2026-03-09T07:00:00.000Z');
  });

  it('jour du Pacifique', () => {
    expect(pacificDay(new Date('2026-10-22T06:59:59Z'))).toBe('2026-10-21');
    expect(pacificDay(new Date('2026-10-22T07:00:00Z'))).toBe('2026-10-22');
  });
});

describe('textes des quotas (heure de Paris)', () => {
  const now = new Date('2026-10-21T12:02:30Z'); // 14:02 à Paris
  it('minute, jetons, jour, Google', () => {
    expect(quotaMessage('QUOTA_MINUTE', new Date('2026-10-21T12:03:00Z'), 5, now)).toBe('Limite de 5 requêtes par minute atteinte : reprise à 14:03.');
    expect(quotaMessage('QUOTA_TOKENS', new Date('2026-10-21T12:03:00Z'), 250000, now)).toBe('Limite de jetons par minute atteinte : reprise à 14:03.');
    expect(quotaMessage('QUOTA_JOUR', new Date('2026-10-22T07:00:00Z'), 20, now)).toBe('Quota Gemini du jour atteint (20 requêtes) : reprise jeudi à 09:00.');
    expect(quotaMessage('QUOTA_JOUR', new Date('2026-10-22T07:00:00Z'), 20, new Date('2026-10-22T05:00:00Z'))).toBe("Quota Gemini du jour atteint (20 requêtes) : reprise aujourd'hui à 09:00.");
    expect(quotaMessage('QUOTA_GOOGLE', new Date('2026-10-21T12:40:00Z'), null, now)).toBe('Quota Gemini dépassé chez Google : reprise à 14:40.');
    expect(quotaMessage('QUOTA_GOOGLE', new Date('2026-10-22T07:00:00Z'), null, now)).toBe('Quota Gemini dépassé chez Google : reprise jeudi à 09:00.');
  });

  it('heure affichée jamais plus tôt que la vraie : arrondie à la minute supérieure s’il y a des secondes', () => {
    expect(quotaMessage('QUOTA_MINUTE', new Date('2026-10-21T12:03:31Z'), 5, now)).toBe('Limite de 5 requêtes par minute atteinte : reprise à 14:04.');
    expect(quotaMessage('QUOTA_TOKENS', new Date('2026-10-21T12:03:00.001Z'), 1000, now)).toBe('Limite de jetons par minute atteinte : reprise à 14:04.');
    expect(quotaMessage('QUOTA_GOOGLE', new Date('2026-10-21T12:40:37.200Z'), null, now)).toBe('Quota Gemini dépassé chez Google : reprise à 14:41.');
    // Minute pile : inchangée ; passage de minuit à Paris : le jour suit l'heure arrondie.
    expect(quotaMessage('QUOTA_GOOGLE', new Date('2026-10-21T12:40:00Z'), null, now)).toBe('Quota Gemini dépassé chez Google : reprise à 14:40.');
    expect(quotaMessage('QUOTA_GOOGLE', new Date('2026-10-21T21:59:30Z'), null, new Date('2026-10-21T21:59:00Z'))).toBe('Quota Gemini dépassé chez Google : reprise jeudi à 00:00.');
  });
});

describe('pause après un 429 de Google', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const sdk = (detail: string) =>
    `[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent: [429 Too Many Requests] ${detail}`;

  it('RetryInfo « retryDelay » : maintenant + délai', () => {
    const message = sdk(
      'You exceeded your current quota, please check your plan and billing details. [{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-3.8-flash"},"quotaValue":"5"}]},{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]',
    );
    expect(pauseAfter429(message, now).toISOString()).toBe('2026-10-21T12:00:37.000Z');
  });

  it('texte « Please retry in 37.2s »', () => {
    expect(pauseAfter429(sdk('Resource has been exhausted. Please retry in 37.2s.'), now).toISOString()).toBe('2026-10-21T12:00:37.200Z');
  });

  it('quota journalier : prochain minuit du Pacifique, même avec un retryDelay', () => {
    const message = sdk(
      'You exceeded your current quota. [{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"12s"}]',
    );
    expect(pauseAfter429(message, now).toISOString()).toBe('2026-10-22T07:00:00.000Z');
  });

  it('sans indication : une heure, comme avant', () => {
    expect(pauseAfter429(sdk('quota'), now).toISOString()).toBe('2026-10-21T13:00:00.000Z');
  });
});

describe('GeminiQuotaService (Redis réel)', () => {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1 });
  const prefix = `test-gemini-quota-${process.pid}`;
  const NOW = new Date('2026-10-21T12:02:30Z');
  const M = 'gemini-3-flash';
  const L = 'gemini-3-flash-lite';
  const quiet = { error: jest.fn() };
  const serviceWith = (limits: Partial<Record<string, string>> = {}, prisma = fakePrisma()) => {
    for (const [key, value] of Object.entries(limits)) prisma.settings.set(key, value);
    return { prisma, quota: new GeminiQuotaService(prisma, redis, { prefix, log: quiet }) };
  };

  afterEach(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
  });
  afterAll(() => redis.quit());

  it('limites par défaut 5 / 250 000 / 20, puis réglées en base', async () => {
    expect(DEFAULT_LIMITS).toEqual({ rpm: 5, tpm: 250000, rpd: 20 });
    await expect(serviceWith().quota.limits(M)).resolves.toEqual(DEFAULT_LIMITS);
    const { quota, prisma } = serviceWith({ [GEMINI_RPM_KEY]: '10', [GEMINI_TPM_KEY]: '1000', [GEMINI_RPD_KEY]: 'abc' });
    await expect(quota.limits(M)).resolves.toEqual({ rpm: 10, tpm: 1000, rpd: 20 });
    await quota.setLimits(M, { rpm: 3, tpm: 500, rpd: 7 });
    expect(prisma.settings.get(`${GEMINI_RPD_KEY}:${M}`)).toBe('7');
    expect(prisma.settings.get(GEMINI_RPD_KEY)).toBe('abc');
    await expect(quota.limits(M)).resolves.toEqual({ rpm: 3, tpm: 500, rpd: 7 });
  });

  it('limites par modèle : réglage du modèle, sinon réglage commun, sinon défaut', async () => {
    const { quota } = serviceWith({ [GEMINI_RPM_KEY]: '10', [`${GEMINI_RPD_KEY}:${L}`]: '1000', [`${GEMINI_RPD_KEY}:${M}`]: '0' });
    await expect(quota.limits(L)).resolves.toEqual({ rpm: 10, tpm: DEFAULT_LIMITS.tpm, rpd: 1000 });
    // Réglage du modèle illisible : le commun, absent ici, puis le défaut.
    await expect(quota.limits(M)).resolves.toEqual({ rpm: 10, tpm: DEFAULT_LIMITS.tpm, rpd: DEFAULT_LIMITS.rpd });
    await quota.setLimits(M, { rpm: 2, tpm: 100, rpd: 3 });
    await expect(quota.limits(L)).resolves.toEqual({ rpm: 10, tpm: DEFAULT_LIMITS.tpm, rpd: 1000 });
  });

  it('compteurs séparés par modèle : le quota du jour de l’un ne bloque pas l’autre', async () => {
    const { quota } = serviceWith({ [GEMINI_RPD_KEY]: '1', [GEMINI_RPM_KEY]: '100' });
    await quota.reserve(M, NOW);
    await expect(quota.reserve(M, at(1))).rejects.toMatchObject({ reason: 'QUOTA_JOUR' });
    await expect(quota.reserve(L, at(1))).resolves.toBeUndefined();
    await expect(quota.reserve(L, at(2))).rejects.toMatchObject({ reason: 'QUOTA_JOUR' });
  });

  it('modèle marqué épuisé (429 journalier) : refus du jour jusqu’au prochain minuit du Pacifique, les autres passent', async () => {
    const { quota } = serviceWith();
    await quota.markExhausted(M, NOW);
    const e = await quota.reserve(M, at(1)).catch((x: any) => x);
    expect(e).toMatchObject({ reason: 'QUOTA_JOUR', until: new Date('2026-10-22T07:00:00Z') });
    await expect(quota.reserve(L, at(1))).resolves.toBeUndefined();
    const ttl = await redis.pttl(`${prefix}:${M}:epuise`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(new Date('2026-10-22T07:00:00Z').getTime() - NOW.getTime());
    // Blocked suit la bascule : L décide tant qu'il a de la place.
    await expect(quota.blocked([M, L], at(2))).resolves.toBeNull();
    await quota.markExhausted(L, NOW);
    await expect(quota.blocked([M, L], at(2))).resolves.toMatchObject({ reason: 'QUOTA_JOUR', limit: 20 });
  });

  const at = (s: number) => new Date(NOW.getTime() + s * 1000);

  it('fenêtre glissante de 60 s : la 6e requête attend que la plus ancienne ait 60 s (+ 1 s)', async () => {
    const { quota } = serviceWith();
    for (let i = 0; i < 5; i++) await quota.reserve(M, at(i * 10)); // 12:02:30, :40, :50, 12:03:00, :10
    const e = await quota.reserve(M, at(45)).catch((x: any) => x);
    expect(e).toBeInstanceOf(GeminiQuotaError);
    expect(e.reason).toBe('QUOTA_MINUTE');
    expect(e.until.toISOString()).toBe('2026-10-21T12:03:31.000Z');
    expect(e.message).toBe('Limite de 5 requêtes par minute atteinte : reprise à 14:04.');
    // Changer de minute UTC ne remet rien à zéro : la plus ancienne compte encore.
    await expect(quota.reserve(M, at(59))).rejects.toBeInstanceOf(GeminiQuotaError);
    await expect(quota.reserve(M, at(61))).resolves.toBeUndefined();
  });

  it('deux appels à 59 s d’écart comptent ensemble, à 61 s non', async () => {
    const { quota } = serviceWith({ [GEMINI_RPM_KEY]: '1' });
    await quota.reserve(M, at(0));
    const e = await quota.reserve(M, at(59)).catch((x: any) => x);
    expect(e.reason).toBe('QUOTA_MINUTE');
    expect(e.until.toISOString()).toBe(at(61).toISOString());
    await expect(quota.reserve(M, at(61))).resolves.toBeUndefined();
  });

  it('jetons sur 60 s glissantes : refus au plafond, reprise quand assez de jetons sont sortis de la fenêtre', async () => {
    const { quota } = serviceWith({ [GEMINI_TPM_KEY]: '1000', [GEMINI_RPM_KEY]: '100' });
    await quota.reserve(M, at(0));
    await quota.addTokens(M, 400, at(0));
    await quota.reserve(M, at(10));
    await quota.addTokens(M, 599, at(10));
    await expect(quota.reserve(M, at(20))).resolves.toBeUndefined();
    await quota.addTokens(M, 300, at(20));
    // 1 299 jetons : il faut que 400 (à 0 s) sortent pour repasser sous 1 000.
    const e = await quota.reserve(M, at(30)).catch((x: any) => x);
    expect(e.reason).toBe('QUOTA_TOKENS');
    expect(e.until.toISOString()).toBe(at(61).toISOString());
    expect(e.message).toBe('Limite de jetons par minute atteinte : reprise à 14:04.');
    await expect(quota.reserve(M, at(61))).resolves.toBeUndefined();
  });

  it('jour : refus jusqu’au prochain minuit du Pacifique, compteur par jour du Pacifique', async () => {
    const { quota } = serviceWith({ [GEMINI_RPD_KEY]: '2', [GEMINI_RPM_KEY]: '100' });
    await quota.reserve(M, NOW);
    await quota.reserve(M, at(60));
    const e = await quota.reserve(M, at(120)).catch((x: any) => x);
    expect(e.reason).toBe('QUOTA_JOUR');
    expect(e.until.toISOString()).toBe('2026-10-22T07:00:00.000Z');
    expect(e.message).toBe('Quota Gemini du jour atteint (2 requêtes) : reprise jeudi à 09:00.');
    await expect(quota.reserve(M, new Date('2026-10-22T07:00:00Z'))).resolves.toBeUndefined();
  });

  it('deux réservations simultanées pour une seule place : une seule passe', async () => {
    const { quota } = serviceWith({ [GEMINI_RPM_KEY]: '1' });
    const results = await Promise.allSettled([quota.reserve(M, NOW), quota.reserve(M, NOW)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('durées de vie : 2 min pour la minute, 26 h pour le jour', async () => {
    const { quota } = serviceWith();
    await quota.reserve(M, NOW);
    await quota.addTokens(M, 10, NOW);
    const ttls = await Promise.all((await redis.keys(`${prefix}:${M}:*`)).sort().map(async (k) => [k.split(':')[2], await redis.ttl(k)] as const));
    expect(Object.fromEntries(ttls)).toEqual({ rpd: 26 * 3600, rpm: 120, tpm: 120 });
  });

  it('usage : compteurs des 60 dernières secondes et du jour, limites et heure de remise à zéro du jour', async () => {
    const { quota } = serviceWith();
    await quota.reserve(M, at(-70));
    await quota.addTokens(M, 500, at(-70));
    await quota.reserve(M, NOW);
    await quota.addTokens(M, 2700, NOW);
    await quota.markExhausted(L, NOW);
    await expect(quota.usage([M, L], NOW)).resolves.toEqual({
      current: M,
      minute: { requests: 1, tokens: 2700 },
      dayResetsAt: '2026-10-22T07:00:00.000Z',
      models: [
        { model: M, requests: 2, limits: DEFAULT_LIMITS, exhaustedUntil: null, asideUntil: null },
        { model: L, requests: 0, limits: DEFAULT_LIMITS, exhaustedUntil: '2026-10-22T07:00:00.000Z', asideUntil: null },
      ],
    });
  });

  it('usage : modèle en cours = le premier dont le quota du jour n’est pas atteint ; tous épuisés : aucun', async () => {
    const { quota } = serviceWith();
    await quota.markExhausted(M, NOW);
    await quota.reserve(L, NOW);
    const u = await quota.usage([M, L], NOW);
    expect(u.current).toBe(L);
    expect(u.minute.requests).toBe(1);
    await quota.markExhausted(L, NOW);
    expect((await quota.usage([M, L], NOW)).current).toBeNull();
    expect(await quota.usage([], NOW)).toMatchObject({ current: null, models: [] });
  });

  it('mis de côté 15 min : réservation refusée jusqu’à l’échéance, sans rien compter, puis rendue ; exposé dans usage et blocked', async () => {
    const { quota } = serviceWith();
    await quota.markUnavailable(M, at(900), NOW);
    const e = await quota.reserve(M, NOW).catch((x: any) => x);
    expect(e).toBeInstanceOf(GeminiModelAsideError);
    expect(Math.abs(e.until.getTime() - at(900).getTime())).toBeLessThan(2000);
    expect(e.message).toMatch(/^Gemini en pause jusqu'à \d\d:\d\d \(modèle lent ou saturé\)$/);
    const u = await quota.usage([M, L], NOW);
    expect(u.current).toBe(L);
    expect(u.models[0].requests).toBe(0);
    expect(Math.abs(new Date(u.models[0].asideUntil!).getTime() - at(900).getTime())).toBeLessThan(2000);
    expect(u.models[1].asideUntil).toBeNull();
    await expect(quota.blocked([M, L], NOW)).resolves.toBeNull();
    // Tous écartés : la reprise la plus proche (mis de côté avant le minuit du Pacifique).
    await quota.markExhausted(L, NOW);
    expect(await quota.blocked([L, M], NOW)).toBeInstanceOf(GeminiModelAsideError);
    expect((await quota.usage([M, L], NOW)).current).toBeNull();
    await redis.del(`${prefix}:${M}:de-cote`);
    await expect(quota.reserve(M, NOW)).resolves.toBeUndefined();
  });

  it('blocked : le refus qu’essuierait un appel, sans rien réserver', async () => {
    const { quota } = serviceWith({ [GEMINI_RPM_KEY]: '1' });
    await expect(quota.blocked([M], NOW)).resolves.toBeNull();
    await quota.reserve(M, NOW);
    const b = await quota.blocked([M], at(5));
    expect(b).toMatchObject({ reason: 'QUOTA_MINUTE', until: at(61) });
    expect((await quota.usage([M], at(5))).minute.requests).toBe(1);
  });

  it('usage, Redis injoignable : compteurs à zéro (journalisé), jamais d’erreur', async () => {
    const log = { error: jest.fn() };
    const broken = new Proxy({}, { get: () => jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) }) as unknown as Redis;
    const quota = new GeminiQuotaService(fakePrisma(), broken, { prefix, log });
    await expect(quota.usage([M], NOW)).resolves.toMatchObject({ current: M, minute: { requests: 0, tokens: 0 }, models: [{ model: M, requests: 0 }] });
    await expect(quota.blocked([M], NOW)).resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  it('Redis injoignable : l’appel part quand même (journalisé)', async () => {
    const log = { error: jest.fn() };
    const broken = { eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as unknown as Redis;
    await expect(new GeminiQuotaService(fakePrisma(), broken, { prefix, log }).reserve(M, NOW)).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });
});
