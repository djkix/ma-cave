import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppUser } from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import supertest from 'supertest';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';
import { CurrentCaveZonesController } from './zones.controller';

// Zones de la cave, en HTTP contre le vrai AppModule : deux caves A et B, un
// propriétaire de A, un membre (VIEWER) de A, un propriétaire de B, et un compte
// qui possède C et est membre de A (photo lue hors de la cave courante).
const describeIfInfra = process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

interface Zone { id: string; name: string; indication: string | null; hasPhoto: boolean; sortOrder: number; grid: { rows: number; cols: number } | null; cellNames: Record<string, string> }

describeIfInfra('zones de la cave (HTTP)', () => {
  let app: INestApplication;
  let sessionRedis: { quit: () => Promise<unknown> };
  let prisma: import('../prisma/prisma.service').PrismaService;
  const run = randomUUID().slice(0, 8);
  const storage = mkdtempSync(join(tmpdir(), 'cave-zones-e2e-'));
  const userIds: string[] = [];
  const caveIds: string[] = [];
  let caveA: string;
  let caveC: string;
  let ownerA: supertest.Agent;
  let viewerA: supertest.Agent;
  let ownerB: supertest.Agent;
  let switcher: supertest.Agent;

  const expectStatus = (res: supertest.Response, status: number, message: string) => {
    expect({ status: res.status, message: res.body?.message }).toEqual({ status, message });
  };

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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
      const u = await prisma.appUser.create({ data: { email: `zones-${run}-${name}@example.test`, displayName: name } });
      userIds.push(u.id);
      return u;
    };
    const [uOwnerA, uViewerA, uOwnerB, uSwitcher] = [await user('owner-a'), await user('viewer-a'), await user('owner-b'), await user('switcher')];
    caveA = (await createTestCave(prisma, { owner: uOwnerA, name: `Zones A ${run}` })).id;
    const caveB = (await createTestCave(prisma, { owner: uOwnerB, name: `Zones B ${run}` })).id;
    caveC = (await createTestCave(prisma, { owner: uSwitcher, name: `Zones C ${run}` })).id;
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

  const zones = async (agent: supertest.Agent = ownerA): Promise<Zone[]> => (await agent.get('/api/caves/current/zones')).body;
  const create = (name: string, indication?: string | null, agent: supertest.Agent = ownerA) =>
    agent.post('/api/caves/current/zones').send({ name, ...(indication !== undefined ? { indication } : {}) });
  const newZone = async (name: string, indication?: string): Promise<Zone> => {
    const res = await create(name, indication);
    expect(res.status).toBe(201);
    return res.body;
  };
  /** Entrée de `quantity` bouteilles d'un nouveau vin, rangée à `location`. */
  const entry = async (location: unknown, quantity = 2, producer = `Domaine Zones ${run} ${randomUUID().slice(0, 6)}`) => {
    const res = await ownerA.post('/api/movements').send({
      idempotencyKey: randomUUID(), quantity, location, wine: { producer, appellationRaw: 'Bandol', vintage: 2015, color: 'ROUGE', formatCl: 75 },
    });
    return res;
  };
  const wine = (id: string) => ownerA.get(`/api/wines/${id}`);

  describe('liste, création et validation', () => {
    it('crée une zone en fin de liste, avec ou sans indication ; le membre lit la liste mais ne crée rien', async () => {
      const a = await newZone(`Liste ${run} 1`, '  à gauche en entrant  ');
      const b = await newZone(`Liste ${run} 2`);
      expect(a).toEqual({ id: expect.any(String), name: `Liste ${run} 1`, indication: 'à gauche en entrant', hasPhoto: false, sortOrder: expect.any(Number), marker: null, grid: null, cellNames: {} });
      expect(b.indication).toBeNull();
      expect(b.sortOrder).toBe(a.sortOrder + 1);
      const listed = await zones(viewerA);
      expect(listed.map((z) => z.id)).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(listed.findIndex((z) => z.id === a.id)).toBeLessThan(listed.findIndex((z) => z.id === b.id));
      expect(Object.keys(listed[0]).sort()).toEqual(['cellNames', 'grid', 'hasPhoto', 'id', 'indication', 'marker', 'name', 'sortOrder']);
      expectStatus(await create('Interdite', undefined, viewerA), 403, 'Lecture seule');
      expect((await zones()).some((z) => z.name === 'Interdite')).toBe(false);
    });

    it('400 aux messages de la spec : nom de 1 à 40 caractères, indication de 300 au plus', async () => {
      const name = 'Le nom de la zone doit faire de 1 à 40 caractères';
      expectStatus(await ownerA.post('/api/caves/current/zones').send({}), 400, name);
      expectStatus(await create('   '), 400, name);
      expectStatus(await create('a'.repeat(41)), 400, name);
      expectStatus(await create('Ind', 'x'.repeat(301)), 400, 'L\'indication fait 300 caractères au plus');
      expect((await create(` ${'b'.repeat(40)} `, 'x'.repeat(300))).status).toBe(201);
    });

    it('409 « Une zone porte déjà ce nom », sans tenir compte de la casse ni des espaces ; une autre cave peut le prendre', async () => {
      await newZone(`Unique ${run}`);
      expectStatus(await create(`  UNIQUE ${run} `), 409, 'Une zone porte déjà ce nom');
      expect((await create(`Unique ${run}`, undefined, ownerB)).status).toBe(201);
      const other = await newZone(`Autre ${run}`);
      expectStatus(await ownerA.patch(`/api/caves/current/zones/${other.id}`).send({ name: `unique ${run}` }), 409, 'Une zone porte déjà ce nom');
    });

    it('modifie le nom et l’indication (vide = effacée) ; zone d’une autre cave ou inconnue : 404 « Zone introuvable »', async () => {
      const z = await newZone(`Modif ${run}`, 'Au fond');
      const res = await ownerA.patch(`/api/caves/current/zones/${z.id}`).send({ name: `Modifiée ${run}`, indication: '' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: z.id, name: `Modifiée ${run}`, indication: null });
      const kept = await ownerA.patch(`/api/caves/current/zones/${z.id}`).send({ indication: 'Sous l’escalier' });
      expect(kept.body).toMatchObject({ name: `Modifiée ${run}`, indication: 'Sous l’escalier' });
      expectStatus(await ownerA.patch(`/api/caves/current/zones/${z.id}`).send({ name: '' }), 400, 'Le nom de la zone doit faire de 1 à 40 caractères');
      expectStatus(await ownerB.patch(`/api/caves/current/zones/${z.id}`).send({ name: 'Volée' }), 404, 'Zone introuvable');
      expectStatus(await ownerB.delete(`/api/caves/current/zones/${z.id}`), 404, 'Zone introuvable');
      expectStatus(await ownerA.patch(`/api/caves/current/zones/${randomUUID()}`).send({ name: 'X' }), 404, 'Zone introuvable');
      expectStatus(await ownerA.patch('/api/caves/current/zones/pas-un-uuid').send({ name: 'X' }), 404, 'Zone introuvable');
      expect((await zones()).find((x) => x.id === z.id)?.name).toBe(`Modifiée ${run}`);
    });
  });

  describe('grille de cases', () => {
    const patch = (id: string, body: unknown, agent: supertest.Agent = ownerA) => agent.patch(`/api/caves/current/zones/${id}`).send(body as object);

    it('PATCH `grid` pose, change puis retire la grille ; les autres champs ne bougent pas', async () => {
      const z = await newZone(`Grille ${run}`, 'Au mur');
      const res = await patch(z.id, { grid: { rows: 6, cols: 4 } });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: z.id, name: `Grille ${run}`, indication: 'Au mur', grid: { rows: 6, cols: 4 } });
      expect((await patch(z.id, { name: `Grille ${run} bis` })).body.grid).toEqual({ rows: 6, cols: 4 });
      expect((await patch(z.id, { grid: { rows: 26, cols: 30 } })).body.grid).toEqual({ rows: 26, cols: 30 });
      expect((await zones(viewerA)).find((x) => x.id === z.id)?.grid).toEqual({ rows: 26, cols: 30 });
      const cleared = await patch(z.id, { grid: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body).toMatchObject({ name: `Grille ${run} bis`, indication: 'Au mur', grid: null });
    });

    it('400 hors bornes (1 à 26 lignes, 1 à 30 colonnes) ; membre : 403 ; autre cave : 404 ; la grille ne change pas', async () => {
      const z = await newZone(`Grille bornes ${run}`);
      expect((await patch(z.id, { grid: { rows: 2, cols: 3 } })).status).toBe(200);
      for (const grid of [{ rows: 0, cols: 4 }, { rows: 27, cols: 4 }, { rows: 6, cols: 0 }, { rows: 6, cols: 31 }, { rows: 1.5, cols: 4 }, { rows: 6 }, 'A1', {}]) {
        expectStatus(await patch(z.id, { grid }), 400, 'La grille fait de 1 à 26 lignes et de 1 à 30 colonnes');
      }
      expectStatus(await patch(z.id, { grid: null }, viewerA), 403, 'Lecture seule');
      expectStatus(await patch(z.id, { grid: null }, ownerB), 404, 'Zone introuvable');
      expect((await zones()).find((x) => x.id === z.id)?.grid).toEqual({ rows: 2, cols: 3 });
    });
  });

  describe('noms des cases', () => {
    const patch = (id: string, body: unknown, agent: supertest.Agent = ownerA) => agent.patch(`/api/caves/current/zones/${id}`).send(body as object);

    it('PATCH `cellNames` remplace les noms (codes en majuscules, vide = sans nom) ; le membre les lit, ne les change pas', async () => {
      const z = await newZone(`Noms ${run}`);
      expect((await patch(z.id, { grid: { rows: 3, cols: 4 } })).body.cellNames).toEqual({});
      const res = await patch(z.id, { cellNames: { b3: ' Champagnes ', A1: 'Bordeaux', C4: '' } });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ grid: { rows: 3, cols: 4 }, cellNames: { B3: 'Champagnes', A1: 'Bordeaux' } });
      expect((await patch(z.id, { cellNames: { B3: 'Champagnes' } })).body.cellNames).toEqual({ B3: 'Champagnes' });
      expect((await patch(z.id, { name: `Noms ${run} bis` })).body.cellNames).toEqual({ B3: 'Champagnes' });
      expect((await zones(viewerA)).find((x) => x.id === z.id)?.cellNames).toEqual({ B3: 'Champagnes' });
      expectStatus(await patch(z.id, { cellNames: {} }, viewerA), 403, 'Lecture seule');
      expectStatus(await patch(z.id, { cellNames: {} }, ownerB), 404, 'Zone introuvable');
    });

    it('400 : case hors grille, nom déjà pris (casse ignorée) ou égal au code d’une autre case, nom trop long ; rien ne change', async () => {
      const z = await newZone(`Noms refus ${run}`);
      await patch(z.id, { grid: { rows: 2, cols: 2 }, cellNames: { A1: 'Loire' } });
      expectStatus(await patch(z.id, { cellNames: { C1: 'X' } }), 400, 'Case inconnue dans cette zone');
      expectStatus(await patch(z.id, { cellNames: { A1: 'Loire', B2: 'LOIRE' } }), 400, 'Ce nom est déjà pris dans cette zone');
      expectStatus(await patch(z.id, { cellNames: { A1: 'b2' } }), 400, 'Ce nom est déjà pris dans cette zone');
      expectStatus(await patch(z.id, { cellNames: { A1: 'x'.repeat(41) } }), 400, 'Le nom d\'une case fait 40 caractères au plus');
      // Grille retirée et noms dans la même demande : les noms visent la nouvelle grille.
      expectStatus(await patch(z.id, { grid: null, cellNames: { A1: 'Loire' } }), 400, 'Case inconnue dans cette zone');
      expect((await zones()).find((x) => x.id === z.id)).toMatchObject({ grid: { rows: 2, cols: 2 }, cellNames: { A1: 'Loire' } });
    });

    it('réduire la grille supprime les noms des cases disparues ; la retirer, tous', async () => {
      const z = await newZone(`Noms grille ${run}`);
      await patch(z.id, { grid: { rows: 3, cols: 3 }, cellNames: { A1: 'Bordeaux', C3: 'Champagnes' } });
      expect((await patch(z.id, { grid: { rows: 2, cols: 3 } })).body.cellNames).toEqual({ A1: 'Bordeaux' });
      expect((await patch(z.id, { grid: null })).body.cellNames).toEqual({});
    });

    it('libellé « Nom (code) » partout ; « Champagnes » saisi dans casier désigne la case B3', async () => {
      const z = await newZone(`Noms libellé ${run}`);
      await patch(z.id, { grid: { rows: 3, cols: 4 }, cellNames: { B3: 'Champagnes' } });
      const res = await entry({ zoneId: z.id, casier: 'b3', position: '2' }, 2);
      const wineId = res.body.wine.id;
      const year = new Date().getFullYear();
      expect((await ownerA.put(`/api/wines/${wineId}/apogee`).send({ min: year - 5, max: year })).status).toBe(200);
      const label = `Noms libellé ${run} / Champagnes (B3) / 2`;
      const detail = (await wine(wineId)).body;
      expect(detail.locations).toEqual([{ id: expect.any(String), label, quantity: 2, zoneId: z.id }]);
      expect(detail.movements[0].locationLabel).toBe(label);
      const journal = (await ownerA.get('/api/movements/recent?limit=100')).body;
      expect(journal.find((m: { wine: { id: string } }) => m.wine.id === wineId).locationLabel).toBe(label);
      const listed = (await ownerA.get('/api/locations')).body.find((l: { id: string }) => l.id === detail.locations[0].id);
      expect(listed).toEqual({ id: detail.locations[0].id, zoneId: z.id, zone: `Noms libellé ${run}`, casier: 'b3', position: '2', label, lastUsed: true });
      const soon = (await ownerA.get('/api/cave?drinkSoon=true')).body.find((w: { id: string }) => w.id === wineId);
      expect(soon.places[0].label).toBe(label);

      // Saisie par le nom : même emplacement, enregistré sous le code.
      const byName = await entry({ zoneId: z.id, casier: ' champagnes ', position: '2' }, 1);
      expect((await wine(byName.body.wine.id)).body.locations[0]).toMatchObject({ id: detail.locations[0].id, label });
      const fresh = await entry({ zoneId: z.id, casier: 'Champagnes' }, 1);
      const loc = await prisma.location.findFirst({ where: { zoneId: z.id, position: null } });
      expect(loc?.casier).toBe('B3');
      expect((await wine(fresh.body.wine.id)).body.locations[0].label).toBe(`Noms libellé ${run} / Champagnes (B3)`);
      // Les cases occupées restent comptées par code.
      expect((await ownerA.get(`/api/caves/current/zones/${z.id}/cells`)).body).toEqual([{ casier: 'B3', quantity: 4 }]);

      const xlsx = await ownerA.get('/api/export.xlsx').buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- voir export.service.spec
      await wb.xlsx.load(xlsx.body as any);
      const stock = wb.getWorksheet('Stock')!;
      const col = (stock.getRow(1).values as unknown[]).slice(1).indexOf('Emplacements') + 1;
      const cells: unknown[] = [];
      stock.eachRow((row) => cells.push(row.getCell(col).value));
      expect(cells).toContain(`${label} × 2`);
    });
  });

  describe('cases occupées', () => {
    it('stock > 0 par casier (non vide, casse ignorée, en majuscules) de la zone, lu par le membre ; autre cave ou inconnue : 404 « Zone introuvable »', async () => {
      const z = await newZone(`Cases ${run}`);
      const other = await newZone(`Cases autre ${run}`);
      expect((await entry({ zoneId: z.id, casier: 'b3' }, 1)).status).toBe(201);
      expect((await entry({ zoneId: z.id, casier: 'B3', position: 'fond' }, 1)).status).toBe(201);
      expect((await entry({ zoneId: z.id, position: 'haut' }, 4)).status).toBe(201);
      expect((await entry({ zoneId: other.id, casier: 'A1' }, 3)).status).toBe(201);
      // A1 vidé par un déplacement : plus de stock, absent.
      const a1 = await entry({ zoneId: z.id, casier: 'A1' }, 1);
      const from = (await wine(a1.body.wine.id)).body.locations[0].id;
      expect((await ownerA.post(`/api/wines/${a1.body.wine.id}/move`).send({ from, to: { zoneId: other.id, casier: 'C2' }, quantity: 1 })).status).toBe(201);
      for (const agent of [ownerA, viewerA]) {
        const res = await agent.get(`/api/caves/current/zones/${z.id}/cells`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ casier: 'B3', quantity: 2 }]);
      }
      expect((await ownerA.get(`/api/caves/current/zones/${other.id}/cells`)).body).toEqual([{ casier: 'A1', quantity: 3 }, { casier: 'C2', quantity: 1 }]);
      for (const id of [randomUUID(), 'pas-un-uuid']) expectStatus(await ownerA.get(`/api/caves/current/zones/${id}/cells`), 404, 'Zone introuvable');
      expectStatus(await ownerB.get(`/api/caves/current/zones/${z.id}/cells`), 404, 'Zone introuvable');
    });
  });

  describe('ordre d’affichage', () => {
    it('POST order : les zones données dans cet ordre, puis les autres dans leur ordre actuel', async () => {
      const ids = (await zones()).map((z) => z.id);
      const reversed = [...ids].reverse();
      const res = await ownerA.post('/api/caves/current/zones/order').send({ ids: reversed });
      expect(res.status).toBe(200);
      expect(res.body.map((z: Zone) => z.id)).toEqual(reversed);
      expect(res.body.map((z: Zone) => z.sortOrder)).toEqual(reversed.map((_, i) => i));
      expect((await zones(viewerA)).map((z) => z.id)).toEqual(reversed);
      // Une seule zone donnée (« monter » sur un téléphone qui ne connaît pas les dernières) : elle passe en tête.
      const partial = await ownerA.post('/api/caves/current/zones/order').send({ ids: [ids[0]] });
      expect(partial.body.map((z: Zone) => z.id)).toEqual([ids[0], ...reversed.filter((id) => id !== ids[0])]);
    });

    it('zone inconnue ou d’une autre cave : 404, rien ne change ; liste mal formée : 400 ; membre : 403', async () => {
      const before = (await zones()).map((z) => z.id);
      const foreign = (await ownerB.get('/api/caves/current/zones')).body[0].id;
      expectStatus(await ownerA.post('/api/caves/current/zones/order').send({ ids: [foreign, ...before] }), 404, 'Zone introuvable');
      expectStatus(await ownerA.post('/api/caves/current/zones/order').send({ ids: [before[0], before[0]] }), 400, 'Ordre des zones invalide');
      expectStatus(await ownerA.post('/api/caves/current/zones/order').send({ ids: 'x' }), 400, 'Ordre des zones invalide');
      expectStatus(await viewerA.post('/api/caves/current/zones/order').send({ ids: before }), 403, 'Lecture seule');
      expect((await zones()).map((z) => z.id)).toEqual(before);
    });
  });

  describe('saisie d’un emplacement', () => {
    it('zoneId d’une zone de la cave : l’emplacement porte la zone, libellé « zone / casier » et zoneId dans les endroits', async () => {
      const z = await newZone(`Saisie ${run}`);
      const res = await entry({ zoneId: z.id, casier: 'B' });
      expect(res.status).toBe(201);
      const detail = await wine(res.body.wine.id);
      expect(detail.body.locations).toEqual([{ id: expect.any(String), label: `Saisie ${run} / B`, quantity: 2, zoneId: z.id }]);
      const listed = (await ownerA.get('/api/locations')).body.find((l: { id: string }) => l.id === detail.body.locations[0].id);
      expect(listed).toMatchObject({ zoneId: z.id, zone: `Saisie ${run}`, casier: 'B', position: null, label: `Saisie ${run} / B`, lastUsed: true });
      // Même zone, casier en minuscules : même emplacement.
      const again = await entry({ zoneId: z.id, casier: 'b' });
      expect((await wine(again.body.wine.id)).body.locations[0].id).toBe(detail.body.locations[0].id);
      // Sans zone : casier seul.
      const loose = await entry({ zoneId: null, casier: `Libre ${run}` });
      expect((await wine(loose.body.wine.id)).body.locations).toEqual([expect.objectContaining({ label: `Libre ${run}`, zoneId: null })]);
    });

    it('zoneId d’une autre cave ou inconnu : 404 « Zone introuvable », aucun vin ni mouvement créé ; vide : 400', async () => {
      const foreign = (await ownerB.get('/api/caves/current/zones')).body[0].id;
      const producer = `Domaine Zones ${run} refusé`;
      for (const zoneId of [foreign, randomUUID()]) expectStatus(await entry({ zoneId }, 1, producer), 404, 'Zone introuvable');
      expect(await prisma.wine.count({ where: { producer } })).toBe(0);
      expectStatus(await entry({ zoneId: null, casier: ' ' }), 400, 'Indiquez au moins une zone, un casier ou une position');
      expectStatus(await entry({ zoneId: 'pas-un-uuid' }), 400, 'Emplacement invalide');
    });

    it('ancien client (`zone` en texte) : la zone de même nom (casse et espaces ignorés), sinon une nouvelle en fin de liste', async () => {
      const z = await newZone(`Ancienne ${run}`);
      const same = await entry({ zone: `  ancienne ${run} `, position: '4' });
      expect(same.status).toBe(201);
      expect((await wine(same.body.wine.id)).body.locations[0]).toMatchObject({ label: `Ancienne ${run} / 4`, zoneId: z.id });
      const fresh = await entry({ zone: `Inédite ${run}` });
      expect(fresh.status).toBe(201);
      const listed = await zones();
      expect(listed[listed.length - 1]).toMatchObject({ name: `Inédite ${run}`, indication: null, hasPhoto: false });
      expect((await wine(fresh.body.wine.id)).body.locations[0]).toMatchObject({ label: `Inédite ${run}`, zoneId: listed[listed.length - 1].id });
    });

    it('déplacement et hausse d’inventaire vers une zone choisie', async () => {
      const z = await newZone(`Destination ${run}`);
      const res = await entry(null, 3);
      const wineId = res.body.wine.id;
      const moved = await ownerA.post(`/api/wines/${wineId}/move`).send({ from: null, to: { zoneId: z.id, casier: 'H' }, quantity: 1 });
      expect(moved.status).toBe(201);
      expect(moved.body.locations).toEqual(expect.arrayContaining([expect.objectContaining({ label: `Destination ${run} / H`, quantity: 1, zoneId: z.id })]));
      const counted = await ownerA.post(`/api/wines/${wineId}/inventory`).send({ idempotencyKey: randomUUID(), counted: 5, location: { zoneId: z.id, position: '9' } });
      expect(counted.status).toBe(201);
      expect((await wine(wineId)).body.locations).toEqual(expect.arrayContaining([expect.objectContaining({ label: `Destination ${run} / 9`, quantity: 2, zoneId: z.id })]));
      expectStatus(
        await ownerA.post(`/api/wines/${wineId}/inventory`).send({ idempotencyKey: randomUUID(), counted: 6, locationId: null, location: { zoneId: z.id } }),
        400, 'Emplacement invalide',
      );
    });
  });

  describe('renommer : le nouveau nom vaut partout', () => {
    it('fiche, journal, emplacements, filtre de la cave, à boire prochainement et export', async () => {
      const z = await newZone(`Avant ${run}`);
      const res = await entry({ zoneId: z.id, casier: 'R' }, 2);
      const wineId = res.body.wine.id;
      const year = new Date().getFullYear();
      expect((await ownerA.put(`/api/wines/${wineId}/apogee`).send({ min: year - 5, max: year })).status).toBe(200);
      expect((await ownerA.patch(`/api/caves/current/zones/${z.id}`).send({ name: `Après ${run}` })).status).toBe(200);
      const label = `Après ${run} / R`;

      const detail = (await wine(wineId)).body;
      expect(detail.locations[0].label).toBe(label);
      expect(detail.movements.find((m: { type: string }) => m.type === 'IN').locationLabel).toBe(label);
      const journal = (await ownerA.get('/api/movements/recent?limit=100')).body;
      expect(journal.find((m: { wine: { id: string } }) => m.wine.id === wineId).locationLabel).toBe(label);
      const location = (await ownerA.get('/api/locations')).body.find((l: { id: string }) => l.id === detail.locations[0].id);
      expect(location.label).toBe(label);
      const filtered = (await ownerA.get(`/api/cave?location=${location.id}`)).body;
      expect(filtered.map((w: { id: string }) => w.id)).toEqual([wineId]);
      const soon = (await ownerA.get('/api/cave?drinkSoon=true')).body.find((w: { id: string }) => w.id === wineId);
      expect(soon.places).toEqual([{ id: location.id, label, quantity: 2, zoneId: z.id }]);
      // Le membre voit le même libellé.
      expect((await viewerA.get(`/api/wines/${wineId}`)).body.locations[0].label).toBe(label);

      const xlsx = await ownerA.get('/api/export.xlsx').buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- voir export.service.spec
      await wb.xlsx.load(xlsx.body as any);
      const stock = wb.getWorksheet('Stock')!;
      const header = (stock.getRow(1).values as unknown[]).slice(1);
      const col = header.indexOf('Emplacements') + 1;
      const cells: unknown[] = [];
      stock.eachRow((row) => cells.push(row.getCell(col).value));
      expect(cells).toContain(`${label} × 2`);
    });
  });

  describe('supprimer', () => {
    it('avec des bouteilles : chacune passe sans zone (même casier, même position) par un déplacement, la zone est archivée', async () => {
      const z = await newZone(`Garage ${run}`);
      const first = (await entry({ zoneId: z.id, casier: '3', position: '2' }, 4)).body.wine.id;
      const second = (await entry({ zoneId: z.id }, 2)).body.wine.id;
      // Une partie de second ailleurs : seule celle de la zone bouge.
      expect((await ownerA.post(`/api/wines/${second}/move`).send({ from: (await wine(second)).body.locations[0].id, to: { casier: `Ailleurs ${run}` }, quantity: 1 })).status).toBe(201);
      const before = await prisma.movement.count({ where: { wineId: { in: [first, second] } } });
      const deletedAt = new Date();

      const res = await ownerA.delete(`/api/caves/current/zones/${z.id}`);
      expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { archived: true, unplaced: 5 } });

      expect((await wine(first)).body.wine.quantity).toBe(4);
      expect((await wine(second)).body.wine.quantity).toBe(2);
      const firstPlaces = (await wine(first)).body.locations;
      expect(firstPlaces).toEqual([expect.objectContaining({ zoneId: null, label: '3 / 2', quantity: 4 })]);
      // Ni casier ni position : « Sans emplacement ».
      expect((await wine(second)).body.locations).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: null, quantity: 1 }), expect.objectContaining({ label: `Ailleurs ${run}`, quantity: 1 }),
      ]));
      const moves = await prisma.movement.findMany({ where: { wineId: { in: [first, second] }, type: 'MOVE' }, orderBy: { idempotencyKey: 'asc' } });
      expect(await prisma.movement.count({ where: { wineId: { in: [first, second] } } })).toBe(before + 4);
      // Les deux paires de la suppression : la moitié « depuis » part d'un emplacement de la zone.
      const fromZone = moves.filter((m) => m.delta < 0 && m.idempotencyKey.endsWith(':from') && m.occurredAt >= deletedAt);
      const zonePlaces = (await prisma.location.findMany({ where: { zoneId: z.id }, select: { id: true } })).map((l) => l.id);
      expect(fromZone.map((m) => zonePlaces.includes(m.locationId!))).toEqual([true, true]);
      for (const m of fromZone) expect(moves.some((o) => o.idempotencyKey === m.idempotencyKey.replace(/:from$/, ':to') && o.delta === -m.delta)).toBe(true);
      expect((await zones()).some((x) => x.id === z.id)).toBe(false);

      // Annuler le déplacement de first : les bouteilles reviennent dans la zone, rétablie.
      const half = (await wine(first)).body.movements.find((m: { type: string; delta: number }) => m.type === 'MOVE' && m.delta > 0);
      expect((await ownerA.post(`/api/movements/${half.id}/cancel`).send({ idempotencyKey: randomUUID() })).status).toBe(201);
      expect((await zones()).some((x) => x.id === z.id)).toBe(true);
      expect((await wine(first)).body.locations).toEqual([expect.objectContaining({ zoneId: z.id, label: `Garage ${run} / 3 / 2`, quantity: 4 })]);
    });

    it('archivée si elle a servi : hors des listes, l’historique garde son libellé, le nom se libère', async () => {
      const z = await newZone(`Historique ${run}`);
      const res = await entry({ zoneId: z.id }, 1);
      const wineId = res.body.wine.id;
      const [place] = (await wine(wineId)).body.locations;
      expectStatus(await viewerA.delete(`/api/caves/current/zones/${z.id}`), 403, 'Lecture seule');

      expect((await ownerA.post('/api/movements/out').send({ idempotencyKey: randomUUID(), wineId, quantity: 1, locationId: place.id })).status).toBe(201);
      expect((await ownerA.delete(`/api/caves/current/zones/${z.id}`)).body).toEqual({ archived: true, unplaced: 0 });

      expect(await prisma.caveZone.findUnique({ where: { id: z.id } })).toMatchObject({ archivedAt: expect.any(Date) });
      expect((await zones()).some((x) => x.id === z.id)).toBe(false);
      expect((await ownerA.get('/api/locations')).body.some((l: { id: string }) => l.id === place.id)).toBe(false);
      const history = (await wine(wineId)).body.movements;
      expect(history.map((m: { locationLabel: string | null }) => m.locationLabel)).toEqual([`Historique ${run}`, `Historique ${run}`]);
      // Plus de saisie dans une zone archivée ; son nom sert à une nouvelle zone.
      expectStatus(await entry({ zoneId: z.id }), 404, 'Zone introuvable');
      expectStatus(await ownerA.patch(`/api/caves/current/zones/${z.id}`).send({ name: 'X' }), 404, 'Zone introuvable');
      expectStatus(await ownerA.delete(`/api/caves/current/zones/${z.id}`), 404, 'Zone introuvable');
      const reused = await create(`historique ${run}`);
      expect(reused.status).toBe(201);
      expect(reused.body.id).not.toBe(z.id);
    });

    /** Zone `name` archivée : une bouteille entrée puis sortie (rien n'y reste), puis « Supprimer ». */
    async function archivedWithExit(name: string) {
      const z = await newZone(name);
      const wineId = (await entry({ zoneId: z.id }, 1)).body.wine.id;
      const [place] = (await wine(wineId)).body.locations;
      const exit = await ownerA.post('/api/movements/out').send({ idempotencyKey: randomUUID(), wineId, quantity: 1, locationId: place.id });
      expect(exit.status).toBe(201);
      expect((await ownerA.delete(`/api/caves/current/zones/${z.id}`)).body).toEqual({ archived: true, unplaced: 0 });
      return { z, wineId, place, exitId: exit.body.movement.id as string };
    }

    it('annuler une sortie d’une zone archivée la rétablit, en fin de liste, avec la bouteille', async () => {
      const { z, wineId, place, exitId } = await archivedWithExit(`Rétablie ${run}`);
      const cancel = await ownerA.post(`/api/movements/${exitId}/cancel`).send({ idempotencyKey: randomUUID() });
      expect(cancel.status).toBe(201);
      const listed = await zones();
      expect(listed[listed.length - 1]).toMatchObject({ id: z.id, name: `Rétablie ${run}` });
      expect((await wine(wineId)).body.locations).toEqual([expect.objectContaining({ id: place.id, quantity: 1, zoneId: z.id })]);
    });

    it('hausse d’inventaire vers un emplacement d’une zone archivée : la zone est rétablie', async () => {
      const { z, wineId, place } = await archivedWithExit(`Inventaire ${run}`);
      const counted = await ownerA.post(`/api/wines/${wineId}/inventory`).send({ idempotencyKey: randomUUID(), counted: 2, locationId: place.id });
      expect(counted.status).toBe(201);
      expect((await zones()).some((x) => x.id === z.id)).toBe(true);
    });

    it('zone archivée dont le nom a été repris : 409, rien n’est écrit, elle reste archivée', async () => {
      const { z, wineId, place, exitId } = await archivedWithExit(`Reprise ${run}`);
      await newZone(`REPRISE ${run}`);
      const refused = 'Cette zone a été supprimée ; rangez ces bouteilles ailleurs';
      const count = await prisma.movement.count({ where: { wineId } });
      expectStatus(await ownerA.post(`/api/movements/${exitId}/cancel`).send({ idempotencyKey: randomUUID() }), 409, refused);
      expectStatus(await ownerA.post(`/api/wines/${wineId}/inventory`).send({ idempotencyKey: randomUUID(), counted: 1, locationId: place.id }), 409, refused);
      expect(await prisma.movement.count({ where: { wineId } })).toBe(count);
      expect((await prisma.caveZone.findUniqueOrThrow({ where: { id: z.id } })).archivedAt).not.toBeNull();
      // Un déplacement ne vise qu'une zone active.
      expectStatus(await ownerA.post(`/api/wines/${wineId}/move`).send({ from: null, to: { zoneId: z.id }, quantity: 1 }), 404, 'Zone introuvable');
    });

    it('annulation et suppression simultanées : jamais de bouteille dans une zone archivée', async () => {
      for (let i = 0; i < 5; i++) {
        const z = await newZone(`Course ${run} ${i}`);
        const wineId = (await entry({ zoneId: z.id }, 1)).body.wine.id;
        const [place] = (await wine(wineId)).body.locations;
        const exit = (await ownerA.post('/api/movements/out').send({ idempotencyKey: randomUUID(), wineId, quantity: 1, locationId: place.id })).body.movement.id;
        const [cancel, del] = await Promise.all([
          ownerA.post(`/api/movements/${exit}/cancel`).send({ idempotencyKey: randomUUID() }),
          ownerA.delete(`/api/caves/current/zones/${z.id}`),
        ]);
        expect(cancel.status).toBe(201);
        expect(del.status).toBe(200);
        const zone = await prisma.caveZone.findUniqueOrThrow({ where: { id: z.id } });
        const stock = (await wine(wineId)).body.locations.find((p: { id: string }) => p.id === place.id)?.quantity ?? 0;
        // Annulation d'abord : la suppression déplace la bouteille hors de la zone ; sinon l'annulation rétablit la zone.
        expect([{ archived: false, stock: 1 }, { archived: true, stock: 0 }]).toContainEqual({ archived: zone.archivedAt != null, stock });
        expect((await wine(wineId)).body.wine.quantity).toBe(1);
      }
    });

    it('jamais utilisée : supprimée de la base, avec sa photo', async () => {
      const z = await newZone(`Jamais ${run}`);
      const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#123456' } }).png().toBuffer();
      expect((await ownerA.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', png, { filename: 'z.png', contentType: 'image/png' })).status).toBe(200);
      expect(existsSync(join(storage, 'zones', `${z.id}.jpg`))).toBe(true);
      expect((await ownerA.delete(`/api/caves/current/zones/${z.id}`)).body).toEqual({ archived: false, unplaced: 0 });
      expect(await prisma.caveZone.findUnique({ where: { id: z.id } })).toBeNull();
      expect(existsSync(join(storage, 'zones', `${z.id}.jpg`))).toBe(false);
    });
  });

  describe('photo', () => {
    it('l’envoi est limité comme celui d’une photo d’étiquette (ThrottlerGuard)', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', CurrentCaveZonesController.prototype.setPhoto) ?? [];
      expect(guards).toContain(ThrottlerGuard);
    });

    it('le propriétaire la pose (JPEG de 1600 px au plus), le membre la lit, même hors de sa cave courante ; 404 pour un étranger', async () => {
      const z = await newZone(`Photo ${run}`);
      const big = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#a0b0c0' } }).png().toBuffer();
      expectStatus(await viewerA.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', big, { filename: 'z.png', contentType: 'image/png' }), 403, 'Lecture seule');
      const put = await ownerA.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', big, { filename: 'z.png', contentType: 'image/png' });
      expect(put.status).toBe(200);
      expect(put.body).toMatchObject({ id: z.id, hasPhoto: true });
      const meta = await sharp(join(storage, 'zones', `${z.id}.jpg`)).metadata();
      expect(meta).toMatchObject({ format: 'jpeg', width: 1600, height: 800 });
      expect((await zones(viewerA)).find((x) => x.id === z.id)?.hasPhoto).toBe(true);

      for (const agent of [ownerA, viewerA]) {
        const img = await agent.get(`/api/caves/zones/${z.id}/photo`);
        expect(img.status).toBe(200);
        expect(img.headers['content-type']).toBe('image/jpeg');
      }
      for (const caveId of [caveA, caveC]) {
        expect((await switcher.put('/api/auth/current-cave').send({ caveId })).status).toBe(200);
        expect((await switcher.get(`/api/caves/zones/${z.id}/photo`)).status).toBe(200);
      }
      expectStatus(await ownerB.get(`/api/caves/zones/${z.id}/photo`), 404, 'Zone introuvable');
      expectStatus(await ownerB.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', big, { filename: 'z.png', contentType: 'image/png' }), 404, 'Zone introuvable');

      expectStatus(await ownerA.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', Buffer.from('pas une image'), { filename: 'z.jpg', contentType: 'image/jpeg' }), 400, 'Image illisible ou format non pris en charge');
      expectStatus(await ownerA.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', Buffer.from('x'), { filename: 'z.gif', contentType: 'image/gif' }), 400, 'Format d’image non pris en charge');
      expectStatus(await ownerA.put(`/api/caves/current/zones/${z.id}/photo`), 400, 'Fichier « file » manquant');

      // Au-delà de 15 Mo : 413 en français.
      const huge = Buffer.alloc(15 * 1024 * 1024 + 1);
      expectStatus(await ownerA.put(`/api/caves/current/zones/${z.id}/photo`).attach('file', huge, { filename: 'z.jpg', contentType: 'image/jpeg' }), 413, 'Photo trop lourde (15 Mo au plus)');

      const removed = await ownerA.delete(`/api/caves/current/zones/${z.id}/photo`);
      expect(removed.status).toBe(200);
      expect(removed.body.hasPhoto).toBe(false);
      expect(existsSync(join(storage, 'zones', `${z.id}.jpg`))).toBe(false);
      expectStatus(await viewerA.get(`/api/caves/zones/${z.id}/photo`), 404, 'Photo introuvable');
    });
  });
});
