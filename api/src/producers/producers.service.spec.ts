import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProducersController } from './producers.controller';
import { ProducerScheduler, ProducersService } from './producers.service';

const KEY = 'domaine tempier';
const wines = [{ producer: 'Domaine Tempier', appellationRaw: 'Bandol', appellation: null }];
const include = { updatedBy: { select: { displayName: true, email: true } } };

const conflict = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });

function harness(opts: { wines?: unknown[]; saved?: unknown; existing?: unknown; conflictOnce?: boolean } = {}) {
  let conflicts = opts.conflictOnce ? 1 : 0;
  const upsert = jest.fn(async () => {
    if (conflicts-- > 0) throw conflict();
    return opts.saved ?? {
      producerKey: KEY, displayName: 'Domaine Tempier', status: 'DONE', description: null, source: 'GEMINI',
      histoire: 'Texte', terroir: null, cepages: null, style: null, nez: null, manualFields: ['histoire'],
      errorMessage: null, generatedAt: null, updatedBy: { displayName: null, email: 'proprietaire@example.com' },
    };
  });
  const findUnique = jest.fn(async () => opts.existing ?? null);
  const prisma = { wine: { findMany: jest.fn(async () => opts.wines ?? wines) }, producerProfile: { upsert, findUnique } };
  return { upsert, findUnique, service: new ProducersService(prisma as any) };
}

const EMPTY = { histoire: null, terroir: null, cepages: null, style: null, nez: null };

/** Faux Prisma de la page : vins de deux caves avec leur stock, une table de profils en mémoire. */
function pageHarness(profiles: any[] = []) {
  const caveWines = [
    { caveId: 'c1', id: 'w1', producer: 'Domaine Tempier', cuvee: 'La Migoua', vintage: 2015, color: 'ROUGE', quantity: 2, referencePhotoId: null },
    { caveId: 'c1', id: 'w2', producer: 'DOMAINE TEMPIER', cuvee: null, vintage: 2019, color: 'ROSE', quantity: 0, referencePhotoId: 'p1' },
    { caveId: 'c1', id: 'w3', producer: 'Trimbach', cuvee: null, vintage: 2020, color: 'BLANC', quantity: 6, referencePhotoId: null },
    { caveId: 'c2', id: 'w4', producer: 'Clos Rougeard', cuvee: null, vintage: 2010, color: 'ROUGE', quantity: 1, referencePhotoId: null },
  ];
  const prisma = {
    // Seuls les vins de la cave demandée (WHERE w.cave_id = …).
    $queryRaw: jest.fn(async (_sql: unknown, ...values: unknown[]) => caveWines.filter((w) => values.includes(w.caveId))),
    producerProfile: {
      findUnique: jest.fn(async ({ where }: any) => profiles.find((p) => p.producerKey === where.producerKey) ?? null),
      createMany: jest.fn(async ({ data }: any) => {
        const fresh = data.filter((d: any) => !profiles.some((p) => p.producerKey === d.producerKey));
        fresh.forEach((d: any) => profiles.push({ status: 'PENDING', source: 'GEMINI', description: null, ...EMPTY, manualFields: [], errorMessage: null, generatedAt: null, updatedBy: null, ...d }));
        return { count: fresh.length };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = profiles.filter((p) => p.producerKey === where.producerKey && p.status !== where.status.not);
        hit.forEach((p) => Object.assign(p, data));
        return { count: hit.length };
      }),
    },
  };
  return { prisma, profiles, service: new ProducersService(prisma as any) };
}

