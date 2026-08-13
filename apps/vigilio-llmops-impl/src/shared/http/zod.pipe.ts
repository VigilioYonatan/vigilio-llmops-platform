import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { ZodType } from 'zod';
@Injectable()
export class ZodPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    return result.data;
  }
}
