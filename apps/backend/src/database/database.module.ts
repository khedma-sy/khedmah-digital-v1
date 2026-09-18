import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { DatabasePool } from './database.pool';
import { DatabaseMigrator } from './database.migrator';
import { RateLimitRepository } from './rate-limit.repository';

@Global()
@Module({
  providers: [DatabasePool, DatabaseMigrator, RateLimitRepository],
  exports: [DatabasePool, RateLimitRepository]
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DatabasePool) private readonly pool: DatabasePool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
