import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Users } from '@workspace/db';
import type {
  AuthUser,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  LoginInput,
  LoginResponse,
  LogoutInput,
  LogoutResponse,
  RefreshTokenInput,
  RefreshTokenResponse,
  RegisterInput,
  RegisterResponse,
  ResetPasswordInput,
  ResetPasswordResponse,
} from '@workspace/types';
import bcrypt from 'bcryptjs';
import { readJwtEnv } from '../config/jwt.config';
import { PrismaService } from '../db/prisma.service';
import { generateRefreshToken, generateResetToken, hashToken } from './tokens';

const SALT_ROUNDS = 10;
const DEFAULT_ROLE_NAME = 'USER';

type AuthUserRow = Omit<Users, 'password'> & {
  role: { id: string; name: string };
  team: { id: string; name: string } | null;
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

    const roleId = await this.resolveDefaultRoleId();
    if (input.teamId) {
      await this.assertTeamExists(input.teamId);
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

    const user = await this.fetchUser(full.id);
    const accessToken = this.signAccessToken(user.id);
    const refreshToken = await this.createRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  }

  async refresh(input: RefreshTokenInput): Promise<RefreshTokenResponse> {
    const tokenHash = hashToken(input.refreshToken);
    const token = await this.prisma.db.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (token.revokedAt) {
      await this.revokeAllTokens(token.userId);
      throw new UnauthorizedException(
        'Refresh token has been reused. All sessions have been revoked.',
      );
    }

    if (token.expiresAt.getTime() <= Date.now()) {
      await this.revokeAllTokens(token.userId);
      throw new UnauthorizedException('Refresh token has expired');
    }

    await this.prisma.db.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.fetchUser(token.userId);
    const accessToken = this.signAccessToken(user.id);
    const refreshToken = await this.createRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  }

  async logout(input: LogoutInput): Promise<LogoutResponse> {
    const tokenHash = hashToken(input.refreshToken);
    await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logged out successfully.' };
  }

  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<ForgotPasswordResponse> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.db.users.findUnique({ where: { email } });

    if (user) {
      const resetToken = generateResetToken();
      const { resetExpiresInMs } = readJwtEnv();

      await this.prisma.db.$transaction([
        this.prisma.db.passwordReset.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.db.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(resetToken),
            expiresAt: new Date(Date.now() + resetExpiresInMs),
          },
        }),
      ]);

      // Dev convenience: no email transport is configured yet, so surface the
      // reset token in the server logs instead of a mailer.
      console.log(`[dev] Password reset token for ${email}: ${resetToken}`);
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

    const tokenHash = hashToken(input.token);
    const record = await this.prisma.db.passwordReset.findFirst({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    await this.prisma.db.$transaction([
      this.prisma.db.users.update({
        where: { id: record.userId },
        data: { password: newHash },
      }),
      this.prisma.db.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.db.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password has been reset successfully.' };
  }

  private async resolveDefaultRoleId(): Promise<string> {
    const role = await this.prisma.db.roles.findUnique({
      where: { name: DEFAULT_ROLE_NAME },
    });
    if (!role) {
      throw new BadRequestException(
        `Default role "${DEFAULT_ROLE_NAME}" is not configured.`,
      );
    }
    return role.id;
  }

  private async assertTeamExists(teamId: string): Promise<void> {
    const team = await this.prisma.db.teams.findUnique({
      where: { id: teamId },
    });
    if (!team) {
      throw new BadRequestException('Invalid team');
    }
  }

  private async fetchUser(id: string): Promise<AuthUser> {
    const user = await this.prisma.db.users.findUnique({
      where: { id },
      omit: { password: true },
      include: { role: true, team: true },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return this.toAuthUser(user);
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const refreshToken = generateRefreshToken();
    const { refreshExpiresInMs } = readJwtEnv();

    await this.prisma.db.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshExpiresInMs),
      },
    });

    return refreshToken;
  }

  private async revokeAllTokens(userId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(userId: string): string {
    const { accessExpiresIn } = readJwtEnv();
    return this.jwt.sign({ sub: userId }, { expiresIn: accessExpiresIn });
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
}
