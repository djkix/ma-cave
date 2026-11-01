import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AppUser } from '@prisma/client';
import { z } from 'zod';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PushService } from './push.service';

// Forme de PushSubscription.toJSON() ; https seulement : l'api envoie ses requêtes à cette adresse.
const endpoint = z.string().max(2048).url().refine((u) => u.startsWith('https://'), 'Adresse du service push invalide');
const key = z.string().min(1).max(256);
export const subscriptionSchema = z.object({ endpoint, keys: z.object({ p256dh: key, auth: key }) });
export const unsubscribeSchema = z.object({ endpoint });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
  return parsed.data;
}

/** Abonnements Web Push de l'appareil courant, réservés aux administrateurs (nouvelles inscriptions). */
@Controller('push')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('key')
  async key() {
    return { publicKey: (await this.push.vapid()).publicKey };
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(@Body() body: unknown, @CurrentUser() user: AppUser): Promise<void> {
    await this.push.subscribe(user.id, parse(subscriptionSchema, body));
  }

  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(@Body() body: unknown, @CurrentUser() user: AppUser): Promise<void> {
    await this.push.unsubscribe(user.id, parse(unsubscribeSchema, body).endpoint);
  }
}
