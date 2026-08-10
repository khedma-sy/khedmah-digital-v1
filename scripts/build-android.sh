#!/usr/bin/env bash
set -euo pipefail
required_gradle_version="8.11.1"
command -v gradle >/dev/null || {
  echo "Gradle ${required_gradle_version} is required. Install it before building Android." >&2
  exit 3
}
installed_gradle_version="$(gradle --version | awk '/^Gradle / { print $2; exit }')"
[[ "$(printf '%s\n%s\n' "$required_gradle_version" "$installed_gradle_version" | sort -V | head -n1)" == "$required_gradle_version" ]] || {
  echo "Gradle ${required_gradle_version} or newer is required; found ${installed_gradle_version:-unknown}." >&2
  exit 4
}
[[ -n "${JAVA_HOME:-}" ]] || {
  echo 'JAVA_HOME must reference JDK 17.' >&2
  exit 5
}
gradle --no-daemon -p apps/android :app:assembleDebug
