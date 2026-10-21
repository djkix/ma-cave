import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppUser } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import supertest from 'supertest';
import { PLAN_ANALYSIS_QUEUE_TOKEN } from '../queue/plan-analysis';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';
import { CavePlansController } from './plan.controller';

// Plans de la cave et repères des zones, en HTTP contre le vrai AppModule : un
// propriétaire de A, un membre (VIEWER) de A, un propriétaire de B, et un compte
// qui possède C et est membre de A (image lue hors de la cave courante).
const describeIfInfra = process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

interface Zone { id: string; name: string; marker: { planId: string; x: number; y: number } | null }
interface Suggestion { id: string; kind: string; name: string; box: number[]; rows: number; cols: number }
interface Plan { id: string; name: string; width: number; height: number; updatedAt: string; analysis: string; suggestions: Suggestion[] }
interface PlansRead { plans: Plan[]; markers: Array<{ zoneId: string; planId: string; name: string; number: number; x: number; y: number }> }

describeIfInfra('plans de la cave (HTTP)', () => {
  let app: INestApplication;
  let sessionRedis: { quit: () => Promise<unknown> };
  let prisma: import('../prisma/prisma.service').PrismaService;
  const run = randomUUID().slice(0, 8);
  const storage = mkdtempSync(join(tmpdir(), 'cave-plan-e2e-'));
  const userIds: string[] = [];
  const caveIds: string[] = [];
  let caveA: string;
  let caveB: string;
  let caveC: string;
  let ownerA: supertest.Agent;
  let viewerA: supertest.Agent;
  let ownerB: supertest.Agent;
  let switcher: supertest.Agent;

  const expectStatus = (res: supertest.Response, status: number, message: string) => {
    expect({ status: res.status, message: res.body?.message }).toEqual({ status, message });
  };
  const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#c0b0a0' } }).png().toBuffer();
  const create = (name: unknown, file: Buffer, agent: supertest.Agent = ownerA, contentType = 'image/png') => {
    const req = agent.post('/api/caves/current/plans');
    if (typeof name === 'string') req.field('name', name);
    return req.attach('file', file, { filename: 'plan.png', contentType });
  };
  const replace = (id: string, file: Buffer, agent: supertest.Agent = ownerA, contentType = 'image/png') =>
    agent.put(`/api/caves/current/plans/${id}/image`).attach('file', file, { filename: 'plan.png', contentType });
  const rename = (id: string, body: unknown, agent: supertest.Agent = ownerA) => agent.patch(`/api/caves/current/plans/${id}`).send(body as object);
  const read = async (agent: supertest.Agent = ownerA): Promise<PlansRead> => {
    const res = await agent.get('/api/caves/current/plans');
    expect(res.status).toBe(200);
    return res.body;
  };
  const zones = async (agent: supertest.Agent = ownerA): Promise<Zone[]> => (await agent.get('/api/caves/current/zones')).body;
  const newZone = async (name: string): Promise<Zone> => {
    const res = await ownerA.post('/api/caves/current/zones').send({ name });
    expect(res.status).toBe(201);
    return res.body;
  };
  const mark = (id: string, body: unknown, agent: supertest.Agent = ownerA) => agent.put(`/api/caves/current/zones/${id}/marker`).send(body as object);
  const planFile = (id: string) => join(storage, 'plans', `${id}.jpg`);
  const analysisQueue = { add: jest.fn<Promise<object>, unknown[]>(async () => ({})), close: jest.fn(async () => undefined), opts: {} };

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
    process.env.GEMINI_API_KEY ??= 'invalid';
    process.env.WEB_ORIGIN ??= 'http://localhost:5173';
    process.env.PHOTO_STORAGE_DIR = storage;
    delete process.env.BREAK_GLASS_EMAIL;
    delete process.env.BREAK_GLASS_PASSWORD;

    const { AppModule } = await import('../app.module');
    const { setupSession } = await import('../auth/session.setup');
    const { PrismaService } = await import('../prisma/prisma.service');

    // File d'analyse remplacée : chaque mise en file est notée, aucune tâche ne part dans Redis.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PLAN_ANALYSIS_QUEUE_TOKEN)
      .useValue(analysisQueue)
      .compile();
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
      const u = await prisma.appUser.create({ data: { email: `plan-${run}-${name}@example.test`, displayName: name } });
      userIds.push(u.id);
      return u;
    };
    const [uOwnerA, uViewerA, uOwnerB, uSwitcher] = [await user('owner-a'), await user('viewer-a'), await user('owner-b'), await user('switcher')];
    caveA = (await createTestCave(prisma, { owner: uOwnerA, name: `Plan A ${run}` })).id;
    caveB = (await createTestCave(prisma, { owner: uOwnerB, name: `Plan B ${run}` })).id;
    caveC = (await createTestCave(prisma, { owner: uSwitcher, name: `Plan C ${run}` })).id;
    caveIds.push(caveA, caveB, caveC);
    await prisma.caveMember.createMany({
      data: [
        { caveId: caveA, userId: uViewerA.id, role: 'VIEWER' },
        { caveId: caveA, userId: uSwitcher.id, role: 'VIEWER' },
      ],
    });
    const signedIn = async (u: AppUser) => {
      const agent = supertest.agent(app.getHttpServer());
      expect((await agent.get(`/__test/login?id=${u.id}`)).status).toBe(204);
      return agent;
    };
    [ownerA, viewerA, ownerB, switcher] = [await signedIn(uOwnerA), await signedIn(uViewerA), await signedIn(uOwnerB), await signedIn(uSwitcher)];
  }, 120_000);

  afterAll(async () => {
    if (prisma && caveIds.length) {
      await deleteTestCaves(prisma, caveIds);
      await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
    if (sessionRedis) await sessionRedis.quit();
    rmSync(storage, { recursive: true, force: true });
  });

  // Les tests s'enchaînent : sans plan, création, renommage, repères, image, suppression.
  let p1: Plan;
  let p2: Plan;
  let pB: Plan;
  let z1: Zone;
  let z2: Zone;
  let z3: Zone;

  it('sans plan : rien à lire', async () => {
    expect(await read()).toEqual({ plans: [], markers: [] });
    expect(await read(viewerA)).toEqual({ plans: [], markers: [] });
  });

  describe('créer un plan', () => {
    it('est limité comme l’envoi d’une photo (ThrottlerGuard)', () => {
      for (const handler of [CavePlansController.prototype.create, CavePlansController.prototype.replaceImage]) {
        const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];
        expect(guards).toContain(ThrottlerGuard);
      }
    });

    it('le propriétaire crée « Cellier » : 201, JPEG de 2400 px au plus sur le grand côté en plans/<id>.jpg ; le membre ne peut pas', async () => {
      const big = await png(4800, 2400);
      expectStatus(await create('Cellier', big, viewerA), 403, 'Lecture seule');
      const res = await create('  Cellier  ', big);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: expect.any(String), name: 'Cellier', width: 2400, height: 1200, updatedAt: expect.any(String), analysis: 'PENDING', suggestions: [] });
      p1 = res.body;
      // Une tâche d'analyse en file, avec la date de l'image analysée.
      expect(analysisQueue.add).toHaveBeenCalledTimes(1);
      expect(analysisQueue.add).toHaveBeenCalledWith('analyse', { planId: p1.id, updatedAt: p1.updatedAt });
      expect(await sharp(planFile(p1.id)).metadata()).toMatchObject({ format: 'jpeg', width: 2400, height: 1200 });
      expect(await read(viewerA)).toEqual({ plans: [p1], markers: [] });
      // Aucun fichier temporaire ne reste à côté du plan.
      expect(readdirSync(join(storage, 'plans'))).toEqual([`${p1.id}.jpg`]);
    });

    it('409 « Un plan porte déjà ce nom » (casse ignorée) ; 400 pour un nom vide, trop long ou absent', async () => {
      const image = await png(200, 100);
      expectStatus(await create('cellier', image), 409, 'Un plan porte déjà ce nom');
      for (const name of ['', '   ', 'x'.repeat(41), undefined]) {
        expectStatus(await create(name, image), 400, 'Le nom du plan doit faire de 1 à 40 caractères');
      }
      expect((await read()).plans).toEqual([p1]);
      expect(readdirSync(join(storage, 'plans'))).toEqual([`${p1.id}.jpg`]);
    });

    it('400 sans fichier, format refusé ou image illisible ; 413 au-delà de 15 Mo ; rien n’est créé', async () => {
      expectStatus(await ownerA.post('/api/caves/current/plans').field('name', 'Garage'), 400, 'Fichier « file » manquant');
      expectStatus(await create('Garage', Buffer.from('x'), ownerA, 'image/gif'), 400, 'Format d’image non pris en charge');
      expectStatus(await create('Garage', Buffer.from('pas une image'), ownerA, 'image/jpeg'), 400, 'Image illisible ou format non pris en charge');
      expectStatus(await create('Garage', Buffer.alloc(15 * 1024 * 1024 + 1), ownerA, 'image/jpeg'), 413, 'Photo trop lourde (15 Mo au plus)');
      expect((await read()).plans).toEqual([p1]);
      expect(readdirSync(join(storage, 'plans'))).toEqual([`${p1.id}.jpg`]);
    });

    it('mise en file impossible : le plan est créé quand même, analyse FAILED', async () => {
      analysisQueue.add.mockRejectedValueOnce(new Error('Redis injoignable'));
      const res = await create('Cave à part', await png(100, 100));
      expect(res.status).toBe(201);
      expect(res.body.analysis).toBe('FAILED');
      expect((await read()).plans.find((p) => p.id === res.body.id)?.analysis).toBe('FAILED');
      expect((await ownerA.delete(`/api/caves/current/plans/${res.body.id}`)).status).toBe(204);
    });

    it('un second plan suit le premier (ordre de création) ; B a ses propres plans', async () => {
      const res = await create('Garage', await png(600, 300));
      expect(res.status).toBe(201);
      p2 = res.body;
      expect((await read()).plans.map((p) => p.name)).toEqual(['Cellier', 'Garage']);
      // Même nom dans une autre cave : permis.
      const b = await create('Cellier', await png(300, 300), ownerB);
      expect(b.status).toBe(201);
      pB = b.body;
      expect((await read(ownerB)).plans).toEqual([pB]);
      expect((await read()).plans.map((p) => p.id)).toEqual([p1.id, p2.id]);
    });

    it('409 « 20 plans au plus par cave » au 21e plan ; aucun fichier ajouté', async () => {
      const extra = Array.from({ length: 18 }, (_, i) => ({ caveId: caveA, name: `Extra ${i}`, path: `plans/extra-${i}.jpg`, width: 10, height: 10, updatedAt: new Date() }));
      await prisma.cavePlan.createMany({ data: extra });
      expect((await read()).plans).toHaveLength(20);
      expectStatus(await create('Vingt et un', await png(100, 100)), 409, '20 plans au plus par cave');
      expect((await read()).plans).toHaveLength(20);
      await prisma.cavePlan.deleteMany({ where: { caveId: caveA, name: { startsWith: 'Extra ' } } });
      expect(readdirSync(join(storage, 'plans')).sort()).toEqual([`${p1.id}.jpg`, `${p2.id}.jpg`, `${pB.id}.jpg`].sort());
    });
  });

  describe('renommer', () => {
    it('vers son propre nom, casse changée : 200 ; vers le nom d’un autre plan : 409 ; nom invalide : 400', async () => {
      const res = await rename(p1.id, { name: 'CELLIER' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...p1, name: 'CELLIER' });
      expectStatus(await rename(p2.id, { name: 'cellier' }), 409, 'Un plan porte déjà ce nom');
      expectStatus(await rename(p2.id, { name: '' }), 400, 'Le nom du plan doit faire de 1 à 40 caractères');
      expectStatus(await rename(p2.id, {}), 400, 'Le nom du plan doit faire de 1 à 40 caractères');
      expect((await rename(p1.id, { name: 'Cellier' })).status).toBe(200);
      expect((await read()).plans.map((p) => p.name)).toEqual(['Cellier', 'Garage']);
    });
  });

  describe('repères', () => {
    it('posés sur un plan de la cave ; numérotés par plan dans l’ordre d’affichage des zones', async () => {
      [z1, z2, z3] = [await newZone(`Z1 ${run}`), await newZone(`Z2 ${run}`), await newZone(`Z3 ${run}`)];
      const res = await mark(z1.id, { planId: p1.id, x: 0.1, y: 0.2 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: z1.id, marker: { planId: p1.id, x: 0.1, y: 0.2 } });
      expect((await mark(z2.id, { planId: p1.id, x: 0.3, y: 0.4 })).status).toBe(200);
      expect((await mark(z3.id, { planId: p2.id, x: 0.5, y: 0.6 })).status).toBe(200);
      expect((await zones(viewerA)).find((z) => z.id === z3.id)?.marker).toEqual({ planId: p2.id, x: 0.5, y: 0.6 });
      expect((await read(viewerA)).markers).toEqual([
        { zoneId: z1.id, planId: p1.id, name: z1.name, number: 1, x: 0.1, y: 0.2 },
        { zoneId: z2.id, planId: p1.id, name: z2.name, number: 2, x: 0.3, y: 0.4 },
        { zoneId: z3.id, planId: p2.id, name: z3.name, number: 1, x: 0.5, y: 0.6 },
      ]);
      // Nouvel ordre : Z2, Z3, Z1 → Z2 devient 1 sur Cellier.
      expect((await ownerA.post('/api/caves/current/zones/order').send({ ids: [z2.id, z3.id, z1.id] })).status).toBe(200);
      expect((await read()).markers.map((m) => [m.zoneId, m.planId, m.number])).toEqual([[z2.id, p1.id, 1], [z3.id, p2.id, 1], [z1.id, p1.id, 2]]);
    });

    it('une zone archivée n’apparaît pas', async () => {
      const z = await newZone(`Archivée ${run}`);
      expect((await mark(z.id, { planId: p1.id, x: 0.9, y: 0.9 })).status).toBe(200);
      await prisma.caveZone.update({ where: { id: z.id }, data: { archivedAt: new Date() } });
      expect((await read()).markers.map((m) => m.zoneId)).toEqual([z2.id, z3.id, z1.id]);
    });

    it('404 « Plan introuvable » : plan d’une autre cave, inconnu ou identifiant invalide ; le repère ne change pas', async () => {
      for (const planId of [pB.id, randomUUID(), 'pas-un-uuid', undefined, 12]) {
        expectStatus(await mark(z1.id, { planId, x: 0.5, y: 0.5 }), 404, 'Plan introuvable');
      }
      expect((await zones()).find((z) => z.id === z1.id)?.marker).toEqual({ planId: p1.id, x: 0.1, y: 0.2 });
    });

    it.each([
      [{ x: 1.5, y: 0.5 }], [{ x: -0.1, y: 0.5 }], [{ x: 0.5 }], [{ x: '0.5', y: 0.5 }], [{ x: null, y: null }], [{ x: 0.5, y: 2 }],
    ])('400 « Position invalide sur le plan » : %j', async (pos) => {
      expectStatus(await mark(z1.id, { planId: p1.id, ...pos }), 400, 'Position invalide sur le plan');
    });

    it('retirer un repère efface plan et position', async () => {
      const res = await ownerA.delete(`/api/caves/current/zones/${z2.id}/marker`);
      expect(res.status).toBe(200);
      expect(res.body.marker).toBeNull();
      expect(await prisma.caveZone.findUniqueOrThrow({ where: { id: z2.id } })).toMatchObject({ planId: null, planX: null, planY: null });
      expect((await mark(z2.id, { planId: p1.id, x: 0.3, y: 0.4 })).status).toBe(200);
    });
  });

  describe('remplacer l’image', () => {
    it('nouvelle taille et nouvelle date, même fichier ; repères inchangés ; anciennes propositions effacées, nouvelle analyse en file', async () => {
      await prisma.cavePlan.update({
        where: { id: p1.id },
        data: { analysisStatus: 'DONE', suggestions: [{ id: randomUUID(), kind: 'CASIER', name: 'Casier A', box: [0, 0, 1, 1], rows: 1, cols: 1 }] },
      });
      const before = await read();
      await new Promise((r) => setTimeout(r, 5));
      analysisQueue.add.mockClear();
      const res = await replace(p1.id, await png(500, 1000));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: p1.id, name: 'Cellier', width: 500, height: 1000, updatedAt: expect.any(String), analysis: 'PENDING', suggestions: [] });
      expect(analysisQueue.add).toHaveBeenCalledTimes(1);
      expect(analysisQueue.add).toHaveBeenCalledWith('analyse', { planId: p1.id, updatedAt: res.body.updatedAt });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(new Date(p1.updatedAt).getTime());
      expect(await sharp(planFile(p1.id)).metadata()).toMatchObject({ width: 500, height: 1000 });
      expect((await read()).markers).toEqual(before.markers);
      expect(readdirSync(join(storage, 'plans')).sort()).toEqual([`${p1.id}.jpg`, `${p2.id}.jpg`, `${pB.id}.jpg`].sort());
    });
  });

  describe('image du plan', () => {
    it('lue par tout membre de la cave, même hors de sa cave courante ; 404 « Plan introuvable » pour un étranger', async () => {
      for (const agent of [ownerA, viewerA]) {
        const img = await agent.get(`/api/caves/plans/${p1.id}/image`);
        expect(img.status).toBe(200);
        expect(img.headers['content-type']).toBe('image/jpeg');
        expect(img.headers['cache-control']).toBe('private, no-cache');
      }
      for (const caveId of [caveA, caveC]) {
        expect((await switcher.put('/api/auth/current-cave').send({ caveId })).status).toBe(200);
        expect((await switcher.get(`/api/caves/plans/${p1.id}/image`)).status).toBe(200);
      }
      expectStatus(await ownerB.get(`/api/caves/plans/${p1.id}/image`), 404, 'Plan introuvable');
      expectStatus(await ownerA.get(`/api/caves/plans/${pB.id}/image`), 404, 'Plan introuvable');
      expectStatus(await ownerA.get(`/api/caves/plans/${randomUUID()}/image`), 404, 'Plan introuvable');
      expectStatus(await ownerA.get('/api/caves/plans/pas-un-uuid/image'), 404, 'Plan introuvable');
    });
  });

  describe('droits et isolation', () => {
    it('le membre ne crée, ne renomme, ne remplace ni ne supprime : 403', async () => {
      expectStatus(await create('Frigo', await png(100, 100), viewerA), 403, 'Lecture seule');
      expectStatus(await rename(p1.id, { name: 'Frigo' }, viewerA), 403, 'Lecture seule');
      expectStatus(await replace(p1.id, await png(100, 100), viewerA), 403, 'Lecture seule');
      expectStatus(await viewerA.delete(`/api/caves/current/plans/${p1.id}`), 403, 'Lecture seule');
    });

    it('un plan d’une autre cave, inconnu ou mal désigné : 404 « Plan introuvable », rien ne change', async () => {
      for (const id of [pB.id, randomUUID(), 'pas-un-uuid']) {
        expectStatus(await rename(id, { name: 'Pris' }), 404, 'Plan introuvable');
        expectStatus(await replace(id, await png(100, 100)), 404, 'Plan introuvable');
        expectStatus(await ownerA.delete(`/api/caves/current/plans/${id}`), 404, 'Plan introuvable');
      }
      expect((await read(ownerB)).plans).toEqual([pB]);
      expect(existsSync(planFile(pB.id))).toBe(true);
    });
  });

  describe('propositions de zones', () => {
    const s1: Suggestion = { id: randomUUID(), kind: 'CASIER', name: 'Casier A', box: [0.25, 0.5, 0.75, 1], rows: 6, cols: 4 };
    const s2: Suggestion = { id: randomUUID(), kind: 'ETAGERE', name: 'Étagère B', box: [0.5, 0, 1, 0.5], rows: 3, cols: 8 };
    const s3: Suggestion = { id: randomUUID(), kind: 'AUTRE', name: 'Rangement C', box: [0, 0, 0.25, 0.25], rows: 1, cols: 1 };
    const accept = (sid: string, body: unknown, agent: supertest.Agent = ownerA, planId = p2.id) =>
      agent.post(`/api/caves/current/plans/${planId}/suggestions/${sid}/accept`).send(body as object);
    const reject = (sid: string, agent: supertest.Agent = ownerA, planId = p2.id) => agent.delete(`/api/caves/current/plans/${planId}/suggestions/${sid}`);
    const plan2 = async (agent: supertest.Agent = ownerA) => (await read(agent)).plans.find((p) => p.id === p2.id)!;
    const accepted: string[] = [];

    // Les zones acceptées perdent leur repère : la suite ne voit que ceux posés plus haut.
    afterAll(async () => {
      for (const id of accepted) expect((await ownerA.delete(`/api/caves/current/zones/${id}/marker`)).status).toBe(200);
    });

    it('GET plans expose l’état de l’analyse et les propositions, au membre aussi', async () => {
      await prisma.cavePlan.update({ where: { id: p2.id }, data: { analysisStatus: 'DONE', suggestions: [s1, s2, s3] as object[] } });
      expect(await plan2(viewerA)).toMatchObject({ analysis: 'DONE', suggestions: [s1, s2, s3] });
      expect((await read()).plans.find((p) => p.id === p1.id)).toMatchObject({ analysis: 'PENDING', suggestions: [] });
    });

    it('le membre n’accepte ni ne rejette : 403, rien ne change', async () => {
      expectStatus(await accept(s1.id, { name: 'Casier A', rows: 6, cols: 4 }, viewerA), 403, 'Lecture seule');
      expectStatus(await reject(s1.id, viewerA), 403, 'Lecture seule');
      expect((await plan2()).suggestions).toEqual([s1, s2, s3]);
    });

    it('plan d’une autre cave, inconnu ou mal désigné : 404 « Plan introuvable » ; proposition absente : 404 « Proposition introuvable »', async () => {
      expectStatus(await accept(s1.id, { name: 'Casier A', rows: 6, cols: 4 }, ownerB), 404, 'Plan introuvable');
      expectStatus(await reject(s1.id, ownerB), 404, 'Plan introuvable');
      for (const planId of [pB.id, randomUUID(), 'pas-un-uuid']) {
        expectStatus(await accept(s1.id, { name: 'Casier A', rows: 6, cols: 4 }, ownerA, planId), 404, 'Plan introuvable');
        expectStatus(await reject(s1.id, ownerA, planId), 404, 'Plan introuvable');
      }
      for (const sid of [randomUUID(), 'inconnue']) {
        expectStatus(await accept(sid, { name: 'Casier A', rows: 6, cols: 4 }), 404, 'Proposition introuvable');
        expectStatus(await reject(sid), 404, 'Proposition introuvable');
      }
      expect((await plan2()).suggestions).toEqual([s1, s2, s3]);
    });

    it('corps invalide : 400 (nom de zone, bornes de la grille), rien ne change', async () => {
      const name = 'Le nom de la zone doit faire de 1 à 40 caractères';
      const grid = 'La grille fait de 1 à 26 lignes et de 1 à 30 colonnes';
      expectStatus(await accept(s1.id, { name: ' ', rows: 6, cols: 4 }), 400, name);
      expectStatus(await accept(s1.id, { rows: 6, cols: 4 }), 400, name);
      for (const [rows, cols] of [[0, 4], [27, 4], [6, 0], [6, 31], [2.5, 4], ['6', 4], [undefined, 4]]) {
        expectStatus(await accept(s1.id, { name: 'Casier A', rows, cols }), 400, grid);
      }
      expect((await plan2()).suggestions).toEqual([s1, s2, s3]);
    });

    it('accepter : 201, zone en fin de liste, repère au centre du cadre sur ce plan, grille ; la proposition est retirée', async () => {
      const before = await plan2();
      const res = await accept(s1.id, { name: '  Casier A  ', rows: 5, cols: 4 });
      expect(res.status).toBe(201);
      accepted.push(res.body.id);
      expect(res.body).toEqual({
        id: expect.any(String), name: 'Casier A', indication: null, hasPhoto: false, sortOrder: expect.any(Number),
        marker: { planId: p2.id, x: 0.5, y: 0.75 }, grid: { rows: 5, cols: 4 },
      });
      const listed = await zones();
      expect(listed[listed.length - 1]).toEqual(res.body);
      // L'image n'a pas changé : même date.
      expect(await plan2()).toEqual({ ...before, suggestions: [s2, s3] });
      expect((await read()).markers).toContainEqual({ zoneId: res.body.id, planId: p2.id, name: 'Casier A', number: 2, x: 0.5, y: 0.75 });
    });

    it('accepter deux fois la même proposition : une seule zone, le second appel reçoit 404 « Proposition introuvable »', async () => {
      expectStatus(await accept(s1.id, { name: 'Casier A bis', rows: 6, cols: 4 }), 404, 'Proposition introuvable');
      const count = (await zones()).length;
      // Double toucher, deux appareils : en même temps, sous verrou du plan.
      const both = await Promise.all([accept(s2.id, { name: 'Étagère B', rows: 3, cols: 8 }), accept(s2.id, { name: 'Étagère B2', rows: 3, cols: 8 })]);
      expect(both.map((r) => r.status).sort()).toEqual([201, 404]);
      expect(both.find((r) => r.status === 404)?.body.message).toBe('Proposition introuvable');
      accepted.push(both.find((r) => r.status === 201)!.body.id);
      expect((await zones()).length).toBe(count + 1);
      expect((await plan2()).suggestions).toEqual([s3]);
    });

    it('nom pris par une zone active (casse ignorée) : 409 « Une zone porte déjà ce nom », la proposition reste', async () => {
      expectStatus(await accept(s3.id, { name: 'casier a', rows: 1, cols: 1 }), 409, 'Une zone porte déjà ce nom');
      expect((await plan2()).suggestions).toEqual([s3]);
    });

    it('rejeter : 204, la proposition est retirée ; une seconde fois : 404', async () => {
      const res = await reject(s3.id);
      expect(res.status).toBe(204);
      expect(await plan2()).toMatchObject({ analysis: 'DONE', suggestions: [] });
      expectStatus(await reject(s3.id), 404, 'Proposition introuvable');
    });
  });

  describe('supprimer un plan', () => {
    it('204 ; ses zones (archivées comprises) sont gardées sans repère, son image est effacée, les autres plans ne bougent pas', async () => {
      const archived = await prisma.caveZone.findFirstOrThrow({ where: { caveId: caveA, archivedAt: { not: null } } });
      expect(archived.planId).toBe(p1.id);
      const res = await ownerA.delete(`/api/caves/current/plans/${p1.id}`);
      expect(res.status).toBe(204);
      expect(existsSync(planFile(p1.id))).toBe(false);
      expect(existsSync(planFile(p2.id))).toBe(true);
      const after = await read(viewerA);
      expect(after.plans.map((p) => p.id)).toEqual([p2.id]);
      expect(after.markers).toEqual([{ zoneId: z3.id, planId: p2.id, name: z3.name, number: 1, x: 0.5, y: 0.6 }]);
      const listed = await zones();
      expect(listed.find((z) => z.id === z1.id)?.marker).toBeNull();
      expect(listed.find((z) => z.id === z2.id)?.marker).toBeNull();
      expect(await prisma.caveZone.findUniqueOrThrow({ where: { id: archived.id } })).toMatchObject({ planId: null, planX: null, planY: null });
      expectStatus(await ownerA.get(`/api/caves/plans/${p1.id}/image`), 404, 'Plan introuvable');
      expectStatus(await ownerA.delete(`/api/caves/current/plans/${p1.id}`), 404, 'Plan introuvable');
    });
  });
});
