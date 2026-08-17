import { SetMetadata } from '@nestjs/common';
export const API_KEY_METADATA = 'vigilio:api-key';
export const RequireApiKey = (scope: string) =>
  SetMetadata(API_KEY_METADATA, scope);
