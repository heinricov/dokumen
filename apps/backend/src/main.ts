import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    /**
     * Use Nest's built-in logger
     * instead of console.log.
     */
    bufferLogs: true,
  });

  const logger = new Logger('Bootstrap');

  const config = app.get(ConfigService);

  /**
   * ==========================================
   * GLOBAL VALIDATION
   * ==========================================
   *
   * DTO-specific validateDto(...) pipes
   * remain in place throughout the project.
   *
   * This global pipe provides an additional
   * safety layer.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      /**
       * Remove properties that do not exist
       * in the DTO.
       */
      whitelist: true,

      /**
       * Do not silently accept unexpected
       * properties.
       */
      forbidNonWhitelisted: true,

      /**
       * Transform primitive query/param values
       * according to DTO metadata where possible.
       */
      transform: true,

      /**
       * Return all validation errors.
       */
      stopAtFirstError: false,

      /**
       * Do not expose the complete internal
       * target object in validation errors.
       */
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  /**
   * ==========================================
   * API PREFIX
   * ==========================================
   */
  app.setGlobalPrefix('api');

  /**
   * ==========================================
   * SHUTDOWN
   * ==========================================
   */
  app.enableShutdownHooks();

  /**
   * ==========================================
   * SECURITY HEADERS
   * ==========================================
   *
   * Helmet sets a collection of security-related
   * HTTP response headers.
   */
  app.use(
    helmet({
      /**
       * The API is not serving browser HTML,
       * therefore CSP is generally unnecessary
       * at this API layer and can interfere with
       * documentation/frontend integrations.
       */
      contentSecurityPolicy: false,

      /**
       * Prevent MIME sniffing.
       */
      noSniff: true,

      /**
       * Prevent clickjacking.
       */
      frameguard: {
        action: 'deny',
      },

      /**
       * Hide implementation details.
       */
      hidePoweredBy: true,

      /**
       * Referrer policy.
       */
      referrerPolicy: {
        policy: 'no-referrer',
      },

      /**
       * Cross-Origin-Resource-Policy.
       */
      crossOriginResourcePolicy: {
        policy: 'same-site',
      },
    }),
  );

  /**
   * ==========================================
   * CORS
   * ==========================================
   */
  const corsOrigins = config.getOrThrow<string[]>('app.corsOrigins');

  app.enableCors({
    /**
     * Explicit allowlist.
     *
     * Do NOT use:
     *
     * origin: true
     *
     * or:
     *
     * origin: '*'
     *
     * when credentials are enabled.
     */
    origin: corsOrigins,

    /**
     * Keep credentials enabled because
     * authenticated frontend requests may
     * require them.
     */
    credentials: true,

    /**
     * Explicit methods instead of relying
     * entirely on defaults.
     */
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    /**
     * Explicitly allow the standard headers
     * used by the API.
     */
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Origin',
      'X-Requested-With',
    ],

    /**
     * Cache preflight response.
     */
    maxAge: 86_400,
  });

  /**
   * ==========================================
   * PORT
   * ==========================================
   */
  const port = config.getOrThrow<number>('app.port');

  /**
   * ==========================================
   * START SERVER
   * ==========================================
   */
  await app.listen(port);

  logger.log(`API running on http://localhost:${port}/api`);

  logger.log(`Environment: ${config.getOrThrow<string>('app.nodeEnv')}`);

  logger.log(`CORS origins: ${corsOrigins.join(', ')}`);
}

void bootstrap();
