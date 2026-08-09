import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

function resolveRequestId(req: Request, res: Response): string {
  const existing = res.getHeader('x-correlation-id');
  if (typeof existing === 'string' && existing.length > 0) return existing;
  const incoming = req.headers['x-correlation-id'];
  const id =
    typeof incoming === 'string' && /^[a-zA-Z0-9._-]{8,128}$/.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader('X-Correlation-ID', id);
  return id;
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = resolveRequestId(request, response);

    if (error instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          status: HttpStatus.BAD_REQUEST,
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          request_id: requestId,
        },
      });
      return;
    }

    const pgCode =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : null;
    if (pgCode === '23505') {
      response.status(HttpStatus.CONFLICT).json({
        error: {
          code: 'CONFLICT',
          message: 'Resource already exists or conflicts with current state',
          status: HttpStatus.CONFLICT,
          request_id: requestId,
        },
      });
      return;
    }
    if (pgCode === '23503') {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'INVALID_REFERENCE',
          message: 'Referenced resource does not exist',
          status: HttpStatus.BAD_REQUEST,
          request_id: requestId,
        },
      });
      return;
    }

    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const details = error instanceof HttpException ? error.getResponse() : null;

    let code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    let message: unknown =
      status >= 500 ? 'Internal server error' : 'Request failed';
    let issues: unknown;

    if (typeof details === 'string') {
      message = details;
    } else if (details && typeof details === 'object') {
      const obj = details as Record<string, unknown>;
      if (typeof obj.code === 'string') code = obj.code;
      if ('issues' in obj && Array.isArray(obj.issues)) {
        issues = obj.issues;
        if (message === 'Request failed') message = 'Validation failed';
      }
      if ('message' in obj && obj.message !== undefined) {
        message = obj.message;
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
        status,
        ...(issues ? { issues } : {}),
        request_id: requestId,
      },
    });
  }
}
