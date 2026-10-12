import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const build = readFileSync(new URL('../cloudbuild.preview.yaml', import.meta.url), 'utf8');
const secrets = build.match(/secretEnv: \[([^\]]+)\]/)[1].split(',').map((s) => s.trim());
const environment = build.match(/^    env: \['([^']+)'\]/m)[1];
const defaultMeasurement = build.match(/_FIREBASE_MEASUREMENT_ID: "([^"]*)"/)[1];

function dockerArguments(measurement) {
  // Execute the real build shell after applying its Cloud Build substitutions.
  const substitutions = {
    _NEXT_PUBLIC_API_URL: 'https://preview.example.test', _NEXT_PUBLIC_CLASSIFIEDS_ENABLED: 'false',
    _REGION: 'europe-west1', _REPOSITORY: 'preview', _IMAGE_TAG: 'fixture', PROJECT_ID: 'preview-test',
  };
  const shell = build.split('      - |\n')[1].split('\nimages:')[0]
    .replace(/\$\$|\$\{([A-Z0-9_]+)\}|\$([A-Z0-9_]+)/g, (match, braced, plain) => {
      if (match === '$$') return '$';
      const value = substitutions[braced || plain];
      assert.notEqual(value, undefined, `Unknown substitution ${match}`);
      return value;
    });
  const [name, ...parts] = environment.replace('${_FIREBASE_MEASUREMENT_ID}', measurement).split('=');
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c',
    'docker() { printf \'%s\\0\' "$@"; };\n' + shell], {
    encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, ...Object.fromEntries(secrets.map((s) => [s, `fixture-${s}`])),
      [name]: parts.join('=') },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\0').slice(0, -1);
}

test('Preview frontend builds with an absent Analytics ID and no Analytics secret dependency', () => {
  assert.equal(defaultMeasurement, '');
  assert.ok(!secrets.includes('FIREBASE_MEASUREMENT_ID'));
  assert.doesNotMatch(build, /secrets\/NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID\//);
  const args = dockerArguments(defaultMeasurement);
  assert.ok(args.includes('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID='));
  for (const required of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
    assert.ok(secrets.includes(`FIREBASE_${required}`));
    assert.ok(build.includes(`secrets/NEXT_PUBLIC_FIREBASE_${required}/versions/latest`));
    assert.ok(args.includes(`NEXT_PUBLIC_FIREBASE_${required}=fixture-FIREBASE_${required}`));
  }
});

test('An explicit Preview Analytics substitution is passed as data to Docker', () => {
  const value = 'G-EXAMPLE$(exit 91);"quoted"';
  assert.ok(dockerArguments(value).includes(`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${value}`));
});
