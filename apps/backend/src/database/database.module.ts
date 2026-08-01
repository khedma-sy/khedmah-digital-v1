import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { DatabasePool } from './database.pool';
import { DatabaseMigrator } from './database.migrator';

@Global()
@Module({
  providers: [DatabasePool, DatabaseMigrator],
  exports: [DatabasePool]
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly pool: DatabasePool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
