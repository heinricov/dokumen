import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { Roles, Teams, Users } from '@workspace/db';
import type {
  AuthUser,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  LoginInput,
  LoginResponse,
  RegisterInput,
  RegisterResponse,
  ResetPasswordInput,
  ResetPasswordResponse,
} from '@workspace/types';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../db/prisma.service';

const SALT_ROUNDS = 10;
const DEFAULT_ROLE_NAME = 'user';

const ACCESS_TOKEN_TTL = (process.env.JWT_EXPIRES_IN ??
  '7d') as JwtSignOptions['expiresIn'];
const REFRESH_TOKEN_TTL = (process.env.JWT_REFRESH_EXPIRES_IN ??
  '30d') as JwtSignOptions['expiresIn'];

type AuthUserRow = Omit<Users, 'password'> & {
  role: Roles;
  team: Teams | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResponse> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.db.users.findUnique({
      where: { email },
    });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const roleId = await this.resolveRoleId(input.roleId);
    if (input.teamId) {
      const team = await this.prisma.db.teams.findUnique({
        where: { id: input.teamId },
      });
      if (!team) {
        throw new BadRequestException('Invalid team');
      }
    }

    const user = await this.prisma.db.users.create({
      data: {
        email,
        username: input.username,
        password: await bcrypt.hash(input.password, SALT_ROUNDS),
        roleId,
        teamId: input.teamId,
      },
      omit: { password: true },
      include: { role: true, team: true },
    });

    return { user: this.toAuthUser(user) };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const email = input.email.toLowerCase();
    const full = await this.prisma.db.users.findUnique({ where: { email } });
    if (!full || !(await bcrypt.compare(input.password, full.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.db.users.findUnique({
      where: { id: full.id },
      omit: { password: true },
      include: { role: true, team: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, type: 'access' },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: REFRESH_TOKEN_TTL },
    );

    return { user: this.toAuthUser(user), accessToken, refreshToken };
  }

  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<ForgotPasswordResponse> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.db.users.findUnique({ where: { email } });
    if (user) {
      this.jwt.sign({ sub: user.id, type: 'reset' }, { expiresIn: '15m' });
    }
    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  async resetPassword(
    input: ResetPasswordInput,
  ): Promise<ResetPasswordResponse> {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    let sub = '';
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(input.token)).sub;
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.prisma.db.users.update({
      where: { id: sub },
      data: { password: await bcrypt.hash(input.password, SALT_ROUNDS) },
    });

    return { message: 'Password has been reset successfully.' };
  }

  async me(authorization?: string): Promise<AuthUser> {
    const token = this.extractToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let sub = '';
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.db.users.findUnique({
      where: { id: sub },
      omit: { password: true },
      include: { role: true, team: true },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.toAuthUser(user);
  }

  private async resolveRoleId(roleId?: string): Promise<string> {
    if (roleId) {
      const role = await this.prisma.db.roles.findUnique({
        where: { id: roleId },
      });
      if (!role) {
        throw new BadRequestException('Invalid role');
      }
      return roleId;
    }

    const role = await this.prisma.db.roles.findFirst();
    if (role) {
      return role.id;
    }

    return (
      await this.prisma.db.roles.create({ data: { name: DEFAULT_ROLE_NAME } })
    ).id;
  }

  private toAuthUser(user: AuthUserRow): AuthUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: { id: user.role.id, name: user.role.name },
      team: user.team ? { id: user.team.id, name: user.team.name } : null,
    };
  }

  private extractToken(authorization?: string): string | null {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return null;
    }
    return authorization.slice('Bearer '.length);
  }
}
