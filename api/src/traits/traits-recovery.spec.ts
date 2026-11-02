import { requeueMissingTraits } from './traits-recovery';

it('crée une ligne en attente pour chaque vin qui n’en a pas, et rien au second passage', async () => {
  const have = new Set<string>();
  const wines = ['w1', 'w2'];
  const prisma = {
    wine: { findMany: jest.fn(async () => wines.filter((id) => !have.has(id)).map((id) => ({ id }))) },
    wineTraits: {
      createMany: jest.fn(async ({ data }: { data: Array<{ wineId: string }> }) => {
        data.forEach((d) => have.add(d.wineId));
        return { count: data.length };
      }),
    },
  };
  const log = jest.fn();
  expect(await requeueMissingTraits(prisma as any, log)).toBe(2);
  expect(prisma.wine.findMany).toHaveBeenCalledWith({ where: { traits: null }, select: { id: true } });
  expect(prisma.wineTraits.createMany).toHaveBeenCalledWith({
    data: [{ wineId: 'w1', requestedAt: expect.any(Date) }, { wineId: 'w2', requestedAt: expect.any(Date) }],
    skipDuplicates: true,
  });
  expect(log).toHaveBeenCalledWith(expect.stringContaining('2 vin'));
  expect(await requeueMissingTraits(prisma as any, log)).toBe(0);
  expect(prisma.wineTraits.createMany).toHaveBeenCalledTimes(1);
});
