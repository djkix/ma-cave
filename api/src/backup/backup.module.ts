import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackupController } from './backup.controller';

@Module({ imports: [AuthModule], controllers: [BackupController] })
export class BackupModule {}
