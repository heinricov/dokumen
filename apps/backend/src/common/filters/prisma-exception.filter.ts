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

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let mapped: HttpException | null = null;

    switch (exception.code) {
      case 'P2002':
        mapped = new ConflictException('Resource already exists');
        break;
      case 'P2025':
        mapped = new NotFoundException('Resource not found');
        break;
      case 'P2003':
        mapped = new ConflictException(
          'The operation violates a dependency constraint',
        );
        break;
      default:
        break;
    }

    if (mapped) {
      this.logger.warn(
        `Prisma error ${exception.code} mapped to HTTP ${mapped.getStatus()}`,
      );
      const status = mapped.getStatus();
      const body = mapped.getResponse();
      response.status(status).json(body);
      return;
    }

    this.logger.error(
      `Unmapped Prisma error ${exception.code}: ${exception.message}`,
      exception.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
