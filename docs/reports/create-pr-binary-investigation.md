# Create PR Binary Investigation — 2026-07-30

## Root cause

The PR diff contained two binary files, which the Create PR transport reported generically as `binary files are not supported`:

1. `artifacts/operations-product-dashboard.png` — a generated screenshot and not required to build or run the platform.
2. `apps/android/gradle/wrapper/gradle-wrapper.jar` — the Gradle Wrapper executable JAR.

Both appeared as binary entries (`- -`) in `git diff --numstat 80e5f1f..HEAD`.

## Remediation

The generated screenshot was removed. The Gradle Wrapper JAR and its now-unusable wrapper launchers/properties were removed together rather than leaving a broken wrapper. Android remains reproducible in CI: `actions/setup-java` installs JDK 17 and `gradle/actions/setup-gradle@v4` installs pinned Gradle `8.11.1`, after which CI runs `gradle --no-daemon -p apps/android :app:assembleDebug`.

No Android source, Gradle build configuration, Firebase dependency, application bootstrap, test, workflow gate, or documentation required for the build was removed. The resulting PR diff contains only source code, text configuration, workflows, tests, and documentation.


## Final verification

The no-wrapper approach is intentional for this repository because the Create PR transport cannot carry the wrapper JAR. `scripts/build-android.sh` pins and verifies Gradle 8.11.1 for local and CI use. Android assembled successfully with JDK 17, Android SDK 35, and Gradle 8.11.1 after wrapper removal. `actionlint` also validated every GitHub Actions workflow.
