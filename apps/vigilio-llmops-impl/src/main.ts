import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import { runOutbox } from './async/outbox';
import { platformSetup } from './async/platform-setup';
import { runWorker } from './async/worker';
import { migrate } from './database/migrate';
import { startTelemetry } from './observability/telemetry';
import { config, isProduction } from './shared/config';
import { configureHttpApp } from './shared/http/configure-app';

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled Rejection at:', reason, 'Process');
});
process.on('uncaughtException', (err) => {
  Logger.error('Uncaught Exception:', err, 'Process');
});

async function bootstrap(): Promise<void> {
  const role = process.argv[2] ?? 'api';
  const sdk = startTelemetry(role);

  if (role !== 'api') {
    try {
      if (role === 'migration') {
        await migrate();
        return;
      }
      if (role === 'platform-setup') {
        await platformSetup();
        return;
      }
      if (role === 'outbox') {
        await runOutbox();
        return;
      }
      if (role === 'worker') {
        await runWorker();
        return;
      }
      throw new Error(`Unknown role ${role}`);
    } finally {
      await sdk?.shutdown().catch(() => undefined);
    }
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  configureHttpApp(app);
  app.enableShutdownHooks();

  const openapi = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Vigilio LLMOps Platform API')
      .setDescription(
        'Self-hosted enterprise LLMOps platform API specification',
      )
      .setVersion('1.0.0')
      .addCookieAuth()
      .addBearerAuth()
      .build(),
  );

  const expressApp = app.getHttpAdapter().getInstance() as {
    get: (
      path: string,
      handler: (
        req: unknown,
        res: {
          setHeader: (name: string, value: string) => void;
          json: (value: unknown) => void;
        },
      ) => void,
    ) => void;
  };

  expressApp.get('/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
    res.json(openapi);
  });
  expressApp.get('/api/v1/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
    res.json(openapi);
  });

  if (!isProduction || process.env.ENABLE_SCALAR === 'true') {
    SwaggerModule.setup('api/docs', app, openapi, {
      swaggerOptions: { persistAuthorization: false },
    });

    const scalarHandler = apiReference({
      spec: {
        content: openapi,
      },
      pageTitle: 'Vigilio LLMOps Platform API Reference',
      theme: 'purple',
      withDefaultFonts: false,
      telemetry: false,
      agent: { disabled: true },
      showDeveloperTools: 'never',
      hideClientButton: true,
      persistAuth: false,
    });

    app.use('/reference', scalarHandler);
    app.use('/api/reference', scalarHandler);
  }

  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`Vigilio LLMOps API listening on :${config.PORT}`, 'Bootstrap');
  process.once('SIGTERM', () => {
    void sdk?.shutdown();
  });
}

void bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Fatal error');
  process.exitCode = 1;
});
