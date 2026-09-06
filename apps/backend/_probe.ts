import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AuthController } from './src/auth/auth.controller';
import { AuthService } from './src/auth/auth.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const auth = app.get(AuthController);
  console.log('own props:', Object.getOwnPropertyNames(auth));
  console.log('keys:', Object.keys(auth));
  console.log(
    'authService in instance:',
    (auth as never as Record<string, unknown>).authService,
  );
  console.log('proto has property?', 'authService' in auth);
  console.log('service token resolves:', !!app.get(AuthService));
  await app.close();
}

void main();
