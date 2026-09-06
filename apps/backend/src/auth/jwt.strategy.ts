import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { AuthUser } from '@workspace/types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readJwtEnv } from '../config/jwt.config';
import { PrismaService } from '../db/prisma.service';
import { Inject } from '@nestjs/common';

export type JwtPayload = {
  sub: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const { secret } = readJwtEnv();
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

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: { id: user.role.id, name: user.role.name },
      team: user.team ? { id: user.team.id, name: user.team.name } : null,
    };
  }
}
