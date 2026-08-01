import { Inject, Injectable } from '@nestjs/common';
import { DatabasePool } from '../database/database.pool';
import { Organization, OrganizationMember } from './organization.types';

@Injectable()
export class OrganizationRepository {
  constructor(@Inject(DatabasePool) private readonly db: DatabasePool) {}

  async saveOrganization(organization: Organization): Promise<void> {
    await this.db.query(
      `INSERT INTO organizations (id, name, owner_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         updated_at = EXCLUDED.updated_at`,
      [organization.id, organization.name, organization.ownerUserId, organization.createdAt, organization.updatedAt]
    );
  }

  async findOrganization(id: string): Promise<Organization | undefined> {
    const rows = await this.db.query<{
      id: string; name: string; owner_user_id: string; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, name, owner_user_id, created_at, updated_at FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.mapOrg(rows[0]) : undefined;
  }

  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    const rows = await this.db.query<{
      id: string; name: string; owner_user_id: string; created_at: Date; updated_at: Date;
    }>(
      `SELECT o.id, o.name, o.owner_user_id, o.created_at, o.updated_at
       FROM organizations o
       JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [userId]
    );
    return rows.map((r) => this.mapOrg(r));
  }

  async saveMember(member: OrganizationMember): Promise<void> {
    await this.db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [member.id, member.organizationId, member.userId, member.role, member.status, member.createdAt, member.updatedAt]
    );
  }

  async findMember(id: string): Promise<OrganizationMember | undefined> {
    const rows = await this.db.query<{
      id: string; organization_id: string; user_id: string;
      role: string; status: string; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, organization_id, user_id, role, status, created_at, updated_at
       FROM organization_members WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] ? this.mapMember(rows[0]) : undefined;
  }

  async findMemberByOrganizationAndUser(organizationId: string, userId: string): Promise<OrganizationMember | undefined> {
    const rows = await this.db.query<{
      id: string; organization_id: string; user_id: string;
      role: string; status: string; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, organization_id, user_id, role, status, created_at, updated_at
       FROM organization_members WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
      [organizationId, userId]
    );
    return rows[0] ? this.mapMember(rows[0]) : undefined;
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const rows = await this.db.query<{
      id: string; organization_id: string; user_id: string;
      role: string; status: string; created_at: Date; updated_at: Date;
    }>(
      `SELECT id, organization_id, user_id, role, status, created_at, updated_at
       FROM organization_members WHERE organization_id = $1 AND status = 'active'`,
      [organizationId]
    );
    return rows.map((r) => this.mapMember(r));
  }

  async countActiveMembers(organizationId: string): Promise<number> {
    const rows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM organization_members WHERE organization_id = $1 AND status = 'active'`,
      [organizationId]
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  private mapOrg(r: { id: string; name: string; owner_user_id: string; created_at: Date; updated_at: Date }): Organization {
    return {
      id: r.id,
      name: r.name,
      ownerUserId: r.owner_user_id,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }

  private mapMember(r: { id: string; organization_id: string; user_id: string; role: string; status: string; created_at: Date; updated_at: Date }): OrganizationMember {
    return {
      id: r.id,
      organizationId: r.organization_id,
      userId: r.user_id,
      role: r.role as OrganizationMember['role'],
      status: r.status as OrganizationMember['status'],
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString()
    };
  }
}
