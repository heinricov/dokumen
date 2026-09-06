import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { AccountStatus, type Users } from '@workspace/db';
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
import { ROLE_NAMES } from '@workspace/types';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../db/prisma.service';
import { secondPrecision } from '../common/utils/time';
import { generateRefreshToken, generateResetToken, hashToken } from './tokens';

const SALT_ROUNDS = 10;
const DUMMY_PASSWORD = 'dummy-password-for-timing-equalization';

type AuthUserRow = Omit<Users, 'password'> & {
  role: { id: string; name: string };
  team: { id: string; name: string } | null;
};

@Injectable()
export class AuthService {
  private dummyHashPromise: Promise<string> | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
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
        passwordChangedAt: secondPrecision(),
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

    // Always run a bcrypt comparison so timing does not reveal whether the
    // account exists (user enumeration mitigation).
    const passwordValid = await bcrypt.compare(
      input.password,
      full ? full.password : await this.getDummyHash(),
    );

    if (!full || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (full.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    const user = await this.fetchUser(full.id);
    const accessToken = this.signAccessToken(user.id);
    const refreshToken = await this.createRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  }

  async refresh(input: RefreshTokenInput): Promise<RefreshTokenResponse> {
    const tokenHash = hashToken(input.refreshToken);
    const token = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // A merely expired token is rejected as expired — it is NOT treated as
    // reuse/theft, so we must not revoke the whole session family for it.
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Atomic claim: only one concurrent request can rotate a given token.
    // If the claim fails, the token was already consumed (replay/reuse/theft).
    const claim = await this.prisma.db.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claim.count === 0) {
      await this.revokeAllTokens(token.userId);
      throw new UnauthorizedException(
        'Refresh token has been reused. All sessions have been revoked.',
      );
    }

    const user = await this.fetchUser(token.userId);
    const accessToken = this.signAccessToken(user.id);
    const refreshToken = await this.createRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  }

  async logout(input: LogoutInput, userId: string): Promise<LogoutResponse> {
    const tokenHash = hashToken(input.refreshToken);
    // Only the logged-in user may revoke their own session.
    await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
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
      const resetTokenTtlMs = this.config.getOrThrow<number>(
        'auth.resetTokenTtlMs',
      );

      await this.prisma.db.$transaction([
        // Clean up consumed/expired reset records for this account.
        this.prisma.db.passwordReset.deleteMany({
          where: {
            userId: user.id,
            OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
          },
        }),
        // Invalidate any previously issued but still-valid reset tokens.
        this.prisma.db.passwordReset.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.db.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(resetToken),
            expiresAt: new Date(Date.now() + resetTokenTtlMs),
          },
        }),
      ]);

      // Dev convenience: no email transport is configured yet, so surface the
      // reset token in the server logs only in non-production environments.
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[dev] Password reset token for ${email}: ${resetToken}`);
      }
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
        data: { password: newHash, passwordChangedAt: secondPrecision() },
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
      where: { name: ROLE_NAMES.USER },
    });
    if (!role) {
      throw new BadRequestException(
        `Default role "${ROLE_NAMES.USER}" is not configured.`,
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
    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }
    return this.toAuthUser(user);
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const refreshToken = generateRefreshToken();
    const refreshTokenTtlMs = this.config.getOrThrow<number>(
      'auth.refreshTokenTtlMs',
    );

    await this.prisma.db.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs),
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

  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= bcrypt.hash(DUMMY_PASSWORD, SALT_ROUNDS);
    return this.dummyHashPromise;
  }

  private signAccessToken(userId: string): string {
    const accessTokenTtl = this.config.getOrThrow<JwtSignOptions['expiresIn']>(
      'auth.accessTokenTtl',
    );
    return this.jwt.sign({ sub: userId }, { expiresIn: accessTokenTtl });
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
