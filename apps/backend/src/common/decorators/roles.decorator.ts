import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@workspace/types';

export type { RoleName } from '@workspace/types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
