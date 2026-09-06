import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { readJwtEnv } from './config/jwt.config';
import { AppModule } from './app.module';

async function bootstrap() {
  readJwtEnv();

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.use(helmet());

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [
      'http://localhost:5173',
    ],
    credentials: true,
  });

  const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API Berjalan di http://localhost:${port}/api`);
}
void bootstrap();
