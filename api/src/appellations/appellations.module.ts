import { Module, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { AppellationsController } from './appellations.controller';
import { AppellationsService } from './appellations.service';

@Module({ controllers: [AppellationsController], providers: [AppellationsService], exports: [AppellationsService] })
export class AppellationsModule implements OnModuleInit {
  constructor(private readonly appellations: AppellationsService) {}
  async onModuleInit() {
    // Le référentiel est chargé au démarrage de l'api (idempotent, ~145 upserts).
    await this.appellations.seedFromFile(resolve(process.cwd(), 'data/appellations.json'));
  }
}
