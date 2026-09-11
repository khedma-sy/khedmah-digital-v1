#!/usr/bin/env bash
set -euo pipefail
set +x

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
android_root="${repository_root}/apps/android"
gradle_wrapper="${android_root}/gradlew"
bundle_path="${android_root}/app/build/outputs/bundle/release/app-release.aab"
firebase_config="${android_root}/app/google-services.json"

for name in \
  ANDROID_RELEASE_KEYSTORE_PATH \
  ANDROID_RELEASE_KEYSTORE_PASSWORD \
  ANDROID_RELEASE_KEY_ALIAS \
  ANDROID_RELEASE_KEY_PASSWORD \
  ANDROID_VERSION_CODE \
  ANDROID_VERSION_NAME \
  KHEDMAH_API_BASE_URL \
  GOOGLE_MAPS_ANDROID_API_KEY \
  GOOGLE_OAUTH_SERVER_CLIENT_ID; do
  [[ -n "${!name:-}" ]] || { echo "Missing required Android release input: ${name}" >&2; exit 3; }
done

[[ -f "$ANDROID_RELEASE_KEYSTORE_PATH" ]] || { echo 'Android release keystore file was not found.' >&2; exit 4; }
[[ -f "$firebase_config" ]] || { echo 'Android release Firebase config is missing. Materialize apps/android/app/google-services.json from the protected release environment; never commit it.' >&2; exit 4; }
[[ "$KHEDMAH_API_BASE_URL" == https://* ]] || { echo 'KHEDMAH_API_BASE_URL must use HTTPS for Android release.' >&2; exit 5; }
[[ "$ANDROID_VERSION_CODE" =~ ^[1-9][0-9]*$ ]] || { echo 'ANDROID_VERSION_CODE must be a positive decimal integer.' >&2; exit 5; }
(( ANDROID_VERSION_CODE <= 2100000000 )) || { echo 'ANDROID_VERSION_CODE exceeds the Android platform maximum.' >&2; exit 5; }
[[ ${#ANDROID_VERSION_NAME} -le 100 ]] || { echo 'ANDROID_VERSION_NAME must be 100 characters or fewer.' >&2; exit 5; }
[[ "$ANDROID_VERSION_NAME" != *$'\n'* && "$ANDROID_VERSION_NAME" != *$'\r'* ]] || { echo 'ANDROID_VERSION_NAME must be a single line.' >&2; exit 5; }
[[ -x "$gradle_wrapper" ]] || { echo 'Android Gradle Wrapper is missing or not executable.' >&2; exit 6; }
command -v jarsigner >/dev/null 2>&1 || { echo 'jarsigner from JDK 17 is required.' >&2; exit 7; }

"$gradle_wrapper" --no-daemon -p "$android_root" \
  -PKHEDMAH_API_BASE_URL="$KHEDMAH_API_BASE_URL" \
  :app:bundleRelease

[[ -s "$bundle_path" ]] || { echo 'Signed Android App Bundle was not produced.' >&2; exit 8; }
jarsigner -verify "$bundle_path" >/dev/null

echo "Signed Android App Bundle verified for version ${ANDROID_VERSION_NAME} (${ANDROID_VERSION_CODE}): $bundle_path"
