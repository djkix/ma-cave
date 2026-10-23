import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CaveModule } from '../cave/cave.module';
import { CavesModule } from '../caves/caves.module';
import { LocationsModule } from '../locations/locations.module';
import { QueueModule } from '../queue/queue.module';
import { VisionModule } from '../vision/vision.module';
import { AccordsController } from './accords.controller';
import { AccordsService } from './accords.service';

@Module({
  imports: [AuthModule, CavesModule, CaveModule, LocationsModule, QueueModule, VisionModule],
  controllers: [AccordsController],
  providers: [AccordsService],
})
export class AccordsModule {}
