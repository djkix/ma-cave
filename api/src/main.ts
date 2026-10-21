import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupSession } from './auth/session.setup';

async function bootstrap() {
  // Connexions fermées d'office à l'arrêt (flux SSE ouverts) ; crochets d'arrêt : Prisma, files et limiteur (Redis) se ferment proprement.
  const app = await NestFactory.create(AppModule, { forceCloseConnections: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  setupSession(app);
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
