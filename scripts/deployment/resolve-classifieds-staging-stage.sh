#!/usr/bin/env bash
set -euo pipefail
stage_file="${CLASSIFIEDS_STAGING_STAGE_FILE:-.github/classifieds-staging-stage}"
stage="$(tr -d '\r\n' < "$stage_file")"
case "$stage" in
  off)
    backend_enabled=false
    frontend_enabled=false
    migration_mode=off
    migration_confirmation=''
    ;;
  apply-025)
    backend_enabled=false
    frontend_enabled=false
    migration_mode=apply
    migration_confirmation='APPLY_KHEDMAH_NONPROD_025_STAGING'
    ;;
  verify-025)
    backend_enabled=false
    frontend_enabled=false
    migration_mode=verify
    migration_confirmation=''
    ;;
  backend-on)
    backend_enabled=true
    frontend_enabled=false
    migration_mode=verify
    migration_confirmation=''
    ;;
  frontend-on)
    backend_enabled=true
    frontend_enabled=true
    migration_mode=verify
    migration_confirmation=''
    ;;
  *)
    echo "Unknown Classifieds Staging rollout stage: $stage" >&2
    exit 2
    ;;
esac
printf 'stage=%s\nbackend_enabled=%s\nfrontend_enabled=%s\nmigration_mode=%s\nmigration_confirmation=%s\n' \
  "$stage" "$backend_enabled" "$frontend_enabled" "$migration_mode" "$migration_confirmation"
