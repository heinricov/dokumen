import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@workspace/db';
import type { AuthUser } from '@workspace/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';

import { PrismaService } from '../db/prisma.service';

export type JwtPayload = {
  sub: string;
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,

    @Inject(ConfigService)
    config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('auth.jwtSecret');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      /**
       * Passport harus menolak token
       * yang sudah expired.
       */
      ignoreExpiration: false,

      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    /**
     * sub harus ada dan harus string.
     */
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    /**
     * Ambil user terbaru dari database.
     *
     * Jangan mempercayai role/status yang
     * disimpan di JWT karena role/status
     * dapat berubah setelah token dibuat.
     */
    const user = await this.prisma.db.users.findUnique({
      where: {
        id: payload.sub,
      },
      omit: {
        password: true,
      },
      include: {
        role: true,
        team: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    /**
     * Account harus ACTIVE.
     */
    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    /**
     * Jika password berubah setelah token
     * diterbitkan, token tersebut harus
     * dianggap tidak valid.
     */
    if (user.passwordChangedAt) {
      const issuedAt = payload.iat ?? 0;

      /**
       * JWT iat menggunakan Unix timestamp
       * dalam satuan detik.
       */
      const issuedAtMs = issuedAt * 1000;

      if (issuedAtMs > 0 && user.passwordChangedAt.getTime() > issuedAtMs) {
        throw new UnauthorizedException(
          'Token was issued before the last password change. Please log in again.',
        );
      }
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,

      role: {
        id: user.role.id,
        name: user.role.name,
      },

      team: user.team
        ? {
            id: user.team.id,
            name: user.team.name,
          }
        : null,
    };
  }
}
