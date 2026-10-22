import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupSession } from './auth/session.setup';
import { loadEnv } from './config/env';

async function bootstrap() {
  // Connexions fermées d'office à l'arrêt (flux SSE ouverts) ; crochets d'arrêt : Prisma, files et limiteur (Redis) se ferment proprement.
  const app = await NestFactory.create(AppModule, { forceCloseConnections: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  // NPM → nginx (web) → api : l'adresse du client est celle qu'a vue le premier
  // proxy, TRUST_PROXY_HOPS crans avant la fin de X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', loadEnv().TRUST_PROXY_HOPS);
  setupSession(app);
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
