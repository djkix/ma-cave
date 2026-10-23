import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CaveRole, CurrentCave } from '../caves/cave-access.decorators';
import { CaveAccessGuard } from '../caves/cave-access.guard';
import type { CaveAccess } from '../caves/cave-context.service';
import { AccordsService, accordsSchema } from './accords.service';

/** « Accords vins » : vins de la cave courante pour un plat ; lecture, ouverte au membre. */
@Controller('accords')
@UseGuards(AuthenticatedGuard, CaveAccessGuard)
export class AccordsController {
  constructor(private readonly accords: AccordsService) {}

  // Un appel Gemini par demande : 10 par minute suffisent à un usage manuel.
  @Post()
  @HttpCode(200)
  @CaveRole('VIEWER')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  suggest(@CurrentCave() cave: CaveAccess, @Body() body: unknown) {
    const parsed = accordsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(' ; '));
    return this.accords.suggest(cave.caveId, parsed.data.dish);
  }
}
