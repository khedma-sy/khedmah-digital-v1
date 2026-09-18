import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('client Maps stack owns only restricted browser and Android API keys', async () => {
  const [main, vars, bootstrap] = await Promise.all([
    read('infra/iac/client-maps/main.tf'),
    read('infra/iac/client-maps/variables.tf'),
    read('infra/iac/bootstrap/main.tf'),
  ]);
  assert.match(main, /google_apikeys_key" "browser/);
  assert.match(main, /browser_key_restrictions/);
  assert.match(main, /allowed_referrers/);
  assert.match(main, /maps-backend\.googleapis\.com/);
  assert.match(main, /places-backend\.googleapis\.com/);
  assert.match(main, /google_apikeys_key" "android/);
  assert.match(main, /android_key_restrictions/);
  assert.match(main, /maps-android-backend\.googleapis\.com/);
  assert.doesNotMatch(main, /server_key_restrictions/);
  assert.match(vars, /var\.android_package_name == "com\.khedmah\.digital"/);
  assert.match(vars, /length\(var\.browser_allowed_referrers\) >= 2/);
  assert.match(bootstrap, /roles\/serviceusage\.apiKeysAdmin/);
  for (const api of [
    'apikeys.googleapis.com',
    'maps-backend.googleapis.com',
    'places-backend.googleapis.com',
    'maps-android-backend.googleapis.com',
  ]) assert.ok(bootstrap.includes(api), `bootstrap missing ${api}`);
});

test('client Maps plan is manual, exact-main and checks canonical plus Cloud Run referrers', async () => {
  const plan = await read('.github/workflows/terraform-client-maps-plan.yml');
  assert.match(plan, /workflow_dispatch:/);
  assert.match(plan, /environment: production/);
  assert.doesNotMatch(plan, /pull_request:|push:|schedule:/);
  assert.match(plan, /git rev-parse origin\/main/);
  assert.match(plan, /NEXT_PUBLIC_SITE_URL/);
  assert.match(plan, /PROJECT_NUMBER/);
  assert.match(plan, /\.run\.app\/\*/);
  assert.match(plan, /client-maps\.tfplan/);
  assert.match(plan, /sha256sum client-maps\.tfplan metadata\.json/);
  assert.match(plan, /index\("delete"\)/);
});

test('client Maps apply consumes only reviewed plan and publishes masked keys to Secret Manager', async () => {
  const [apply, bootstrap, productionWif] = await Promise.all([
    read('.github/workflows/terraform-client-maps-apply.yml'),
    read('infra/iac/bootstrap/main.tf'),
    read('infra/iac/production_operator.tf'),
  ]);
  assert.match(apply, /Verify reviewed plan run provenance/);
  assert.match(apply, /Terraform Client Maps Plan/);
  assert.match(apply, /\.conclusion.*success|test .*success/);
  assert.match(apply, /\.head_branch.*main|test .*main/);
  assert.match(apply, /\.head_sha/);
  assert.match(apply, /actions\/download-artifact@v8/);
  assert.match(apply, /sha256sum --check SHA256SUMS/);
  assert.match(apply, /APPLY_KHEDMAH_CLIENT_MAPS_/);
  assert.match(apply, /terraform -chdir=infra\/iac\/client-maps apply/);
  assert.doesNotMatch(apply, /terraform -chdir=infra\/iac\/client-maps plan/);
  assert.match(apply, /::add-mask::\$browser_key/);
  assert.match(apply, /::add-mask::\$android_key/);
  assert.match(apply, /secrets versions add GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.match(apply, /secrets versions add GOOGLE_MAPS_ANDROID_API_KEY/);
  assert.doesNotMatch(apply, /echo ["']?\$browser_key|echo ["']?\$android_key/);
  const bootstrapVariables = await read('infra/iac/bootstrap/variables.tf');
  assert.match(bootstrapVariables, /"GOOGLE_MAPS_ANDROID_API_KEY"/);
  assert.match(bootstrap, /maps_android_deployer_version_manager/);
  assert.match(bootstrap, /maps_android_deployer_accessor/);
  assert.match(productionWif, /terraform-client-maps-plan\.yml@refs\/heads\/main/);
  assert.match(productionWif, /terraform-client-maps-apply\.yml@refs\/heads\/main/);
});
