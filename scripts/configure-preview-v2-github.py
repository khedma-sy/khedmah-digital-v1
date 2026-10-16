#!/usr/bin/env python3
"""Owner-run Preview V2 federation/configuration batch; no deployment or secret payloads."""
import argparse
import copy
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ACCOUNT = 'haifawi30@gmail.com'
REPO = 'khedma-sy/khedmah-digital-v1'
REPO_ID = '1307435925'
OWNER_ID = '307214577'
BRANCH = 'docs/media-plan-38120326927-checkpoint'
POOL = 'khedmah-preview-github'
PROVIDER = 'github-actions'
POOL_NAME = f'projects/{NUMBER}/locations/global/workloadIdentityPools/{POOL}'
PROVIDER_NAME = POOL_NAME + '/providers/' + PROVIDER
DEPLOYER = f'khedmah-pv2-deployer@{PROJECT}.iam.gserviceaccount.com'
MEMBER = f'principalSet://iam.googleapis.com/{POOL_NAME}/attribute.repository_id/{REPO_ID}'
ROLE = 'roles/iam.workloadIdentityUser'
READY = 'PREVIEW_V2_CONFIGURATION_READY'
VARIABLES = {
    'PREVIEW_GOOGLE_CLOUD_PROJECT': PROJECT,
    # This selects the future isolated Firebase target; it does not create Firebase.
    'PREVIEW_FIREBASE_PROJECT_ID': PROJECT,
    'GOOGLE_CLOUD_REGION': 'europe-west1',
    'PREVIEW_ARTIFACT_REPOSITORY': 'khedmah-preview',
    'PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME': PROJECT + ':europe-west1:khedmah-preview-v2-db',
    'PREVIEW_V2_WORKLOAD_IDENTITY_PROVIDER': PROVIDER_NAME,
    'PREVIEW_V2_DEPLOYER_SERVICE_ACCOUNT': DEPLOYER,
    'PREVIEW_V2_RUNTIME_SERVICE_ACCOUNT': f'khedmah-pv2-runtime@{PROJECT}.iam.gserviceaccount.com',
}
CLAIMS = {
    'repository_id': REPO_ID, 'repository_owner_id': OWNER_ID, 'repository': REPO,
    'environment': 'preview', 'event_name': 'pull_request', 'ref': 'refs/pull/274/merge',
    'head_ref': BRANCH, 'base_ref': 'main',
    'workflow_ref': REPO + '/.github/workflows/preview-deployment.yml@refs/pull/274/merge',
}
MAPPING = {'google.subject': 'assertion.sub', **{'attribute.' + k: 'assertion.' + k for k in CLAIMS}}
CONDITION = ' && '.join(f"assertion.{key} == '{value}'" for key, value in CLAIMS.items())
# Filled from reviewed source blobs before publishing this batch. Head freshness is
# checked separately, so documentation-only commits cannot silently change code.
SOURCE_BLOBS = {
    '.github/workflows/preview-deployment.yml': 'a7f1fb6480b67ab866f5b6511b54deda0518f5ea',
    'scripts/deployment/verify-preview-v2-configuration.mjs': 'e97025878073fd9d87804c8a3c2ee7681bb2d0b7',
    'scripts/deployment/preview-schema-job-pool.mjs': '7fa859190c65a1fd5e6048ecbbed2b4cc0e2d5db',
    'scripts/deployment/read-preview-mail-metadata.mjs': '613cc786f7e99ca3822de2f475978323529469ac',
    'scripts/deployment/verify-preview-source.mjs': '447f7b82a6316f82b4c46f0728e72fac839a98d8',
    'scripts/deployment/schema-execution-profile.sh': 'c651a4055fe771dca5a3168b3860e21fe1c5aeda',
    'scripts/deployment/read-preview-launch-metadata.mjs': '3262578d5be159c3484888b28a8787a0a53e79fe',
    'scripts/deployment/verify-preview-first-rollout.mjs': '9a0bdebed157b862d22af0264e2f04e3c79a7f84',
    'scripts/deployment/verify-build-source-exclusions.mjs': '29150895fa985125ef8338b58660fab9bd24b669',
    'scripts/deployment/verify-preview-build-source-diagnostic.mjs': '0650521e634f1377511b7670e6ce85ec0b1ee6e5',
    'scripts/inspect-preview-v2-build-source.py': '2597eebfceb912f3ff6157cd181acb712a9e04bd',
    'scripts/deployment/verify-preview-post-rollout-reconciliation.mjs': 'a61c4bed9ed468838dc5c6a9cc214516c1765e89',
    'scripts/deployment/read-preview-post-rollout-reconciliation.mjs': '7a7110700387a8b68f62a82c5449ce1a46b68830',
    '.gcloudignore': '5915bc0f2c4c471bb77c0161110f44caaddeb096',
    '.gitignore': 'f01472294b6c6cfd847502f57ad2029e23047f18',
    '.dockerignore': '58faa669c2e6e442240799a3bf86f485de5b1543',
}
ENV_BASE = f'repos/{REPO}/environments/preview'
ACTIVE_STATUSES = ('queued', 'in_progress', 'waiting', 'pending', 'requested')


