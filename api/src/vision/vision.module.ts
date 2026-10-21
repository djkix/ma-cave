import { Logger, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiJournal } from './gemini-journal';
import { GeminiModelService } from './gemini-model.service';
import { GeminiVisionProvider } from './gemini-vision.provider';
import { OFFICIAL_SITE_PROVIDER } from './official-site-provider.interface';
import { PAIRING_PROVIDER } from './pairing-provider.interface';
import { PRODUCER_PROVIDER } from './producer-provider.interface';
import { VISION_PROVIDER } from './vision-provider.interface';

@Module({
  providers: [
    // Journal des appels et pause commune, partagés par l'api et le worker (même base).
    { provide: GeminiJournal, useFactory: (prisma: PrismaService) => new GeminiJournal(prisma, new Logger('GeminiJournal')), inject: [PrismaService] },
    // Modèle en vigueur, choisi dans l'Administration (réglage partagé par l'api et le worker).
    {
      provide: GeminiModelService,
      useFactory: (prisma: PrismaService) => {
        const env = loadEnv();
        return new GeminiModelService(prisma, env.GEMINI_MODEL, env.GEMINI_API_KEY, { log: new Logger('GeminiModel') });
      },
      inject: [PrismaService],
    },
    {
      provide: VISION_PROVIDER,
      useFactory: (journal: GeminiJournal, models: GeminiModelService) =>
        GeminiVisionProvider.fromApiKey(loadEnv().GEMINI_API_KEY, async () => (await models.current()).model, journal),
      inject: [GeminiJournal, GeminiModelService],
    },
    { provide: PAIRING_PROVIDER, useExisting: VISION_PROVIDER },
    { provide: PRODUCER_PROVIDER, useExisting: VISION_PROVIDER },
    { provide: OFFICIAL_SITE_PROVIDER, useExisting: VISION_PROVIDER },
  ],
  exports: [GeminiJournal, GeminiModelService, VISION_PROVIDER, PAIRING_PROVIDER, PRODUCER_PROVIDER, OFFICIAL_SITE_PROVIDER],
})
export class VisionModule {}
