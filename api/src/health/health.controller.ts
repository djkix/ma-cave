import { Controller, Get } from '@nestjs/common';
import { AllowPending } from '../auth/allow-pending.decorator';

/**
 * Version du serveur, étiquetée au même `docker build` que la coque
 * (`VITE_APP_VERSION`, voir .github/workflows/docker-build.yml). C'est ce qui
 * rend comparable l'écart avec la version chargée dans le navigateur.
 */
const APP_VERSION = process.env.APP_VERSION?.trim() || 'dev';

@Controller('health')
@AllowPending()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', version: APP_VERSION };
  }
}
