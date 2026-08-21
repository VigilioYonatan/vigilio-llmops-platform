import { Global, Module } from '@nestjs/common';
import { SQL_PORT } from '../shared/ports/sql.port';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    DatabaseService,
    {
      provide: SQL_PORT,
      useExisting: DatabaseService,
    },
  ],
  exports: [DatabaseService, SQL_PORT],
})
export class DatabaseModule {}
