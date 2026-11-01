import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { PushController } from './push.controller';
import { PushService } from './push.service';

// Importé par AuthModule (envoi à l'inscription) : les gardes, sans dépendance, sont fournies ici pour éviter l'import circulaire.
@Module({ controllers: [PushController], providers: [PushService, AuthenticatedGuard, AdminGuard], exports: [PushService] })
export class PushModule {}