describe('ProducersService.page', () => {
  it('page met le domaine en file une seule fois', async () => {
    const h = pageHarness();
    const first = await h.service.page('c1', KEY, 'VIEWER');
    await h.service.page('c1', KEY, 'VIEWER');
    expect(h.profiles).toHaveLength(1);
    expect(h.profiles[0]).toMatchObject({ producerKey: KEY, status: 'PENDING' });
    expect(h.prisma.producerProfile.createMany).toHaveBeenCalledTimes(1);
    expect(first.profile).toMatchObject({ key: KEY, status: 'PENDING', fields: EMPTY, manualFields: [] });
  });

  it('page renvoie 404 pour une clé absente de la cave', async () => {
    const h = pageHarness();
    await expect(h.service.page('c1', 'clos rougeard', 'VIEWER')).rejects.toThrow(new NotFoundException('Domaine introuvable'));
    expect(h.prisma.producerProfile.createMany).not.toHaveBeenCalled();
  });

  it('liste les vins du domaine dans la cave courante, épuisés compris, sans le producteur', async () => {
    const h = pageHarness();
    const { wines: list } = await h.service.page('c1', KEY, 'VIEWER');
    expect(list).toEqual([
      { id: 'w1', cuvee: 'La Migoua', vintage: 2015, color: 'ROUGE', quantity: 2, referencePhotoId: null },
      { id: 'w2', cuvee: null, vintage: 2019, color: 'ROSE', quantity: 0, referencePhotoId: 'p1' },
    ]);
  });

  it('rend la fiche avec ses cinq champs et ses corrections, sans rien mettre en file', async () => {
    const h = pageHarness([{ producerKey: KEY, displayName: 'Domaine Tempier', status: 'DONE', source: 'GEMINI', description: null, ...EMPTY, histoire: 'Fondé en 1834.', manualFields: ['histoire'], errorMessage: null, generatedAt: null, updatedBy: null }]);
    const { profile } = await h.service.page('c1', KEY, 'VIEWER');
    expect(profile).toMatchObject({ status: 'DONE', fields: { ...EMPTY, histoire: 'Fondé en 1834.' }, manualFields: ['histoire'] });
    expect(h.prisma.producerProfile.createMany).not.toHaveBeenCalled();
    expect(h.prisma.producerProfile.updateMany).not.toHaveBeenCalled();
  });

  it('une fiche terminée sans aucun des cinq champs (ancien format) repasse en attente', async () => {
    const h = pageHarness([{ producerKey: KEY, displayName: 'Domaine Tempier', status: 'DONE', source: 'GEMINI', description: null, ...EMPTY, manualFields: [], errorMessage: null, generatedAt: null, updatedBy: null }]);
    const { profile } = await h.service.page('c1', KEY, 'VIEWER');
    expect(profile).toMatchObject({ status: 'PENDING' });
    expect(h.profiles[0]).toMatchObject({ status: 'PENDING', attempts: 0, nextAttemptAt: null, reservedUntil: null, errorMessage: null });
  });

  it('une fiche en échec reste en échec, quel que soit le nombre d’affichages', async () => {
    const h = pageHarness([{ producerKey: KEY, displayName: 'Domaine Tempier', status: 'FAILED', source: 'GEMINI', description: null, ...EMPTY, manualFields: [], errorMessage: 'x', generatedAt: null, updatedBy: null }]);
    await h.service.page('c1', KEY, 'VIEWER');
    const { profile } = await h.service.page('c1', KEY, 'VIEWER');
    expect(profile).toMatchObject({ status: 'FAILED' });
    expect(h.prisma.producerProfile.updateMany).not.toHaveBeenCalled();
  });

  it('un domaine inconnu de Gemini n’est pas remis en file à chaque affichage', async () => {
    const h = pageHarness([{ producerKey: KEY, displayName: 'Domaine Tempier', status: 'UNKNOWN', source: 'GEMINI', description: null, ...EMPTY, manualFields: [], errorMessage: null, generatedAt: null, updatedBy: null }]);
    const { profile } = await h.service.page('c1', KEY, 'VIEWER');
    expect(profile).toMatchObject({ status: 'UNKNOWN' });
    expect(h.prisma.producerProfile.updateMany).not.toHaveBeenCalled();
  });
});

