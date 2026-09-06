import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  // Global DTO validation. Note: under tsx/esbuild `design:paramtypes`
  // metadata is not emitted, so the global pipe is pass-through at runtime;
  // per-handler `validateDto(...)` pipes remain the source of truth.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  app.use(helmet());

  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
  });

  const port = config.getOrThrow<number>('app.port');
  await app.listen(port);
  console.log(`API Berjalan di http://localhost:${port}/api`);
}
void bootstrap();
