import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AccountStatus } from '@workspace/db';
import type { AuthUser } from '@workspace/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../db/prisma.service';

export type JwtPayload = {
  sub: string;
  iat?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('auth.jwtSecret');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.db.users.findUnique({
      where: { id: payload.sub },
      omit: { password: true },
      include: { role: true, team: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    if (user.passwordChangedAt) {
      const requestedAt = (payload.iat ?? 0) * 1000;
      if (requestedAt > 0 && user.passwordChangedAt.getTime() > requestedAt) {
        throw new UnauthorizedException(
          'Token was issued before the last password change. Please log in again.',
        );
      }
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: { id: user.role.id, name: user.role.name },
      team: user.team ? { id: user.team.id, name: user.team.name } : null,
    };
  }
}
