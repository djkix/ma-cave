import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AppUser } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CaveRole, CurrentCave } from '../caves/cave-access.decorators';
import { CaveAccessGuard } from '../caves/cave-access.guard';
import type { CaveAccess } from '../caves/cave-context.service';
import { PRODUCER_FIELDS, ProducerField } from '../vision/producer-output';
import { producerFieldSchema } from './producer-field.dto';
import { ProducersService } from './producers.service';

/**
 * `:key` = clé normalisée du domaine (normalizeLabel), encodée dans l'URL.
 * La page se lit par tout membre de la cave courante (ses vins seulement).
 * Fiches communes à toutes les caves : corriger et régénérer sont réservés à
 * l'administrateur (403 sinon).
 */
@Controller('producers')
@UseGuards(AuthenticatedGuard)
export class ProducersController {
  constructor(private readonly producers: ProducersService) {}

  @Get(':key')
  @UseGuards(CaveAccessGuard)
  @CaveRole('VIEWER')
  page(@CurrentCave() cave: CaveAccess, @Param('key') key: string) {
    return this.producers.page(cave.caveId, key, cave.role);
  }

  @Put(':key/fields/:field')
  @UseGuards(AdminGuard)
  setField(@Param('key') key: string, @Param('field') field: string, @Body() body: unknown, @CurrentUser() user: AppUser) {
    if (!(PRODUCER_FIELDS as readonly string[]).includes(field)) throw new BadRequestException('Champ inconnu');
    const parsed = producerFieldSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(' ; '));
    return this.producers.setField(key, field as ProducerField, parsed.data.value, user.id);
  }

  // Met une génération Gemini en file : 10 par minute.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':key/regenerate')
  @UseGuards(AdminGuard)
  @HttpCode(202)
  regenerate(@Param('key') key: string) {
    return this.producers.regenerate(key);
  }
}
