#!/usr/bin/env bash
set -euo pipefail

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

"$gradle_wrapper" --no-daemon -p "$android_root" :app:assembleDebug
