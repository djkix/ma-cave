/* eslint-disable @typescript-eslint/no-explicit-any */
import * as webpush from 'web-push';
import { AuthService } from '../auth/auth.service';
import { PushService, VAPID_KEYS_SETTING } from './push.service';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(() => ({ publicKey: 'PUB', privateKey: 'PRIV' })),
  sendNotification: jest.fn(),
}));
const send = webpush.sendNotification as jest.Mock;

process.env.DATABASE_URL ??= 'postgresql://postgres:dev@localhost:5432/cave';
process.env.SESSION_SECRET ??= 'a'.repeat(32);

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; user: { isAdmin: boolean; status: string } };

function fakePrisma(subs: Sub[] = [], settings = new Map<string, string>()) {
  return {
    settings,
    subs,
    appSetting: {
      createMany: jest.fn(async ({ data }: any) => data.forEach((d: any) => !settings.has(d.key) && settings.set(d.key, d.value))),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ key: where.key, value: settings.get(where.key)! })),
    },
    pushSubscription: {
      findMany: jest.fn(async ({ where }: any) => subs.filter((s) => s.user.isAdmin === where.user.isAdmin && s.user.status === where.user.status)),
      update: jest.fn(async () => ({})),
      deleteMany: jest.fn(async ({ where }: any) => subs.splice(subs.findIndex((s) => s.id === where.id), 1)),
      upsert: jest.fn(async () => ({})),
    },
  };
}

const sub = (id: string, isAdmin = true): Sub => ({ id, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a', user: { isAdmin, status: 'ACTIVE' } });

beforeEach(() => send.mockReset());

describe('PushService', () => {
  it('génère les clés VAPID une seule fois, les garde en base et les relit', async () => {
    const prisma = fakePrisma();
    const keys = await new PushService(prisma as any).vapid();
    expect(keys).toMatchObject({ publicKey: 'PUB', privateKey: 'PRIV' });
    expect(JSON.parse(prisma.settings.get(VAPID_KEYS_SETTING)!)).toEqual({ publicKey: 'PUB', privateKey: 'PRIV' });

    // Second démarrage : la ligne existante l'emporte sur une nouvelle génération.
    (webpush.generateVAPIDKeys as jest.Mock).mockReturnValueOnce({ publicKey: 'AUTRE', privateKey: 'AUTRE' });
    expect((await new PushService(prisma as any).vapid()).publicKey).toBe('PUB');
  });

  it('prend les clés imposées par VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY sans toucher la base', async () => {
    jest.resetModules();
    process.env.VAPID_PUBLIC_KEY = 'ENVPUB';
    process.env.VAPID_PRIVATE_KEY = 'ENVPRIV';
    process.env.VAPID_SUBJECT = 'mailto:moi@example.com';
    try {
      const { PushService: Fresh } = await import('./push.service');
      const prisma = fakePrisma();
      await expect(new Fresh(prisma as any).vapid()).resolves.toEqual({ subject: 'mailto:moi@example.com', publicKey: 'ENVPUB', privateKey: 'ENVPRIV' });
      expect(prisma.appSetting.createMany).not.toHaveBeenCalled();
    } finally {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      delete process.env.VAPID_SUBJECT;
    }
  });

  it('n’envoie qu’aux abonnements des administrateurs actifs, sans donnée de la cave', async () => {
    const prisma = fakePrisma([sub('admin'), sub('membre', false)]);
    send.mockResolvedValue({ statusCode: 201 });
    await new PushService(prisma as any).notifyNewRegistration({ email: 'new@example.com', displayName: null });
    expect(send).toHaveBeenCalledTimes(1);
    const [target, payload, options] = send.mock.calls[0];
    expect(target).toEqual({ endpoint: 'https://push.example/admin', keys: { p256dh: 'k', auth: 'a' } });
    expect(JSON.parse(payload)).toEqual({ title: 'Nouvelle inscription', body: 'new@example.com attend votre validation', url: '/admin/comptes' });
    expect(options.vapidDetails).toMatchObject({ publicKey: 'PUB', privateKey: 'PRIV' });
    expect(prisma.pushSubscription.update).toHaveBeenCalledWith({ where: { id: 'admin' }, data: { lastSuccessAt: expect.any(Date) } });
  });

  it('supprime un abonnement qui répond 410 ou 404, garde celui qui échoue autrement', async () => {
    const prisma = fakePrisma([sub('parti'), sub('perdu'), sub('lent')]);
    send.mockImplementation(async (s: any) => {
      const code = { 'https://push.example/parti': 410, 'https://push.example/perdu': 404 }[s.endpoint as string] ?? 500;
      throw Object.assign(new Error('refus'), { statusCode: code });
    });
    await new PushService(prisma as any).notifyNewRegistration({ email: 'x@example.com', displayName: 'X' });
    expect(prisma.subs.map((s) => s.id)).toEqual(['lent']);
  });

  it('une panne (base ou réseau) ne lève jamais', async () => {
    const prisma = fakePrisma();
    prisma.pushSubscription.findMany.mockRejectedValue(new Error('base indisponible'));
    await expect(new PushService(prisma as any).notifyNewRegistration({ email: 'x@example.com', displayName: null })).resolves.toBeUndefined();
  });

  it('une panne du service push n’empêche pas l’inscription', async () => {
    const pushPrisma = fakePrisma([sub('admin')]);
    pushPrisma.pushSubscription.findMany.mockRejectedValue(new Error('base indisponible'));
    const users: any[] = [];
    const prisma: any = {
      caveMember: { count: async () => 0 },
      appUser: {
        findUnique: async () => null,
        create: async ({ data }: any) => (users.push({ id: 'u1', ...data }), users[0]),
      },
    };
    prisma.$transaction = (fn: any) => fn(prisma);
    const auth = new AuthService(prisma, { claimOrphanCave: jest.fn() } as any, new PushService(pushPrisma as any));
    const user = await auth.findOrCreateGoogleUser({ sub: 's', email: 'new@example.com', displayName: 'N' });
    expect(user.status).toBe('PENDING');
  });
});
