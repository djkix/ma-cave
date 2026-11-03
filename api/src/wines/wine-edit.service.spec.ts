import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ApogeeRulesService } from '../apogee/apogee-rules.service';
import { AppellationsService } from '../appellations/appellations.service';
import { CaveService } from '../cave/cave.service';
import { LocationsService } from '../locations/locations.service';
import { producerKeyOf } from '../producers/producer-key';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';
import { WineEditService } from './wine-edit.service';
import { WineMatchingService } from './wine-matching.service';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Modifier un vin sur la vraie base : la fusion déplace mouvements, cotes,
 * caractéristiques et note dans une transaction, et la clé unique
 * (cave, match_key) et le stock par emplacement ne se vérifient qu'en base.
 */
describeIfDb('WineEditService (base réelle)', () => {
  const prisma = new PrismaClient();
  const appellations = new AppellationsService(prisma as never);
  const matching = new WineMatchingService(prisma as never, appellations);
  const service = new WineEditService(prisma as never, appellations);
  const cave = new CaveService(prisma as never, new ApogeeRulesService(prisma as never), new LocationsService(prisma as never));
  const run = randomUUID().slice(0, 8);
  const producer = `Domaine Édition ${run}`;
  const caveIds: string[] = [];
  let caveId: string;
  let otherCaveId: string;
  const pommard = (vintage: number, extra: Partial<{ producer: string; cuvee: string | null }> = {}) => ({
    producer, cuvee: null, appellationRaw: 'Pommard', vintage, color: 'ROUGE' as const, formatCl: 75, ...extra,
  });
  const entry = (wineId: string, delta: number, locationId: string | null = null) =>
    prisma.movement.create({ data: { wineId, delta, type: 'IN', locationId, idempotencyKey: randomUUID() } });

  beforeAll(async () => {
    caveId = (await createTestCave(prisma)).id;
    otherCaveId = (await createTestCave(prisma)).id;
    caveIds.push(caveId, otherCaveId);
  });

  afterAll(async () => {
    await deleteTestCaves(prisma, caveIds);
    await prisma.producerProfile.deleteMany({ where: { producerKey: { contains: run } } });
    await prisma.$disconnect();
  });

  it('corrige un millésime : même fiche, apogée recalculée, apogée manuelle intacte', async () => {
    const { wine } = await matching.matchOrCreate(caveId, pommard(2081, { cuvee: 'Correction' }));
    expect((await cave.detail(caveId, wine.id)).wine.apogee).toMatchObject({ min: 2086, max: 2096 });

    expect(await service.edit(caveId, wine.id, pommard(2018, { cuvee: 'Correction' }))).toEqual({ id: wine.id });

    const saved = await prisma.wine.findUniqueOrThrow({ where: { id: wine.id } });
    expect(saved.vintage).toBe(2018);
    expect((await cave.detail(caveId, wine.id)).wine.apogee).toMatchObject({ min: 2023, max: 2033 });

    await prisma.wine.update({ where: { id: wine.id }, data: { apogeeMin: 2030, apogeeMax: 2040, apogeeSource: 'MANUEL' } });
    await service.edit(caveId, wine.id, pommard(2019, { cuvee: 'Correction' }));
    expect(await prisma.wine.findUniqueOrThrow({ where: { id: wine.id } })).toMatchObject({ vintage: 2019, apogeeMin: 2030, apogeeMax: 2040, apogeeSource: 'MANUEL' });
  });

  it('enregistrer sans rien changer, ou en changeant la casse du domaine, ne signale pas de doublon', async () => {
    const { wine } = await matching.matchOrCreate(caveId, pommard(2015, { cuvee: 'Casse' }));
    expect(await service.edit(caveId, wine.id, pommard(2015, { cuvee: 'Casse' }))).toEqual({ id: wine.id });
    expect(await service.edit(caveId, wine.id, pommard(2015, { cuvee: 'Casse', producer: producer.toUpperCase() }))).toEqual({ id: wine.id });
    expect((await prisma.wine.findUniqueOrThrow({ where: { id: wine.id } })).producer).toBe(producer.toUpperCase());
  });

  it('remet caractéristiques et accord en file quand l’appellation change, sans perdre les champs manuels', async () => {
    const { wine } = await matching.matchOrCreate(caveId, pommard(2016, { cuvee: 'Requeue' }));
    await prisma.wineTraits.create({ data: { wineId: wine.id, status: 'DONE', tannin: 'FONDU', region: 'Bourgogne', manualFields: ['tannin'] } });
    await prisma.pairing.create({ data: { wineId: wine.id, status: 'DONE', dishes: ['Bœuf'] } });

    await service.edit(caveId, wine.id, { ...pommard(2016, { cuvee: 'Requeue' }), appellationRaw: 'bandol' });

    const saved = await prisma.wine.findUniqueOrThrow({ where: { id: wine.id }, include: { traits: true, pairing: true } });
    expect(saved.appellationRaw).toBe('Bandol');
    expect(saved.traits).toMatchObject({ status: 'PENDING', tannin: 'FONDU', manualFields: ['tannin'] });
    expect(saved.pairing?.status).toBe('PENDING');
  });

  it('signale le doublon sans fusion demandée, et ne touche à rien', async () => {
    const { wine: target } = await matching.matchOrCreate(caveId, pommard(2018, { cuvee: 'Doublon' }));
    const { wine: source } = await matching.matchOrCreate(caveId, pommard(2081, { cuvee: 'Doublon' }));
    await entry(target.id, 3);

    expect(await service.edit(caveId, source.id, pommard(2018, { cuvee: 'Doublon' }))).toEqual({
      duplicate: { id: target.id, producer, cuvee: 'Doublon', vintage: 2018, quantity: 3 },
    });
    expect((await prisma.wine.findUniqueOrThrow({ where: { id: source.id } })).vintage).toBe(2081);
  });

  it('fusionne : bouteilles, emplacements, cotes, note, caractéristiques et accord, sans rien perdre', async () => {
    const loc = async (casier: string) => (await prisma.location.create({ data: { caveId, casier: `${casier} ${run}` } })).id;
    const locA = await loc('A');
    const locB = await loc('B');
    const { wine: target } = await matching.matchOrCreate(caveId, pommard(2018, { cuvee: 'Fusion' }));
    const { wine: source } = await matching.matchOrCreate(caveId, pommard(2081, { cuvee: 'Fusion' }));
    // Cible : 3 bouteilles (2 en A, 1 sans emplacement) ; source : 2 (1 en A, 1 en B).
    await entry(target.id, 2, locA);
    await entry(target.id, 1);
    await entry(source.id, 1, locA);
    await entry(source.id, 1, locB);
    await prisma.wineTraits.create({ data: { wineId: target.id, status: 'DONE', tannin: 'FONDU', manualFields: ['tannin'] } });
    await prisma.wineTraits.create({ data: { wineId: source.id, status: 'DONE', tannin: 'PUISSANT', region: 'Bourgogne', manualFields: ['tannin', 'region'] } });
    await prisma.pairing.create({ data: { wineId: target.id, status: 'DONE', dishes: ['Bœuf'] } });
    await prisma.pairing.create({ data: { wineId: source.id, status: 'DONE', dishes: ['Agneau'] } });
    await prisma.priceQuote.create({ data: { wineId: target.id, coteCents: 4000, quotedOn: new Date('2026-01-01') } });
    await prisma.priceQuote.create({ data: { wineId: source.id, coteCents: 4500, quotedOn: new Date('2026-02-01') } });
    await prisma.imageSearchCost.create({ data: { caveId, wineId: source.id, costCents: 1 } });
    await prisma.wine.update({ where: { id: target.id }, data: { rating: 14, ratedAt: new Date('2026-01-01') } });
    await prisma.wine.update({ where: { id: source.id }, data: { rating: 17, ratedAt: new Date('2026-03-01'), referencePhotoSource: 'example.com' } });

    expect(await service.edit(caveId, source.id, { ...pommard(2018, { cuvee: 'Fusion' }), merge: true })).toEqual({ id: target.id, merged: true });

    expect(await prisma.wine.findUnique({ where: { id: source.id } })).toBeNull();
    const byLocation = await prisma.movement.groupBy({ by: ['locationId'], where: { wineId: target.id }, _sum: { delta: true } });
    const stock = Object.fromEntries(byLocation.map((r) => [r.locationId ?? 'aucun', r._sum.delta]));
    expect(stock).toEqual({ [locA]: 3, [locB]: 1, aucun: 1 });
    expect(await prisma.priceQuote.count({ where: { wineId: target.id } })).toBe(2);
    expect(await prisma.imageSearchCost.count({ where: { wineId: target.id } })).toBe(1);
    expect(await prisma.wineTraits.count({ where: { wineId: { in: [target.id, source.id] } } })).toBe(1);
    const merged = await prisma.wine.findUniqueOrThrow({ where: { id: target.id }, include: { traits: true, pairing: true } });
    expect(merged.traits).toMatchObject({ tannin: 'FONDU', region: 'Bourgogne' });
    expect([...merged.traits!.manualFields].sort()).toEqual(['region', 'tannin']);
    expect(merged.pairing?.dishes).toEqual(['Bœuf']);
    expect(await prisma.pairing.count({ where: { wineId: source.id } })).toBe(0);
    expect(Number(merged.rating)).toBe(17);
    expect((await cave.detail(caveId, target.id)).wine.quantity).toBe(5);
  });

  it('un vin d’une autre cave est introuvable', async () => {
    const { wine } = await matching.matchOrCreate(otherCaveId, pommard(2010, { cuvee: 'Ailleurs' }));
    await expect(service.edit(caveId, wine.id, pommard(2011, { cuvee: 'Ailleurs' }))).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.wine.findUniqueOrThrow({ where: { id: wine.id } })).vintage).toBe(2010);
  });

  it('le descriptif du nouveau domaine est demandé quand le domaine change', async () => {
    const { wine } = await matching.matchOrCreate(caveId, pommard(2012, { cuvee: 'Domaine' }));
    const renamed = `Clos Renommé ${run}`;
    await service.edit(caveId, wine.id, pommard(2012, { cuvee: 'Domaine', producer: renamed }));
    expect(await prisma.producerProfile.findUnique({ where: { producerKey: producerKeyOf(renamed) } })).toMatchObject({ status: 'PENDING' });
  });
});
