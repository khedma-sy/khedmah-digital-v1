import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DatabasePool implements OnModuleInit {
  private readonly logger = new Logger(DatabasePool.name);
  private pool!: Pool;

  /** For testing only — creates a DatabasePool backed by an already-configured Pool. */
  static fromPool(pool: Pool): DatabasePool {
    const instance = new DatabasePool();
    (instance as unknown as { pool: Pool }).pool = pool;
    return instance;
  }

  onModuleInit(): void {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required.');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected database pool error', err.message);
    });

    this.logger.log('Database connection pool initialised.');
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
