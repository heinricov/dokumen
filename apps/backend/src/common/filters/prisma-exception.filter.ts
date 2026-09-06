import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@workspace/db';

@Catch(Prisma.PrismaClientKnownRequestError)
@Injectable()
export class PrismaExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();

    const mapped = this.mapException(exception);

    /**
     * Known Prisma error yang dapat
     * dipetakan menjadi HTTP response.
     */
    if (mapped) {
      this.logger.warn(
        `Prisma ${exception.code} mapped to HTTP ${mapped.getStatus()}`,
      );

      response.status(mapped.getStatus()).json(mapped.getResponse());

      return;
    }

    /**
     * Jangan kirim exception.message Prisma
     * kepada client.
     *
     * Error detail dapat berisi:
     * - table name
     * - column name
     * - constraint
     * - query information
     * - database information
     */
    this.logger.error(
      `Unhandled Prisma error ${exception.code}: ${exception.message}`,
      exception.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  /**
   * Map Prisma error menjadi
   * NestJS HttpException.
   */
  private mapException(
    exception: Prisma.PrismaClientKnownRequestError,
  ): HttpException | null {
    switch (exception.code) {
      /**
       * Unique constraint.
       *
       * Contoh:
       * - email sudah digunakan
       * - role name sudah ada
       * - team name sudah ada
       */
      case 'P2002':
        return new ConflictException('Resource already exists.');

      /**
       * Record yang diminta tidak ditemukan.
       */
      case 'P2025':
        return new NotFoundException('Resource not found.');

      /**
       * Foreign key constraint.
       */
      case 'P2003':
        return new ConflictException(
          'The operation violates a dependency constraint.',
        );

      /**
       * Transaction conflict.
       *
       * Sangat relevan dengan transaction
       * SERIALIZABLE pada UsersService.
       */
      case 'P2034':
        return new ConflictException(
          'The request conflicted with a concurrent operation. Please retry.',
        );

      default:
        return null;
    }
  }
}
