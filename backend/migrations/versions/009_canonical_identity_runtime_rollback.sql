DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS identity_sessions;
ALTER TABLE profiles DROP COLUMN IF EXISTS locale;
DROP TABLE IF EXISTS identity_credentials;
