import 'reflect-metadata';
import { AuthController } from './src/auth/auth.controller';
import { AuthService } from './src/auth/auth.service';

const paramtypes = Reflect.getMetadata(
  'design:paramtypes',
  AuthController,
  'constructor',
);
console.log('design:paramtypes of AuthController:', paramtypes);
console.log('paramtypes[0] === AuthService:', paramtypes?.[0] === AuthService);