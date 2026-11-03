import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { AppellationsService } from './appellations.service';

/** Suggestions du référentiel, communes à toutes les caves : tout utilisateur connecté. */
@Controller('appellations')
@UseGuards(AuthenticatedGuard)
export class AppellationsController {
  constructor(private readonly appellations: AppellationsService) {}

  @Get()
  suggest(@Query('q') q?: string) {
    return this.appellations.suggest(typeof q === 'string' ? q.slice(0, 100) : '');
  }
}
