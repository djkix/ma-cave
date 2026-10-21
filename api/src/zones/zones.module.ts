import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AuthModule } from '../auth/auth.module';
import { CavesModule } from '../caves/caves.module';
import { loadEnv } from '../config/env';
import { LocationsModule } from '../locations/locations.module';
import { ImageNormalizationService } from '../photos/image-normalization.service';
import { PHOTO_STORAGE_DIR } from '../photos/photos.service';
import { closeQueue } from '../queue/extraction.queue';
import { createPlanAnalysisQueue, PLAN_ANALYSIS_QUEUE_TOKEN } from '../queue/plan-analysis';
import { PlanAnalysisProcessor } from '../queue/plan-analysis.processor';
import { QueueModule } from '../queue/queue.module';
import { VisionModule } from '../vision/vision.module';
import { CavePlansController, CavePlanImageController } from './plan.controller';
import { PlanService } from './plan.service';
import { CurrentCaveZonesController, ZonePhotoController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  imports: [AuthModule, CavesModule, LocationsModule, QueueModule, VisionModule],
  controllers: [CurrentCaveZonesController, ZonePhotoController, CavePlansController, CavePlanImageController],
  providers: [
    ZonesService,
    PlanService,
    ImageNormalizationService,
    { provide: PHOTO_STORAGE_DIR, useFactory: () => loadEnv().PHOTO_STORAGE_DIR },
    // Analyse des photos de plan : mise en file par l'api, traitée par le worker (voir worker.ts).
    { provide: PLAN_ANALYSIS_QUEUE_TOKEN, useFactory: createPlanAnalysisQueue },
    PlanAnalysisProcessor,
  ],
})
export class ZonesModule implements OnModuleDestroy {
  constructor(@Inject(PLAN_ANALYSIS_QUEUE_TOKEN) private readonly analysisQueue: Queue) {}

  // Connexion Redis de la file créée hors du cycle de vie Nest : à fermer soi-même (voir closeQueue).
  async onModuleDestroy() {
    await closeQueue(this.analysisQueue);
  }
}