describe('ProducersService.setField', () => {
  it('écrit le champ, l’ajoute aux corrections et signe du compte, sans toucher au statut ni à la source', async () => {
    const h = harness();
    const view = await h.service.setField(KEY, 'histoire', 'Texte', 'u1');
    // La réservation d'un lot en cours est levée : sa réponse n'écrase jamais le texte saisi.
    const edit = { histoire: 'Texte', manualFields: ['histoire'], updatedById: 'u1', reservedUntil: null };
    expect(h.upsert).toHaveBeenCalledWith({
      where: { producerKey: KEY },
      create: { producerKey: KEY, displayName: 'Domaine Tempier', ...edit },
      update: edit,
      include,
    });
    expect(view).toMatchObject({ fields: { ...EMPTY, histoire: 'Texte' }, manualFields: ['histoire'], updatedBy: 'proprietaire@example.com' });
  });

  it('setField ajoute le champ à manualFields sans doublon', async () => {
    const h = harness({ existing: { manualFields: ['histoire', 'nez'] } });
    await h.service.setField(KEY, 'nez', 'Fruits noirs', 'u1');
    await h.service.setField(KEY, 'terroir', 'Restanques', 'u1');
    expect((h.upsert.mock.calls[0] as any)[0].update.manualFields).toEqual(['histoire', 'nez']);
    expect((h.upsert.mock.calls[1] as any)[0].update.manualFields).toEqual(['histoire', 'nez', 'terroir']);
  });

  it('réessaie une fois quand une création concurrente (worker) gagne la course (P2002)', async () => {
    const h = harness({ conflictOnce: true });
    await h.service.setField(KEY, 'histoire', 'Texte', 'u1');
    expect(h.upsert).toHaveBeenCalledTimes(2);
  });

  it('refuse un domaine qu’aucun vin ne porte', async () => {
    const h = harness({ wines: [] });
    await expect(h.service.setField(KEY, 'histoire', 'Texte', 'u1')).rejects.toThrow(new NotFoundException('Domaine introuvable'));
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe('ProducersService.regenerate', () => {
  it('repasse en attente côté Gemini et vide les corrections ; les champs restent affichés pendant la génération', async () => {
    const h = harness();
    await h.service.regenerate(KEY);
    expect(h.upsert).toHaveBeenCalledWith({
      where: { producerKey: KEY },
      create: { producerKey: KEY, displayName: 'Domaine Tempier', requestedAt: expect.any(Date) },
      update: { status: 'PENDING', source: 'GEMINI', errorMessage: null, requestedAt: expect.any(Date), attempts: 0, nextAttemptAt: null, reservedUntil: null, manualFields: [], updatedById: null },
    });
  });

  it('sans profil : le crée en attente, et réessaie une fois sur une création concurrente (P2002)', async () => {
    const h = harness({ conflictOnce: true });
    await h.service.regenerate(KEY);
    expect(h.upsert).toHaveBeenCalledTimes(2);
  });

  it('refuse un domaine qu’aucun vin ne porte', async () => {
    const h = harness({ wines: [{ producer: 'Château Simone' }] });
    await expect(h.service.regenerate(KEY)).rejects.toThrow(new NotFoundException('Domaine introuvable'));
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('ne dépend que de la base : la régénération ne peut jamais appeler Gemini ni une file', () => {
    expect(ProducersService.length).toBe(1);
  });
});

describe('ProducerScheduler.scheduleIfMissing', () => {
  function scheduler(profile: unknown) {
    const findUnique = jest.fn(async () => profile);
    const createMany = jest.fn(async () => ({ count: 1 }));
    return { findUnique, createMany, s: new ProducerScheduler({ producerProfile: { findUnique, createMany } } as any) };
  }

  it('crée en attente le descriptif d’un domaine qui n’en a pas, sous sa clé normalisée', async () => {
    const h = scheduler(null);
    await h.s.scheduleIfMissing('DOMAINE TEMPIER');
    expect(h.findUnique).toHaveBeenCalledWith({ where: { producerKey: KEY }, select: { id: true } });
    expect(h.createMany).toHaveBeenCalledWith({ data: [{ producerKey: KEY, displayName: 'DOMAINE TEMPIER', requestedAt: expect.any(Date) }], skipDuplicates: true });
  });

  it('ne fait rien pour un domaine qui a déjà un descriptif', async () => {
    const h = scheduler({ id: 'p1' });
    await h.s.scheduleIfMissing('Domaine Tempier');
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('ne fait rien pour un nom de domaine sans lettre ni chiffre', async () => {
    const h = scheduler(null);
    await h.s.scheduleIfMissing(' — ');
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.createMany).not.toHaveBeenCalled();
  });
});

describe('ProducersController', () => {
  const user = { id: 'u1' } as any;

  it('refuse un texte hors limites avec le message en français', async () => {
    const service = { setField: jest.fn() };
    const c = new ProducersController(service as any);
    expect(() => c.setField(KEY, 'histoire', { value: '  ' }, user)).toThrow(new BadRequestException('Le texte doit faire entre 1 et 600 caractères'));
    expect(() => c.setField(KEY, 'histoire', { value: 'x'.repeat(601) }, user)).toThrow(BadRequestException);
    expect(service.setField).not.toHaveBeenCalled();
  });

  it('refuse un champ inconnu', () => {
    const service = { setField: jest.fn() };
    expect(() => new ProducersController(service as any).setField(KEY, 'description', { value: 'Texte' }, user)).toThrow(new BadRequestException('Champ inconnu'));
    expect(service.setField).not.toHaveBeenCalled();
  });

  it('transmet le champ, le texte rogné et le compte', async () => {
    const service = { setField: jest.fn(async () => ({})) };
    await new ProducersController(service as any).setField(KEY, 'nez', { value: ' Texte ' }, user);
    expect(service.setField).toHaveBeenCalledWith(KEY, 'nez', 'Texte', 'u1');
  });

  it('lit la page dans la cave courante, avec le rôle du lecteur', async () => {
    const service = { page: jest.fn(async () => ({})) };
    await new ProducersController(service as any).page({ caveId: 'c1', role: 'VIEWER' } as any, KEY);
    expect(service.page).toHaveBeenCalledWith('c1', KEY, 'VIEWER');
  });

  it('répond 202 à une régénération', () => {
    expect(Reflect.getMetadata('__httpCode__', ProducersController.prototype.regenerate)).toBe(202);
  });
});
