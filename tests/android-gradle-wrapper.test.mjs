import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const wrapperRoot = new URL('../apps/android/', import.meta.url);
const wrapperProperties = new URL('gradle/wrapper/gradle-wrapper.properties', wrapperRoot);
const wrapperJar = new URL('gradle/wrapper/gradle-wrapper.jar', wrapperRoot);
const unixLauncher = new URL('gradlew', wrapperRoot);
const windowsLauncher = new URL('gradlew.bat', wrapperRoot);
const buildScript = new URL('../scripts/build-android.sh', import.meta.url);
const androidReadme = new URL('README.md', wrapperRoot);
const readinessWorkflow = new URL('../.github/workflows/google-production-readiness.yml', import.meta.url);

const expectedDistributionChecksum =
  'f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6';
const expectedWrapperJarChecksum =
  '2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046';

test('Android Gradle Wrapper is complete and pins the verified 8.11.1 distribution', async () => {
  await Promise.all([
    access(wrapperJar),
    access(unixLauncher),
    access(windowsLauncher),
  ]);

  const [properties, jar, launcherStat] = await Promise.all([
    readFile(wrapperProperties, 'utf8'),
    readFile(wrapperJar),
    stat(unixLauncher),
  ]);

  assert.match(properties, /distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-8\.11\.1-bin\.zip/);
  assert.match(properties, new RegExp(`distributionSha256Sum=${expectedDistributionChecksum}`));
  assert.match(properties, /validateDistributionUrl=true/);
  assert.equal(createHash('sha256').update(jar).digest('hex'), expectedWrapperJarChecksum);
  assert.notEqual(launcherStat.mode & 0o111, 0, 'apps/android/gradlew must be executable');
});

test('Android builds use the repository wrapper and its selected JDK locally and in CI', async () => {
  const [script, readme, workflow] = await Promise.all([
    readFile(buildScript, 'utf8'),
    readFile(androidReadme, 'utf8'),
    readFile(readinessWorkflow, 'utf8'),
  ]);

  assert.match(script, /apps\/android/);
  assert.match(script, /gradlew/);
  assert.doesNotMatch(script, /command -v gradle/);
  assert.doesNotMatch(script, /^gradle\s/m);
  assert.match(script, /java_command="\$\{JAVA_HOME\}\/bin\/java"/);
  assert.match(script, /java_major_version="\$\("\$java_command" -version/);
  assert.match(readme, /tracks the complete Gradle Wrapper/);
  assert.match(readme, /Do not install or invoke a system Gradle version/);
  assert.doesNotMatch(readme, /intentionally does not track the standard Gradle Wrapper/);
  assert.match(workflow, /npm run build:android/);
  assert.doesNotMatch(workflow, /gradle-version:\s*['"]?8\.11\.1/);
});
