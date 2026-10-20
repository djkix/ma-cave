import {
  Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Res, UploadedFile, UseFilters, UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AppUser } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CaveRole, CurrentCave } from '../caves/cave-access.decorators';
import { CaveAccessGuard } from '../caves/cave-access.guard';
import type { CaveAccess } from '../caves/cave-context.service';
import { PlanService } from './plan.service';
import { INVALID_PLAN_NAME, PLAN_NOT_FOUND, planNameSchema } from './zone';
import { checkImage, MAX_PHOTO_BYTES, parse, PhotoTooLargeFilter } from './zones.controller';

/** Un plan se désigne par un UUID : tout autre identifiant est « introuvable », comme un plan d'une autre cave. */
const planId = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException(PLAN_NOT_FOUND) });
const nameBody = z.object({ name: planNameSchema }, { invalid_type_error: INVALID_PLAN_NAME, required_error: INVALID_PLAN_NAME });

/** Plans de la cave courante : lus par un membre, créés, renommés, remplacés ou supprimés par le propriétaire (« Ma cave »). */
@Controller('caves/current/plans')
@UseGuards(AuthenticatedGuard, CaveAccessGuard)
export class CavePlansController {
  constructor(private readonly plans: PlanService) {}

  @Get()
  @CaveRole('VIEWER')
  list(@CurrentCave() cave: CaveAccess) {
    return this.plans.list(cave.caveId);
  }

  /** Multipart : `file` (l'image) et `name`. Même plafond et même limite que la photo d'une zone. */
  @Post()
  @CaveRole('OWNER')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseFilters(PhotoTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  create(@CurrentCave() cave: CaveAccess, @Body() body: unknown, @UploadedFile() file?: Express.Multer.File) {
    const { name } = parse(nameBody, body);
    return this.plans.create(cave.caveId, name, checkImage(file));
  }

  @Patch(':id')
  @CaveRole('OWNER')
  rename(@CurrentCave() cave: CaveAccess, @Param('id', planId) id: string, @Body() body: unknown) {
    return this.plans.rename(cave.caveId, id, parse(nameBody, body).name);
  }

  @Put(':id/image')
  @CaveRole('OWNER')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseFilters(PhotoTooLargeFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  replaceImage(@CurrentCave() cave: CaveAccess, @Param('id', planId) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.plans.replaceImage(cave.caveId, id, checkImage(file));
  }

  /** 204 ; les zones du plan sont gardées, sans repère. */
  @Delete(':id')
  @CaveRole('OWNER')
  @HttpCode(204)
  async remove(@CurrentCave() cave: CaveAccess, @Param('id', planId) id: string) {
    await this.plans.remove(cave.caveId, id);
  }
}

/** Image d'un plan : servie pour toute cave du compte, propriétaire ou membre, même hors de la cave courante. */
@Controller('caves/plans')
@UseGuards(AuthenticatedGuard)
export class CavePlanImageController {
  constructor(private readonly plans: PlanService) {}

  @Get(':planId/image')
  async image(@CurrentUser() user: AppUser, @Param('planId', planId) id: string, @Res() res: Response) {
    const image = await this.plans.image(user.id, id);
    res.setHeader('Content-Type', 'image/jpeg');
    // L'image peut être remplacée sous la même adresse : revalidée à chaque affichage (ETag).
    res.setHeader('Cache-Control', 'private, no-cache');
    res.send(image);
  }
}
