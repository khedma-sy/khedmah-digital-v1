#!/usr/bin/env bash
set -euo pipefail

mode="${1:-debug}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
android_root="${repository_root}/apps/android"
gradle_wrapper="${android_root}/gradlew"

[[ -x "$gradle_wrapper" ]] || {
  echo "Android Gradle Wrapper is missing or not executable: ${gradle_wrapper}" >&2
  exit 3
}

if [[ -n "${JAVA_HOME:-}" ]]; then
  if [[ -x "${JAVA_HOME}/jre/sh/java" ]]; then
    java_command="${JAVA_HOME}/jre/sh/java"
  else
    java_command="${JAVA_HOME}/bin/java"
  fi
  [[ -x "$java_command" ]] || {
    echo "JAVA_HOME does not reference an executable Java runtime: ${JAVA_HOME}" >&2
    exit 4
  }
else
  java_command="$(command -v java || true)"
  [[ -n "$java_command" ]] || {
    echo 'JDK 17 is required to build Android.' >&2
    exit 4
  }
fi

java_major_version="$("$java_command" -version 2>&1 | awk -F '[\".]' '/version/ { print $2; exit }')"
[[ "$java_major_version" == "17" ]] || {
  echo "JDK 17 is required to build Android; found ${java_major_version:-unknown}." >&2
  exit 5
}

require_release_env() {
  local names=(
    ANDROID_RELEASE_KEYSTORE_PATH
    ANDROID_RELEASE_KEYSTORE_PASSWORD
    ANDROID_RELEASE_KEY_ALIAS
    ANDROID_RELEASE_KEY_PASSWORD
    ANDROID_VERSION_CODE
    ANDROID_VERSION_NAME
    GOOGLE_MAPS_ANDROID_API_KEY
    GOOGLE_OAUTH_SERVER_CLIENT_ID
    KHEDMAH_API_BASE_URL
  )
  for name in "${names[@]}"; do
    [[ -n "${!name:-}" ]] || { echo "Missing required Android release value: $name" >&2; exit 6; }
  done
  [[ -f "$ANDROID_RELEASE_KEYSTORE_PATH" ]] || { echo 'Android release keystore file is missing.' >&2; exit 6; }
  [[ "$ANDROID_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || { echo 'ANDROID_VERSION_CODE must be a positive integer.' >&2; exit 6; }
  [[ "$KHEDMAH_API_BASE_URL" == https://* ]] || { echo 'KHEDMAH_API_BASE_URL must use HTTPS for release builds.' >&2; exit 6; }
  case "$KHEDMAH_API_BASE_URL $GOOGLE_OAUTH_SERVER_CLIENT_ID" in
    *project-94512a0e-1a5e-4bdb-87f*|*774201339973*) echo 'Legacy Google project binding detected in Android release configuration.' >&2; exit 6 ;;
  esac
}

case "$mode" in
  debug)
    task=':app:assembleDebug'
    ;;
  release-apk)
    require_release_env
    task=':app:assembleRelease'
    ;;
  release-aab)
    require_release_env
    task=':app:bundleRelease'
    ;;
  *)
    echo 'Usage: scripts/build-android.sh [debug|release-apk|release-aab]' >&2
    exit 2
    ;;
esac

"$gradle_wrapper" --no-daemon -p "$android_root" \
  -PKHEDMAH_API_BASE_URL="${KHEDMAH_API_BASE_URL:-}" \
  -PGOOGLE_OAUTH_SERVER_CLIENT_ID="${GOOGLE_OAUTH_SERVER_CLIENT_ID:-}" \
  -PGOOGLE_MAPS_API_KEY="${GOOGLE_MAPS_ANDROID_API_KEY:-}" \
  "$task"
