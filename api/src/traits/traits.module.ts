import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { VisionModule } from '../vision/vision.module';
import { TraitsBatchProcessor } from './traits-batch.processor';

@Module({
  imports: [QueueModule, VisionModule],
  providers: [TraitsBatchProcessor],
  exports: [TraitsBatchProcessor],
})
export class TraitsModule {}
