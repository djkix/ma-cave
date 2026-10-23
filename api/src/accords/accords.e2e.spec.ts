import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppUser } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';
import { DISH_PAIRING_PROVIDER, DishPairingWine } from '../vision/pairing-provider.interface';

// « Accords vins » en HTTP contre le vrai AppModule, Gemini remplacé : un
// propriétaire et un membre (VIEWER) de A, un propriétaire de B (cave vide).
const describeIfInfra = process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

describeIfInfra('POST /api/accords (HTTP)', () => {
  let app: INestApplication;
  let sessionRedis: { quit: () => Promise<unknown> };
  let prisma: import('../prisma/prisma.service').PrismaService;
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const caveIds: string[] = [];
  let wineA: string;
  let ownerA: supertest.Agent;
  let viewerA: supertest.Agent;
  let ownerB: supertest.Agent;
  /** Le faux Gemini choisit chaque vin reçu, plus un numéro inconnu. */
  const provider = {
    pairDish: jest.fn(async (_dish: string, wines: DishPairingWine[]) => ({
      raw: { compris: ['Rouge', 'À boire d’abord'], ideal: 'Un rouge charpenté', choix: [...wines.map((_, i) => ({ vin: i + 1, score: 80, raison: 'Tanins fondus' })), { vin: 99, score: 100, raison: 'inconnu' }] },
      model: 'faux',
      costCents: 0,
    })),
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
    process.env.GEMINI_API_KEY ??= 'invalid';
    process.env.WEB_ORIGIN ??= 'http://localhost:5173';
    delete process.env.BREAK_GLASS_EMAIL;
    delete process.env.BREAK_GLASS_PASSWORD;

    const { AppModule } = await import('../app.module');
    const { setupSession } = await import('../auth/session.setup');
    const { PrismaService } = await import('../prisma/prisma.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DISH_PAIRING_PROVIDER).useValue(provider).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    sessionRedis = setupSession(app);
    prisma = app.get(PrismaService);
    app.use('/__test/login', (req: any, res: any) => {
      prisma.appUser
        .findUniqueOrThrow({ where: { id: String(req.query.id) } })
        .then((user) => req.logIn(user, (err: unknown) => (err ? res.status(500).end() : res.status(204).end())))
        .catch(() => res.status(500).end());
    });
    await app.listen(0, '127.0.0.1');

    const user = async (name: string) => {
      const u = await prisma.appUser.create({ data: { email: `accords-${run}-${name}@example.test`, displayName: name } });
      userIds.push(u.id);
      return u;
    };
    const [uOwnerA, uViewerA, uOwnerB] = [await user('owner-a'), await user('viewer-a'), await user('owner-b')];
    const caveA = (await createTestCave(prisma, { owner: uOwnerA, name: `Accords A ${run}` })).id;
    const caveB = (await createTestCave(prisma, { owner: uOwnerB, name: `Accords B ${run}` })).id;
    caveIds.push(caveA, caveB);
    await prisma.caveMember.create({ data: { caveId: caveA, userId: uViewerA.id, role: 'VIEWER' } });

    const wine = async (name: string, quantity: number) => {
      const w = await prisma.wine.create({ data: { caveId: caveA, matchKey: `accords-${run}-${name}`, producer: `Domaine Accord ${name}`, appellationRaw: 'Bandol', color: 'ROUGE', vintage: 2016 } });
      if (quantity) await prisma.movement.create({ data: { wineId: w.id, delta: quantity, type: 'IN', idempotencyKey: `accords-${run}-${name}` } });
      return w.id;
    };
    wineA = await wine('a', 4);
    await wine('vide', 0);

    const signedIn = async (u: AppUser) => {
      const agent = supertest.agent(app.getHttpServer());
      expect((await agent.get(`/__test/login?id=${u.id}`)).status).toBe(204);
      return agent;
    };
    [ownerA, viewerA, ownerB] = [await signedIn(uOwnerA), await signedIn(uViewerA), await signedIn(uOwnerB)];
  }, 120_000);

  afterAll(async () => {
    if (prisma && caveIds.length) {
      await deleteTestCaves(prisma, caveIds);
      await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    if (sessionRedis) await sessionRedis.quit();
  });

  beforeEach(() => provider.pairDish.mockClear());

  it('membre : 200, les vins en stock de A seulement, numéro inconnu écarté', async () => {
    const res = await viewerA.post('/api/accords').send({ dish: ' Daube provençale ' });
    expect(res.status).toBe(200);
    expect(provider.pairDish).toHaveBeenCalledWith('Daube provençale', [expect.objectContaining({ producer: 'Domaine Accord a', appellation: 'Bandol', color: 'ROUGE', vintage: 2016 })]);
    expect(res.body).toMatchObject({ dish: 'Daube provençale', wineCount: 1, understood: ['Rouge', 'À boire d’abord'], ideal: 'Un rouge charpenté' });
    expect(res.body.picks).toEqual([expect.objectContaining({ wineId: wineA, score: 80, reason: 'Tanins fondus', quantity: 4, place: 'Sans emplacement' })]);
  });

  it('propriétaire de B, cave vide : réponse vide sans appel à l’IA', async () => {
    const res = await ownerB.post('/api/accords').send({ dish: 'Daube' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dish: 'Daube', wineCount: 0, understood: [], ideal: null, picks: [] });
    expect(provider.pairDish).not.toHaveBeenCalled();
  });

  it('plat vide ou trop long : 400 en français', async () => {
    expect((await ownerA.post('/api/accords').send({ dish: '' })).body).toMatchObject({ statusCode: 400, message: 'Indiquez le plat' });
    expect((await ownerA.post('/api/accords').send({ dish: 'x'.repeat(201) })).body).toMatchObject({ statusCode: 400, message: 'Le plat tient en 200 caractères au plus' });
    expect(provider.pairDish).not.toHaveBeenCalled();
  });

  it('anonyme : 401', async () => {
    expect((await supertest(app.getHttpServer()).post('/api/accords').send({ dish: 'Daube' })).status).toBe(401);
  });
});
