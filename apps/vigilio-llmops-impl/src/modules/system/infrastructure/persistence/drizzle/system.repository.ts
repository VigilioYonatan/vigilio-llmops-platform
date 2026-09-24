import { Injectable } from '@nestjs/common';
import { config } from '../../../../../shared/config';
import type {
  SystemCapabilities,
  SystemRepository,
} from '../../../application/ports/system.port';

@Injectable()
export class SystemDrizzleRepository implements SystemRepository {
  getCapabilities(): SystemCapabilities {
    return {
      platform: 'vigilio-llmops',
      version: '1.0.0',
      self_hosted: true,
      local_passwords: true,
      facebook_login: Boolean(config.FACEBOOK_APP_ID),
      prompts: true,
      dataset_snapshots: true,
      deterministic_evaluation: true,
      rag_hybrid_pgvector: true,
    };
  }
}
