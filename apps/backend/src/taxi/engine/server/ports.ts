import type { Actor, Address, Item, Policy, Provider } from '../domain.js';

export interface SqlResult<R> { rows: R[]; rowCount: number }
export interface SqlClient {
  query<R = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<SqlResult<R>>;
}
export interface Database {
  readonly dialect: 'postgres' | 'sqlite';
  transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T>;
}
export interface IdentityPort {
  /** Resolve the existing server session and current account grants. Never read a role from the body.
   * Implementations must retain current account/grant locks until this transaction commits.
   * No fixture resolver or standalone replacement identity system is provided for production. */
  resolveLocked(client: SqlClient, sessionToken: string): Promise<Actor>;
}
export interface Restaurant {
  id: string; pickup: Address; zone: string; coverageAreas: string[];
}
export interface ReferenceSnapshot {
  policy: Policy; menu: Item[]; providers: Provider[]; restaurants: Restaurant[];
}
export interface ReferencePort {
  /** Read canonical menu, tariff and provider grants, keeping their SHARE locks until commit.
   * Repricing/eligibility writers must use the same rows and lock order.
   * Implement this against the approved platform data; test fixture references are not production data. */
  readLocked(client: SqlClient, actor: Actor): Promise<ReferenceSnapshot>;
}
export interface RuntimePorts {
  db: Database; identity: IdentityPort; references: ReferencePort;
  clock: () => number; nextId: () => string;
}
