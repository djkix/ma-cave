import { PrismaClient, WineColor } from '@prisma/client';
import { CaveService } from '../cave/cave.service';
import { LocationsService } from '../locations/locations.service';
import { MovementsService } from './movements.service';
import { createTestCave, deleteTestCaves } from '../test-utils/cave';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const key = (p: string) => `${p}-${Date.now()}-${Math.random()}`;

describeIfDb('entrée par code-barres (base réelle)', () => {
  const prisma = new PrismaClient();
  let caveId: string;
  const wineIds: string[] = [];
  const photoIds: string[] = [];
  const cave = new CaveService(prisma as never, {} as never, {} as never);

  beforeAll(async () => {
    caveId = (await createTestCave(prisma)).id;
  });

  afterAll(async () => {
    await prisma.movement.deleteMany({ where: { wineId: { in: wineIds } } });
    await prisma.wine.deleteMany({ where: { id: { in: wineIds } } });
    await prisma.photo.deleteMany({ where: { id: { in: photoIds } } });
    await deleteTestCaves(prisma, [caveId]);
    await prisma.$disconnect();
  });

  async function enterWithPhoto(ean: string, wineEan: string | null, vintage: number) {
    const wine = await prisma.wine.create({
      data: { caveId, matchKey: key('ean'), producer: 'Domaine du Code', appellationRaw: 'Cahors', color: WineColor.ROUGE, vintage, ean: wineEan },
    });
    wineIds.push(wine.id);
    const photo = await prisma.photo.create({ data: { caveId, contentHash: key('h'), storagePath: 'x.jpg', status: 'DONE', ean } });
    photoIds.push(photo.id);
    const service = new MovementsService(prisma as never, { matchOrCreate: async () => ({ wine, created: false }) } as never, new LocationsService(prisma as never));
    await service.createIn(caveId, {
      idempotencyKey: crypto.randomUUID(), photoId: photo.id, quantity: 3,
      wine: { producer: wine.producer, appellationRaw: wine.appellationRaw, color: 'ROUGE', formatCl: 75, vintage },
    });
    return wine;
  }

  it('le code scanné avant la photo est retenu sur le vin, puis retrouvé avec son stock', async () => {
    const ean = String(Date.now()).padStart(13, '3').slice(0, 13);
    const wine = await enterWithPhoto(ean, null, 2019);
    expect((await prisma.wine.findUniqueOrThrow({ where: { id: wine.id } })).ean).toBe(ean);
    const found = await cave.byEan(caveId, ean);
    expect(found).toEqual([expect.objectContaining({ id: wine.id, vintage: 2019, quantity: 3, color: 'ROUGE' })]);
    expect(await cave.byEan('00000000-0000-0000-0000-000000000000', ean)).toEqual([]);
  });

  it('ne remplace pas un code déjà retenu', async () => {
    const wine = await enterWithPhoto('12345670', '96385074', 2020);
    expect((await prisma.wine.findUniqueOrThrow({ where: { id: wine.id } })).ean).toBe('96385074');
  });
});
