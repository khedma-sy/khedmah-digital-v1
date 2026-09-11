#!/usr/bin/env bash
set -euo pipefail
set +x

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
android_root="${repository_root}/apps/android"
gradle_wrapper="${android_root}/gradlew"
bundle_path="${android_root}/app/build/outputs/bundle/release/app-release.aab"

for name in \
  ANDROID_RELEASE_KEYSTORE_PATH \
  ANDROID_RELEASE_KEYSTORE_PASSWORD \
  ANDROID_RELEASE_KEY_ALIAS \
  ANDROID_RELEASE_KEY_PASSWORD \
  KHEDMAH_API_BASE_URL \
  GOOGLE_MAPS_ANDROID_API_KEY \
  GOOGLE_OAUTH_SERVER_CLIENT_ID; do
  [[ -n "${!name:-}" ]] || { echo "Missing required Android release input: ${name}" >&2; exit 3; }
done

[[ -f "$ANDROID_RELEASE_KEYSTORE_PATH" ]] || { echo 'Android release keystore file was not found.' >&2; exit 4; }
[[ "$KHEDMAH_API_BASE_URL" == https://* ]] || { echo 'KHEDMAH_API_BASE_URL must use HTTPS for Android release.' >&2; exit 5; }
[[ -x "$gradle_wrapper" ]] || { echo 'Android Gradle Wrapper is missing or not executable.' >&2; exit 6; }
command -v jarsigner >/dev/null 2>&1 || { echo 'jarsigner from JDK 17 is required.' >&2; exit 7; }

"$gradle_wrapper" --no-daemon -p "$android_root" \
  -PKHEDMAH_API_BASE_URL="$KHEDMAH_API_BASE_URL" \
  :app:bundleRelease

[[ -s "$bundle_path" ]] || { echo 'Signed Android App Bundle was not produced.' >&2; exit 8; }
jarsigner -verify "$bundle_path" >/dev/null

echo "Signed Android App Bundle verified: $bundle_path"
