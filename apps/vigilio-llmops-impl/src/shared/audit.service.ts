import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from './ports/sql.port';

@Injectable()
export class AuditService {
  constructor(@Inject(SQL_PORT) private readonly databaseService: SqlPort) {}

  async write(
    action: string,
    actor_id: string | null,
    organization_id: string | null,
    resource_type: string,
    resource_id: string,
    metadata: Record<string, string | number | boolean | null> = {},
  ): Promise<void> {
    await this.databaseService.rows(
      'INSERT INTO audit_events (action,actor_id,organization_id,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        action,
        actor_id,
        organization_id,
        resource_type,
        resource_id,
        JSON.stringify(metadata),
      ],
    );
  }
}