class Stop(RuntimeError):
    pass


def require(ok, code):
    if not ok:
        raise Stop(code)


def emit(stage, **fields):
    print(json.dumps({'stage': stage, **fields}, sort_keys=True), flush=True)


def validate_repository(data):
    require(data.get('full_name') == REPO and str(data.get('id')) == REPO_ID
            and str(data.get('owner', {}).get('id')) == OWNER_ID
            and data.get('permissions', {}).get('admin') is True, 'GITHUB_REPOSITORY_OR_ADMIN_MISMATCH')


def validate_pr(pr, head):
    require(pr.get('number') == 274 and pr.get('state') == 'open' and pr.get('merged') is False
            and pr.get('head', {}).get('sha') == head and pr['head'].get('ref') == BRANCH
            and pr['head'].get('repo', {}).get('full_name') == REPO
            and str(pr['head']['repo'].get('id')) == REPO_ID
            and pr.get('base', {}).get('ref') == 'main'
            and str(pr['base'].get('repo', {}).get('id')) == REPO_ID, 'PR_SOURCE_CHANGED_OR_UNREVIEWED')


def validate_tree(tree):
    require(len(SOURCE_BLOBS) >= 4, 'SOURCE_MANIFEST_NOT_READY')
    require(tree.get('truncated') is False and isinstance(tree.get('tree'), list), 'SOURCE_TREE_INCOMPLETE')
    files = {x.get('path'): x.get('sha') for x in tree['tree'] if x.get('type') == 'blob'}
    require(all(files.get(path) == sha for path, sha in SOURCE_BLOBS.items()), 'REVIEWED_SOURCE_BLOB_MISMATCH')


def variable_map(data):
    rows = data.get('variables')
    require(isinstance(rows, list) and data.get('total_count') == len(rows) and len(rows) < 100,
            'ENVIRONMENT_VARIABLE_INVENTORY_INCOMPLETE')
    result = {}
    for row in rows:
        name, value = row.get('name'), row.get('value')
        require(isinstance(name, str) and re.fullmatch('[A-Z_][A-Z0-9_]*', name)
                and isinstance(value, str) and name not in result, 'ENVIRONMENT_VARIABLE_METADATA_INVALID')
        result[name] = value
    return result


def validate_isolation(values):
    require(values.get('PRODUCTION_GOOGLE_CLOUD_PROJECT') == 'khedma-dl'
            and values.get('PRODUCTION_FIREBASE_PROJECT_ID') == 'khedma-dl', 'CANONICAL_PRODUCTION_EXCLUSION_MISSING')
    staging = values.get('STAGING_GOOGLE_CLOUD_PROJECT')
    require(isinstance(staging, str) and re.fullmatch('[a-z][a-z0-9-]{4,28}[a-z0-9]', staging)
            and staging not in (PROJECT, 'khedma-dl'), 'STAGING_EXCLUSION_MISSING_OR_COLLIDING')
    for key in ('DEVELOPMENT_GOOGLE_CLOUD_PROJECT', 'DEVELOPMENT_FIREBASE_PROJECT_ID', 'STAGING_FIREBASE_PROJECT_ID'):
        require(values.get(key) != PROJECT, 'OTHER_ENVIRONMENT_COLLIDES_WITH_REPLACEMENT')
    require(values.get(READY, 'false') in ('false', 'true'), 'READINESS_VALUE_UNREVIEWED')


def validate_pool(data):
    require(data.get('name') == POOL_NAME and data.get('state') == 'ACTIVE'
            and data.get('disabled', False) is False, 'POOL_STATE_OR_IDENTITY_MISMATCH')


