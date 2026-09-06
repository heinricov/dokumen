import { SetMetadata } from '@nestjs/common';

export type RoleName = 'ADMIN' | 'MODERATOR' | 'USER';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
