import { randomUUID } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string | undefined>;
    }>();
    const res = context.switchToHttp().getResponse<{
      statusCode: number;
      setHeader: (name: string, value: string) => void;
    }>();
    const incoming = req.headers['x-correlation-id'];
    const requestId =
      typeof incoming === 'string' && /^[a-zA-Z0-9._-]{8,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('X-Correlation-ID', requestId);
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            JSON.stringify({
              request_id: requestId,
              method: req.method,
              path: req.path,
              status: res.statusCode,
              duration_ms: Date.now() - started,
            }),
          ),
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.logger.warn(
            JSON.stringify({
              request_id: requestId,
              method: req.method,
              path: req.path,
              status,
              duration_ms: Date.now() - started,
            }),
          );
        },
      }),
    );
  }
}
