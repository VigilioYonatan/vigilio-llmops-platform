import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from '../config';
import { HttpErrorFilter } from './error.filter';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

export function configureHttpApp(app: INestApplication): void {
  const instance = app.getHttpAdapter().getInstance() as {
    set?: (setting: string, value: unknown) => void;
  };
  instance.set?.('trust proxy', 1);

  const allowedOrigins = [
    config.APP_ORIGIN,
    config.WEB_ORIGIN,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(
    (
      req: { method: string; headers: { origin?: string } },
      res: { status: (code: number) => { json: (body: unknown) => void } },
      next: () => void,
    ) => {
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
        req.headers.origin &&
        !allowedOrigins.includes(req.headers.origin)
      ) {
        res.status(403).json({
          error: {
            code: 'ORIGIN_DENIED',
            message: 'Origin not allowed',
            status: 403,
          },
        });
        return;
      }
      next();
    },
  );
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
      'Authorization',
      'X-Correlation-ID',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Correlation-ID'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
}
