-- Mission 010 approved organizations foundation entities only.
-- Reuses audit_logs from Mission 009 for organization change audit events.

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL CHECK (status IN ('active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX organizations_owner_user_id_idx ON organizations(owner_user_id);
CREATE INDEX organization_members_organization_id_idx ON organization_members(organization_id);
CREATE INDEX organization_members_user_id_idx ON organization_members(user_id);
