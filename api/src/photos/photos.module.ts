import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ApogeeModule } from '../apogee/apogee.module';
import { AppellationsModule } from '../appellations/appellations.module';
import { AuthModule } from '../auth/auth.module';
import { CavesModule } from '../caves/caves.module';
import { loadEnv } from '../config/env';
import { closeQueue, createExtractionQueue, EXTRACTION_QUEUE_TOKEN, ExtractionJobData } from '../queue/extraction.queue';
import { EntryApogeeService } from './entry-apogee.service';
import { ImageNormalizationService } from './image-normalization.service';
import { PhotoEventsController } from './photo-events.controller';
import { PhotosController } from './photos.controller';
import { PHOTO_STORAGE_DIR, PhotosService } from './photos.service';

@Module({
  imports: [AuthModule, CavesModule, AppellationsModule, ApogeeModule],
  controllers: [PhotosController, PhotoEventsController],
  providers: [
    PhotosService,
    EntryApogeeService,
    ImageNormalizationService,
    { provide: PHOTO_STORAGE_DIR, useFactory: () => loadEnv().PHOTO_STORAGE_DIR },
    { provide: EXTRACTION_QUEUE_TOKEN, useFactory: createExtractionQueue },
  ],
  exports: [PhotosService, EXTRACTION_QUEUE_TOKEN],
})
export class PhotosModule implements OnModuleDestroy {
  constructor(@Inject(EXTRACTION_QUEUE_TOKEN) private readonly queue: Queue<ExtractionJobData>) {}

  // La file BullMQ tient une connexion Redis créée hors du cycle de vie Nest :
  // sans cette fermeture, `app.close()` laisse le process (et Jest) en vie.
  async onModuleDestroy() {
    await closeQueue(this.queue);
  }
}
