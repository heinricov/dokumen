import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { AccountStatus, Prisma, type Users } from '@workspace/db';
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

/**
 * Digunakan untuk bcrypt.compare() ketika
 * email tidak ditemukan.
 *
 * Tujuannya mengurangi perbedaan timing antara:
 *
 * - email tidak ditemukan
 * - email ditemukan tetapi password salah
 */
const DUMMY_PASSWORD = 'dummy-password-for-timing-equalization';

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

type AuthUserRow = Omit<Users, 'password'> & {
  role: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
  } | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private dummyHashPromise: Promise<string> | undefined;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,

    @Inject(JwtService)
    private readonly jwt: JwtService,

    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  /**
   * Register
   */
  async register(input: RegisterInput): Promise<RegisterResponse> {
    const email = this.normalizeEmail(input.email);

    const roleId = await this.resolveDefaultRoleId();

    /**
     * Validasi team sebelum membuat user.
     */
    if (input.teamId) {
      await this.assertTeamExists(input.teamId);
    }

    const password = await bcrypt.hash(input.password, SALT_ROUNDS);

    try {
      const user = await this.prisma.db.users.create({
        data: {
          email,
          username: this.normalizeUsername(input.username),
          password,
          passwordChangedAt: secondPrecision(),
          roleId,
          teamId: input.teamId,
        },
        omit: {
          password: true,
        },
        include: {
          role: true,
          team: true,
        },
      });

      return {
        user: this.toAuthUser(user),
      };
    } catch (error) {
      /**
       * Tetap tangani race condition pada unique email.
       *
       * Dua request register dengan email yang sama
       * dapat lolos dari pengecekan awal secara bersamaan,
       * tetapi database tetap menjadi sumber kebenaran.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }

      throw error;
    }
  }

  /**
   * Login
   */
  async login(input: LoginInput): Promise<LoginResponse> {
    const email = this.normalizeEmail(input.email);

    const full = await this.prisma.db.users.findUnique({
      where: {
        email,
      },
    });

    /**
     * Selalu jalankan bcrypt compare.
     *
     * Ini mengurangi perbedaan timing antara:
     *
     * - email tidak ditemukan
     * - email ditemukan tetapi password salah
     */
    const passwordValid = await bcrypt.compare(
      input.password,
      full ? full.password : await this.getDummyHash(),
    );

    if (!full || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    /**
     * Account status harus ACTIVE.
     */
    if (full.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    const user = await this.fetchUser(full.id);

    const accessToken = this.signAccessToken(user.id);

    const refreshToken = await this.createRefreshToken(user.id);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token
   *
   * Refresh token bersifat one-time-use.
   */
  async refresh(input: RefreshTokenInput): Promise<RefreshTokenResponse> {
    const tokenHash = hashToken(input.refreshToken);

    const token = await this.prisma.db.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    /**
     * Expired token bukan reuse/theft.
     *
     * Jangan revoke semua session hanya
     * karena user mengirim token yang expired.
     */
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    /**
     * Atomic claim.
     *
     * Hanya satu request yang boleh
     * menggunakan refresh token tersebut.
     */
    const claim = await this.prisma.db.refreshToken.updateMany({
      where: {
        id: token.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    /**
     * count === 0 berarti token sudah
     * digunakan sebelumnya.
     */
    if (claim.count === 0) {
      await this.revokeAllTokens(token.userId);

      throw new UnauthorizedException(
        'Refresh token has been reused. All sessions have been revoked.',
      );
    }

    /**
     * Pastikan user masih ada dan aktif.
     */
    const user = await this.fetchUser(token.userId);

    const accessToken = this.signAccessToken(user.id);

    const refreshToken = await this.createRefreshToken(user.id);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Logout
   *
   * Hanya refresh token milik user tersebut
   * yang boleh dicabut.
   */
  async logout(input: LogoutInput, userId: string): Promise<LogoutResponse> {
    const tokenHash = hashToken(input.refreshToken);

    await this.prisma.db.refreshToken.updateMany({
      where: {
        tokenHash,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Logged out successfully.',
    };
  }

  /**
   * Forgot password
   *
   * Response selalu sama agar email tidak
   * dapat digunakan untuk user enumeration.
   */
  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<ForgotPasswordResponse> {
    const email = this.normalizeEmail(input.email);

    const user = await this.prisma.db.users.findUnique({
      where: {
        email,
      },
    });

    /**
     * Jangan memberitahu apakah email
     * terdaftar atau tidak.
     */
    if (user) {
      const resetToken = generateResetToken();

      const resetTokenTtlMs = this.config.getOrThrow<number>(
        'auth.resetTokenTtlMs',
      );

      const now = new Date();

      await this.prisma.db.$transaction([
        /**
         * Bersihkan reset record lama.
         */
        this.prisma.db.passwordReset.deleteMany({
          where: {
            userId: user.id,
            OR: [
              {
                usedAt: {
                  not: null,
                },
              },
              {
                expiresAt: {
                  lt: now,
                },
              },
            ],
          },
        }),

        /**
         * Invalidasi reset token aktif
         * sebelumnya.
         */
        this.prisma.db.passwordReset.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
          },
          data: {
            usedAt: now,
          },
        }),

        /**
         * Buat reset token baru.
         *
         * Yang disimpan di DB hanya hash.
         *
         * Plaintext reset token TIDAK pernah
         * ditulis ke log/console.
         */
        this.prisma.db.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(resetToken),
            expiresAt: new Date(Date.now() + resetTokenTtlMs),
          },
        }),
      ]);

      /**
       * Reset token nantinya dikirim melalui
       * email provider.
       *
       * Jangan pernah melakukan:
       *
       * console.log(resetToken)
       *
       * atau:
       *
       * logger.log(resetToken)
       *
       * karena token tersebut dapat digunakan
       * untuk mengambil alih proses reset password.
       *
       * Saat ini email provider belum digunakan,
       * sehingga token hanya dibuat dan disimpan
       * dalam bentuk hash.
       */
      void resetToken;
    }

    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  /**
   * Reset password
   *
   * Reset token hanya dapat digunakan sekali.
   */
  async resetPassword(
    input: ResetPasswordInput,
  ): Promise<ResetPasswordResponse> {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const tokenHash = hashToken(input.token);

    /**
     * Hash password sebelum transaction
     * untuk mengurangi waktu transaction.
     */
    const newHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    await this.prisma.db.$transaction(async (tx) => {
      const now = new Date();

      /**
       * Cari reset token yang:
       *
       * - hash cocok
       * - belum digunakan
       * - belum expired
       */
      const record = await tx.passwordReset.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
      });

      if (!record) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      /**
       * Atomic claim.
       *
       * Dua request reset bersamaan tidak
       * boleh sama-sama berhasil.
       */
      const claim = await tx.passwordReset.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      if (claim.count === 0) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      /**
       * Update password.
       */
      await tx.users.update({
        where: {
          id: record.userId,
        },
        data: {
          password: newHash,
          passwordChangedAt: secondPrecision(),
        },
      });

      /**
       * Password berubah →
       * semua refresh token lama dicabut.
       */
      await tx.refreshToken.updateMany({
        where: {
          userId: record.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });
    }, TRANSACTION_OPTIONS);

    return {
      message: 'Password has been reset successfully.',
    };
  }

  /**
   * Resolve default USER role.
   */
  private async resolveDefaultRoleId(): Promise<string> {
    const role = await this.prisma.db.roles.findUnique({
      where: {
        name: ROLE_NAMES.USER,
      },
    });

    if (!role) {
      throw new BadRequestException(
        `Default role "${ROLE_NAMES.USER}" is not configured.`,
      );
    }

    return role.id;
  }

  /**
   * Validate team.
   */
  private async assertTeamExists(teamId: string): Promise<void> {
    const team = await this.prisma.db.teams.findUnique({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      throw new BadRequestException('Invalid team');
    }
  }

  /**
   * Fetch authenticated user.
   */
  private async fetchUser(id: string): Promise<AuthUser> {
    const user = await this.prisma.db.users.findUnique({
      where: {
        id,
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
      throw new UnauthorizedException('User no longer exists');
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    return this.toAuthUser(user);
  }

  /**
   * Create refresh token.
   *
   * Hanya hash token yang disimpan ke DB.
   */
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

  /**
   * Revoke all refresh tokens.
   */
  private async revokeAllTokens(userId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Dummy bcrypt hash.
   */
  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= bcrypt.hash(DUMMY_PASSWORD, SALT_ROUNDS);

    return this.dummyHashPromise;
  }

  /**
   * Sign access token.
   */
  private signAccessToken(userId: string): string {
    const accessTokenTtl = this.config.getOrThrow<JwtSignOptions['expiresIn']>(
      'auth.accessTokenTtl',
    );

    return this.jwt.sign(
      {
        sub: userId,
      },
      {
        expiresIn: accessTokenTtl,
      },
    );
  }

  /**
   * Normalize email.
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Normalize username.
   */
  private normalizeUsername(username?: string | null): string | null {
    if (username === undefined || username === null) {
      return null;
    }

    const normalized = username.trim();

    return normalized.length > 0 ? normalized : null;
  }

  /**
   * Convert Prisma user menjadi
   * public AuthUser.
   *
   * Password tidak pernah dikembalikan.
   */
  private toAuthUser(user: AuthUserRow): AuthUser {
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