def validate_provider(data):
    require(data.get('name') == PROVIDER_NAME and data.get('state') == 'ACTIVE'
            and data.get('disabled', False) is False, 'PROVIDER_STATE_OR_IDENTITY_MISMATCH')
    require(data.get('attributeMapping') == MAPPING and data.get('attributeCondition') == CONDITION,
            'PROVIDER_TRUST_POLICY_MISMATCH')
    oidc = data.get('oidc', {})
    require(oidc.get('issuerUri') == 'https://token.actions.githubusercontent.com'
            and oidc.get('allowedAudiences', []) == [] and not oidc.get('jwksJson')
            and not any(data.get(k) for k in ('aws', 'saml', 'x509')), 'PROVIDER_ISSUER_OR_AUDIENCE_MISMATCH')


def policy_ready(policy):
    require(isinstance(policy, dict) and isinstance(policy.get('etag'), str) and policy['etag'],
            'SERVICE_ACCOUNT_POLICY_ETAG_MISSING')
    bindings = policy.get('bindings', [])
    wanted = [{'role': ROLE, 'members': [MEMBER]}]
    require(bindings in ([], wanted) and not policy.get('auditConfigs'), 'SERVICE_ACCOUNT_POLICY_UNREVIEWED')
    return bindings == wanted


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Runner:
    def __init__(self):
        self.env = dict(os.environ)
        require(not any(k.startswith('CLOUDSDK_API_ENDPOINT_OVERRIDES_') and v for k, v in self.env.items()),
                'GCLOUD_ENDPOINT_OVERRIDE_PRESENT')
        self.env.update(CLOUDSDK_CORE_LOG_HTTP='false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED='true',
                        CLOUDSDK_CORE_DISABLE_PROMPTS='true', GH_DEBUG='', GH_PROMPT_DISABLED='1')

    def command(self, cmd, label, body=None, timeout=60):
        try:
            p = subprocess.run(cmd, input=body, capture_output=True, text=True, timeout=timeout, env=self.env)
        except (OSError, subprocess.TimeoutExpired):
            raise Stop(label + '_UNCONFIRMED_RECONCILE') from None
        if p.returncode:
            detail = p.stderr or ''
            reason = 'PERMISSION_DENIED' if re.search('PERMISSION_DENIED|permission.*denied|HTTP 403', detail, re.I) else \
                     'CLI_ARGUMENT' if re.search('unrecognized arguments|unknown flag|invalid choice', detail, re.I) else 'FAILED'
            raise Stop(label + '_' + reason + '_RECONCILE')
        require(len(p.stdout) < 16 * 1024 * 1024, label + '_OUTPUT_LIMIT')
        return p.stdout.strip()

    def cloud(self, *args, timeout=60):
        raw = self.command(['gcloud', *args, '--project=' + PROJECT, '--account=' + ACCOUNT,
                            '--user-output-enabled', '--verbosity=error', '--format=json', '--quiet'],
                           'GCLOUD_' + '_'.join(args[:3]).upper().replace('-', '_'), timeout=timeout)
        return json.loads(raw) if raw else None

    def github(self, path, method='GET', data=None):
        require(path == 'repos/' + REPO or path.startswith('repos/' + REPO + '/'), 'GITHUB_ENDPOINT_REJECTED')
        args = ['gh', 'api', '--hostname', 'github.com', '--method', method, path]
        if data is not None:
            args += ['--input', '-']
        raw = self.command(args, 'GITHUB_' + method, None if data is None else json.dumps(data))
        return json.loads(raw) if raw else None

    def permissions(self):
        token = self.command(['gcloud', 'auth', 'print-access-token', '--account=' + ACCOUNT,
                              '--project=' + PROJECT, '--verbosity=error'], 'GOOGLE_TOKEN_READ')
        require(token and not any(c.isspace() for c in token), 'GOOGLE_TOKEN_INVALID')
        checks = [
            ('https://cloudresourcemanager.googleapis.com/v1/projects/' + PROJECT + ':testIamPermissions',
             ['iam.workloadIdentityPools.create', 'iam.workloadIdentityPools.get', 'iam.workloadIdentityPools.list',
              'iam.workloadIdentityPoolProviders.create', 'iam.workloadIdentityPoolProviders.get',
              'iam.workloadIdentityPoolProviders.list']),
            ('https://iam.googleapis.com/v1/projects/' + PROJECT + '/serviceAccounts/' + DEPLOYER + ':testIamPermissions',
             ['iam.serviceAccounts.getIamPolicy', 'iam.serviceAccounts.setIamPolicy']),
        ]
        for url, permissions in checks:
            request = urllib.request.Request(url, data=json.dumps({'permissions': permissions}).encode(),
                headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
            try:
                with urllib.request.build_opener(NoRedirect).open(request, timeout=45) as response:
                    result = json.loads(response.read(65536))
            except (OSError, ValueError):
                raise Stop('GOOGLE_PERMISSION_READ_FAILED') from None
            require(set(result.get('permissions', [])) == set(permissions), 'GOOGLE_REQUIRED_PERMISSION_MISSING')

    def auth_preflight(self):
        for key in ('impersonate_service_account', 'access_token_file', 'credential_file_override'):
            value = self.command(['gcloud', 'config', 'get-value', 'auth/' + key, '--account=' + ACCOUNT,
                                  '--project=' + PROJECT, '--verbosity=error'], 'AUTH_CONFIGURATION_READ')
            require(value in ('', '(unset)'), 'AUTH_OVERRIDE_PRESENT')


class Batch:
    def __init__(self, runner, head, work=None):
        require(re.fullmatch('[0-9a-f]{40}', head or ''), 'EXPECTED_HEAD_REQUIRED')
        self.r, self.head, self.work = runner, head, work
        self.values = None
        self.environment = None
        self.repository_exclusions = None

    def mark(self, stage, **fields):
        emit(stage, **fields)
        if self.work:
            with (self.work / 'stages.jsonl').open('a') as f:
                f.write(json.dumps({'stage': stage, 'expected_head': self.head, **fields}) + '\n')

    def quiet_source(self):
        validate_pr(self.r.github(f'repos/{REPO}/pulls/274'), self.head)
        for status in ACTIVE_STATUSES:
            data = self.r.github(f'repos/{REPO}/actions/workflows/preview-deployment.yml/runs?status={status}&per_page=1')
            require(data.get('total_count') == 0 and data.get('workflow_runs') == [],
                    'PREVIEW_WORKFLOW_ACTIVE_OR_WAITING')

    def read_values(self):
        return variable_map(self.r.github(ENV_BASE + '/variables?per_page=100'))

    def read_environment(self):
        data = self.r.github(ENV_BASE)
        require(data.get('name') == 'preview' and isinstance(data.get('id'), int)
                and isinstance(data.get('protection_rules'), list), 'PREVIEW_ENVIRONMENT_UNVERIFIED')
        # Variable writes can change a parent's update timestamp. Compare its
        # protection settings and actual custom branch rules, not that timestamp.
        data.pop('updated_at', None)
        policy = data.get('deployment_branch_policy')
        if policy and policy.get('custom_branch_policies') is True:
            branches = self.r.github(ENV_BASE + '/deployment-branch-policies?per_page=100')
            require(isinstance(branches.get('branch_policies'), list)
                    and branches.get('total_count') == len(branches['branch_policies'])
                    and len(branches['branch_policies']) < 100, 'ENVIRONMENT_BRANCH_RULES_INCOMPLETE')
            data['reviewed_branch_policies'] = branches
        return data

    def read_repository_exclusions(self):
        values = variable_map(self.r.github(f'repos/{REPO}/actions/variables?per_page=100'))
        return {k: v for k, v in values.items() if k.startswith(('PRODUCTION_', 'STAGING_', 'DEVELOPMENT_'))
                and k.endswith(('GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID'))}

    def unchanged_configuration(self):
        require(self.read_environment() == self.environment, 'ENVIRONMENT_PROTECTION_CHANGED')
        require(self.read_repository_exclusions() == self.repository_exclusions, 'REPOSITORY_EXCLUSION_CHANGED')
        require(self.read_values() == self.values, 'ENVIRONMENT_VARIABLE_CONCURRENT_CHANGE')

    def read_federation(self):
        pools = self.r.cloud('iam', 'workload-identity-pools', 'list', '--location=global', '--show-deleted', '--limit=100')
        require(isinstance(pools, list) and len(pools) < 100
                and all(isinstance(x, dict) and isinstance(x.get('name'), str) for x in pools), 'POOL_INVENTORY_INCOMPLETE')
        selected = [x for x in pools if x['name'] == POOL_NAME]
        require(len(selected) <= 1, 'DUPLICATE_POOL')
        provider = None
        if selected:
            validate_pool(selected[0])
            providers = self.r.cloud('iam', 'workload-identity-pools', 'providers', 'list',
                '--location=global', '--workload-identity-pool=' + POOL, '--show-deleted', '--limit=100')
            require(isinstance(providers, list) and len(providers) <= 1, 'UNREVIEWED_POOL_PROVIDER_INVENTORY')
            if providers:
                provider = providers[0]
                validate_provider(provider)
        policy = self.r.cloud('iam', 'service-accounts', 'get-iam-policy', DEPLOYER)
        ready = policy_ready(policy)
        require(not ready or (selected and provider), 'BINDING_WITHOUT_REVIEWED_PROVIDER')
        return bool(selected), bool(provider), policy

    def preflight(self):
        validate_repository(self.r.github('repos/' + REPO))
        self.quiet_source()
        validate_tree(self.r.github(f'repos/{REPO}/git/trees/{self.head}?recursive=1'))
        self.environment = self.read_environment()
        self.repository_exclusions = self.read_repository_exclusions()
        self.values = self.read_values()
        validate_isolation({**self.repository_exclusions, **self.values})
        self.r.auth_preflight()
        project = self.r.cloud('projects', 'describe', PROJECT)
        require(project.get('projectId') == PROJECT and str(project.get('projectNumber')) == NUMBER
                and project.get('lifecycleState') == 'ACTIVE'
                and project.get('parent') == {'id': '594049370623', 'type': 'organization'}, 'GOOGLE_PROJECT_IDENTITY_MISMATCH')
        services = self.r.cloud('services', 'list', '--enabled')
        require(isinstance(services, list), 'SERVICE_INVENTORY_INVALID')
        enabled = {x.get('config', {}).get('name') for x in services if x.get('state') == 'ENABLED'}
        require({'iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com',
                 'cloudresourcemanager.googleapis.com'} <= enabled, 'FEDERATION_API_MISSING')
        for role in ('deployer', 'runtime', 'build', 'migrator', 'frontend'):
            email = f'khedmah-pv2-{role}@{PROJECT}.iam.gserviceaccount.com'
            sa = self.r.cloud('iam', 'service-accounts', 'describe', email)
            require(sa.get('projectId') == PROJECT and sa.get('email') == email
                    and sa.get('disabled', False) is False and re.fullmatch('[0-9]+', str(sa.get('uniqueId', ''))),
                    'EXECUTION_IDENTITY_MISMATCH_' + role.upper())
        for name in ('DATABASE_URL', 'DATABASE_MIGRATION_URL'):
            version = self.r.cloud('secrets', 'versions', 'describe', '1', '--secret=' + name)
            require(version.get('name') == f'projects/{NUMBER}/secrets/{name}/versions/1'
                    and version.get('state') == 'ENABLED', 'VERIFIED_DATABASE_VERSION_CHANGED')
        self.r.permissions()
        current = self.read_federation()
        self.mark('PREVIEW_V2_GITHUB_PREFLIGHT_PASSED', project=PROJECT, pool_exists=current[0],
                  provider_exists=current[1], binding_exists=policy_ready(current[2]),
                  configuration_changes=[name for name, value in VARIABLES.items() if self.values.get(name) != value])
        return current

    def set_variable(self, name, value):
        require(name in VARIABLES or name == READY, 'VARIABLE_WRITE_SCOPE_REJECTED')
        require(value == VARIABLES.get(name) or (name == READY and value in ('false', 'true')),
                'VARIABLE_VALUE_REJECTED')
        self.unchanged_configuration()
        if self.values.get(name) == value:
            return
        method = 'PATCH' if name in self.values else 'POST'
        path = ENV_BASE + '/variables' + ('/' + name if method == 'PATCH' else '')
        self.mark('GITHUB_VARIABLE_ATTEMPT', name=name)
        self.r.github(path, method, {'name': name, 'value': value})
        self.values[name] = value
        require(self.read_values() == self.values, 'GITHUB_VARIABLE_READBACK_MISMATCH')
        self.mark('GITHUB_VARIABLE_VERIFIED', name=name)

    def execute(self, apply=False):
        initial = self.preflight()
        if not apply:
            self.mark('PREVIEW_V2_GITHUB_PLAN_COMPLETE_NO_MUTATION')
            return
        self.quiet_source()
        self.unchanged_configuration()
        complete = all(self.values.get(k) == v for k, v in VARIABLES.items()) and self.values.get(READY) == 'true'
        if complete and initial[0] and initial[1] and policy_ready(initial[2]):
            self.finish()
            return
        self.set_variable(READY, 'false')
        # Matching existing objects are reusable; drift and deleted objects stop.
        # Never patch, enable, replace or broaden an existing trust provider.
        current = self.read_federation()
        require(current == initial, 'FEDERATION_CONCURRENT_CHANGE')
        if not current[0]:
            self.mark('WIF_POOL_CREATE_ATTEMPT')
            self.r.cloud('iam', 'workload-identity-pools', 'create', POOL, '--location=global',
                         '--display-name=Khedmah Preview GitHub', timeout=180)
        self.quiet_source()
        self.unchanged_configuration()
        current = self.read_federation()
        require(current[0], 'POOL_CREATE_READBACK_FAILED')
        if not current[1]:
            self.mark('WIF_PROVIDER_CREATE_ATTEMPT')
            self.r.cloud('iam', 'workload-identity-pools', 'providers', 'create-oidc', PROVIDER,
                '--location=global', '--workload-identity-pool=' + POOL,
                '--issuer-uri=https://token.actions.githubusercontent.com',
                '--attribute-mapping=' + ','.join(k + '=' + v for k, v in MAPPING.items()),
                '--attribute-condition=' + CONDITION, '--display-name=GitHub PR 274 Preview', timeout=180)
        self.quiet_source()
        self.unchanged_configuration()
        current = self.read_federation()
        require(current[0] and current[1], 'PROVIDER_CREATE_READBACK_FAILED')
        if not policy_ready(current[2]):
            require(self.work is not None, 'PRIVATE_WORK_DIRECTORY_REQUIRED')
            policy = copy.deepcopy(current[2])
            policy['bindings'] = [{'role': ROLE, 'members': [MEMBER]}]
            policy_file = self.work / 'deployer-policy.json'
            policy_file.write_text(json.dumps(policy))
            os.chmod(policy_file, 0o600)
            require(self.r.cloud('iam', 'service-accounts', 'get-iam-policy', DEPLOYER) == current[2],
                    'SERVICE_ACCOUNT_POLICY_CONCURRENT_CHANGE')
            self.mark('WIF_DEPLOYER_BINDING_ATTEMPT')
            # Keep the freshly read etag. Google rejects a concurrent IAM change.
            self.r.cloud('iam', 'service-accounts', 'set-iam-policy', DEPLOYER, str(policy_file))
        current = self.read_federation()
        require(current[0] and current[1] and policy_ready(current[2]), 'FEDERATION_FINAL_READBACK_FAILED')
        self.mark('PREVIEW_V2_FEDERATION_CONFIGURATION_VERIFIED', live_oidc_test=False)
        self.quiet_source()
        for name, value in VARIABLES.items():
            self.set_variable(name, value)
        self.quiet_source()
        current = self.read_federation()
        require(current[0] and current[1] and policy_ready(current[2]), 'FEDERATION_CHANGED_BEFORE_PUBLICATION')
        self.set_variable(READY, 'true')
        self.finish()

    def finish(self):
        self.unchanged_configuration()
        require(all(self.values.get(k) == v for k, v in VARIABLES.items()) and self.values.get(READY) == 'true',
                'GITHUB_FINAL_CONFIGURATION_MISMATCH')
        self.mark('PREVIEW_V2_WIF_AND_GITHUB_CONFIGURATION_VERIFIED', project=PROJECT,
                  oidc_authentication_verified=False, deployment_held=True, schema_migrated=False,
                  runtime_object_grants_ready=False, application_deployed=False, floot_connected=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-head', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    work = None
    try:
        runner = Runner()
        if args.apply:
            root = Path.home() / 'khedmah-preview-v2-github-runs'
            require(not root.is_symlink(), 'WORK_DIRECTORY_SYMLINK_REJECTED')
            root.mkdir(mode=0o700, exist_ok=True)
            lock_fd = os.open(root / 'batch.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Stop('ANOTHER_LOCAL_BATCH_IS_RUNNING') from None
            work = Path(tempfile.mkdtemp(prefix='run-', dir=root))
        Batch(runner, args.expected_head, work).execute(args.apply)
    except (Stop, ValueError, KeyError, TypeError, AttributeError, OSError) as exc:
        print('STOP: ' + (str(exc) if isinstance(exc, Stop) else 'INVALID_RESPONSE_OR_LOCAL_IO'), file=sys.stderr)
        if work:
            print('LOCAL_AUDIT_DIRECTORY=' + str(work), file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
