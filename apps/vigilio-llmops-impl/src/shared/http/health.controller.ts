import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../ports/sql.port';
import { Public } from './public.decorator';

@Controller('health')
export class HealthController {
  constructor(@Inject(SQL_PORT) private readonly databaseService: SqlPort) {}

  @Public()
  @Get('live')
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async readiness() {
    try {
      await this.databaseService.one('SELECT 1 AS ready');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }
  }
}
