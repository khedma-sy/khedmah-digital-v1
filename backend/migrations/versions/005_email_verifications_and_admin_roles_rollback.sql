-- Migration 005 Rollback: Drop email verifications and admin roles
DROP TABLE IF EXISTS admin_roles;
DROP TABLE IF EXISTS email_verifications;
