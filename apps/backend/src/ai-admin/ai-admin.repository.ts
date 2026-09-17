import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import type { AiAdminControlState } from './ai-admin.types';

type SettingsRow = {
  enabled: boolean;
  operating_mode: 'supervised';
  monthly_budget_usd_cents: number;
  updated_by_user_id: string | null;
  updated_at: Date | string;
};

@Injectable()
export class AiAdminRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async getControlState(): Promise<AiAdminControlState> {
    const rows = await this.db.query<SettingsRow & Record<string, unknown>>(
      `SELECT enabled, operating_mode, monthly_budget_usd_cents, updated_by_user_id, updated_at
       FROM ai_admin_settings
       WHERE setting_key = 'global'`
    );
    const row = rows[0];
    if (!row) throw new Error('AI Admin control state is not initialized.');
    return this.map(row);
  }

  async setEnabled(enabled: boolean, actorUserId: string): Promise<AiAdminControlState> {
    return this.db.transaction(async (client) => {
      const currentResult = await client.query<SettingsRow>(
        `SELECT enabled, operating_mode, monthly_budget_usd_cents, updated_by_user_id, updated_at
         FROM ai_admin_settings
         WHERE setting_key = 'global'
         FOR UPDATE`
      );
      const current = currentResult.rows[0];
      if (!current) throw new Error('AI Admin control state is not initialized.');

      const nextResult = await client.query<SettingsRow>(
        `UPDATE ai_admin_settings
         SET enabled = $1, updated_by_user_id = $2, updated_at = NOW()
         WHERE setting_key = 'global'
         RETURNING enabled, operating_mode, monthly_budget_usd_cents, updated_by_user_id, updated_at`,
        [enabled, actorUserId]
      );
      const next = nextResult.rows[0];
      if (!next) throw new Error('AI Admin control state could not be updated.');

      if (current.enabled !== next.enabled) {
        await client.query(
          `INSERT INTO ai_admin_audit_events (actor_user_id, action, previous_enabled, next_enabled)
           VALUES ($1, $2, $3, $4)`,
          [actorUserId, next.enabled ? 'enabled' : 'disabled', current.enabled, next.enabled]
        );
      }

      return this.map(next);
    });
  }

  private map(row: SettingsRow): AiAdminControlState {
    return {
      enabled: row.enabled,
      operatingMode: row.operating_mode,
      monthlyBudgetUsdCents: row.monthly_budget_usd_cents,
      updatedByUserId: row.updated_by_user_id ?? undefined,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
}
