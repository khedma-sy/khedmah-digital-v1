#!/usr/bin/env bash
set -euo pipefail
stage_file="${1:-.github/classifieds-staging-stage}"
[[ -f "$stage_file" ]] || { echo 'Missing Classifieds Staging stage file.' >&2; exit 2; }
stage="$(tr -d '[:space:]' < "$stage_file")"
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
    echo "Invalid Classifieds Staging stage: ${stage:-<empty>}" >&2
    exit 2
    ;;
esac
printf 'stage=%s\n' "$stage"
printf 'backend_enabled=%s\n' "$backend_enabled"
printf 'frontend_enabled=%s\n' "$frontend_enabled"
printf 'migration_mode=%s\n' "$migration_mode"
printf 'migration_confirmation=%s\n' "$migration_confirmation"
