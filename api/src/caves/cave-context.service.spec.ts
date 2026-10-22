import { Prisma } from '@prisma/client';
import { CaveContextService } from './cave-context.service';

/** Base factice : un administrateur principal propriétaire de « Cave de Jeanne ». */
function serviceFor(opts: { isBreakGlass: boolean; members: { id: string; name: string; role: 'OWNER' | 'VIEWER' }[]; mainCave?: boolean }) {
  const prisma = {
    caveMember: { findMany: jest.fn(async () => opts.members.map((c) => ({ role: c.role, cave: { id: c.id, name: c.name } }))) },
    appUser: {
      findUnique: jest.fn(async () => ({ isBreakGlass: opts.isBreakGlass })),
      findFirst: jest.fn(async () => (opts.mainCave === false ? null : { id: 'jeanne' })),
    },
    cave: {
      findFirst: jest.fn(async () => ({ id: 'principale' })),
      findUnique: jest.fn(async () => ({ id: 'principale', name: 'Cave de Jeanne' })),
    },
  };
  return new CaveContextService(prisma as never);
}

describe('CaveContextService — compte de secours', () => {
  it('le compte de secours est propriétaire de la cave principale, même inscrit comme membre', async () => {
    const service = serviceFor({ isBreakGlass: true, members: [{ id: 'principale', name: 'Cave de Jeanne', role: 'VIEWER' }] });
    expect(await service.listForUser('secours')).toEqual([{ id: 'principale', name: 'Cave de Jeanne', role: 'OWNER' }]);
    expect(await service.findAccess('secours', 'principale')).toEqual({ caveId: 'principale', role: 'OWNER' });
    expect(await service.resolveCurrent('secours')).toEqual({ caveId: 'principale', role: 'OWNER' });
  });

  it('le compte de secours y accède même sans ligne de membre, et garde ses autres caves', async () => {
    const service = serviceFor({ isBreakGlass: true, members: [{ id: 'autre', name: 'Cave d’Ami', role: 'VIEWER' }] });
    expect(await service.listForUser('secours')).toEqual([
      { id: 'principale', name: 'Cave de Jeanne', role: 'OWNER' },
      { id: 'autre', name: 'Cave d’Ami', role: 'VIEWER' },
    ]);
    expect(await service.findAccess('secours', 'autre')).toEqual({ caveId: 'autre', role: 'VIEWER' });
  });

  it('sans cave principale, le compte de secours n’a que ses lignes de membre', async () => {
    const service = serviceFor({ isBreakGlass: true, mainCave: false, members: [] });
    expect(await service.resolveCurrent('secours')).toBeNull();
  });

  it('un autre compte reste lecteur de la cave principale', async () => {
    const service = serviceFor({ isBreakGlass: false, members: [{ id: 'principale', name: 'Cave de Jeanne', role: 'VIEWER' }] });
    expect(await service.findAccess('membre', 'principale')).toEqual({ caveId: 'principale', role: 'VIEWER' });
  });
});

describe('CaveContextService.acceptInvitations', () => {
  const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
  function fake(invitations: { id: string }[], conflictOn: string[] = []) {
    const caveMember = {
      findMany: jest.fn(async () => invitations),
      updateMany: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (conflictOn.includes(where.id)) throw p2002();
        return { count: 1 };
      }),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    };
    return { caveMember, service: new CaveContextService({ caveMember } as never) };
  }

  it('rattache au compte les invitations en attente adressées à son e-mail (casse ignorée)', async () => {
    const { caveMember, service } = fake([{ id: 'i1' }, { id: 'i2' }]);
    await service.acceptInvitations('u1', 'Invite@Example.test');
    expect(caveMember.findMany).toHaveBeenCalledWith({
      where: { userId: null, invitedEmail: { equals: 'Invite@Example.test', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(caveMember.updateMany).toHaveBeenCalledWith({ where: { id: 'i1', userId: null }, data: { userId: 'u1', invitedEmail: null } });
    expect(caveMember.updateMany).toHaveBeenCalledWith({ where: { id: 'i2', userId: null }, data: { userId: 'u1', invitedEmail: null } });
    expect(caveMember.deleteMany).not.toHaveBeenCalled();
  });

  it('déjà membre de la cave (P2002) : l’invitation en double est retirée, les autres sont rattachées', async () => {
    const { caveMember, service } = fake([{ id: 'i1' }, { id: 'i2' }], ['i1']);
    await service.acceptInvitations('u1', 'x@example.test');
    expect(caveMember.deleteMany).toHaveBeenCalledWith({ where: { id: 'i1', userId: null } });
    expect(caveMember.updateMany).toHaveBeenCalledTimes(2);
  });

  it('autre erreur : relancée', async () => {
    const { caveMember, service } = fake([{ id: 'i1' }]);
    const boom = new Error('base injoignable');
    caveMember.updateMany.mockRejectedValueOnce(boom);
    await expect(service.acceptInvitations('u1', 'x@example.test')).rejects.toBe(boom);
  });
});
