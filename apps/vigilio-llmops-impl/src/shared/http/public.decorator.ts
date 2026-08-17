import { SetMetadata } from '@nestjs/common';
export const PUBLIC_METADATA = 'vigilio:public';
export const Public = () => SetMetadata(PUBLIC_METADATA, true);
