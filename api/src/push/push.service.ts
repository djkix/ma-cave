import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Réglage `app_setting` : `{ publicKey, privateKey }` en JSON, une seule ligne pour que deux démarrages simultanés s'accordent. */
export const VAPID_KEYS_SETTING = 'push_vapid_keys';

export type Vapid = webpush.VapidDetails;
export interface PushPayload { title: string; body: string; url: string }
export interface SubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

/** Un service push lent ne retient pas l'envoi au-delà. */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Notifications Web Push des administrateurs. Les clés VAPID sont créées au
 * premier démarrage (api ou worker, le premier gagne) ; VAPID_PUBLIC_KEY et
 * VAPID_PRIVATE_KEY les imposent.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private keys?: Promise<Vapid>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Jamais bloquant : sans base au démarrage, les clés seront créées au premier besoin.
    await this.vapid().catch((e) => {
      this.keys = undefined;
      this.logger.error(`Clés VAPID indisponibles : ${(e as Error).message}`);
    });
  }

  vapid(): Promise<Vapid> {
    this.keys ??= this.loadKeys();
    return this.keys;
  }

  private async loadKeys(): Promise<Vapid> {
    const env = loadEnv();
    const subject = env.VAPID_SUBJECT ?? (env.WEB_ORIGIN.startsWith('https://') ? env.WEB_ORIGIN : 'mailto:admin@example.com');
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { subject, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
    await this.prisma.appSetting.createMany({
      data: [{ key: VAPID_KEYS_SETTING, value: JSON.stringify(webpush.generateVAPIDKeys()) }],
      skipDuplicates: true,
    });
    const row = await this.prisma.appSetting.findUniqueOrThrow({ where: { key: VAPID_KEYS_SETTING } });
    const { publicKey, privateKey } = JSON.parse(row.value) as { publicKey: string; privateKey: string };
    return { subject, publicKey, privateKey };
  }

  /** Un appareil change de compte : l'abonnement suit le compte connecté. */
  async subscribe(userId: string, sub: SubscriptionInput): Promise<void> {
    const data = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
    await this.prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /**
   * Nouvelle inscription en attente : prévient chaque appareil abonné d'un
   * administrateur actif. Ne lève jamais et ne se fait pas attendre (l'appelant
   * n'attend pas la promesse) : l'inscription n'en dépend pas.
   */
  notifyNewRegistration(user: { email: string; displayName: string | null }): Promise<void> {
    const payload = { title: 'Nouvelle inscription', body: `${user.displayName || user.email} attend votre validation`, url: '/admin/comptes' };
    return this.sendToAdmins(payload).catch((e) => this.logger.error(`Notification d'inscription non envoyée : ${(e as Error).message}`));
  }

  private async sendToAdmins(payload: PushPayload): Promise<void> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { user: { isAdmin: true, status: 'ACTIVE' } } });
    if (subs.length === 0) return;
    const vapidDetails = await this.vapid();
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { vapidDetails, TTL: 24 * 3600, timeout: SEND_TIMEOUT_MS });
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410 : l'abonnement n'existe plus chez le service push (désinstallé, permission retirée).
          if (status === 404 || status === 410) await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
          else this.logger.warn(`Envoi push refusé (${status ?? 'réseau'}) : ${(e as Error).message}`);
        }
      }),
    );
  }
}
