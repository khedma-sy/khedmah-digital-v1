import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { DatabasePool } from './database.pool';
import { DatabaseMigrator } from './database.migrator';
import { RateLimitRepository } from './rate-limit.repository';

@Global()
@Module({
  providers: [DatabasePool, DatabaseMigrator, RateLimitRepository],
  exports: [DatabasePool, RateLimitRepository]
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly pool: DatabasePool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
