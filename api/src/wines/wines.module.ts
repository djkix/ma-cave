import { Module } from '@nestjs/common';
import { AppellationsModule } from '../appellations/appellations.module';
import { WineEditService } from './wine-edit.service';
import { WineMatchingService } from './wine-matching.service';

@Module({ imports: [AppellationsModule], providers: [WineMatchingService, WineEditService], exports: [WineMatchingService, WineEditService] })
export class WinesModule {}
