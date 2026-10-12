#!/usr/bin/env python3
"""One operator-run bootstrap for the replacement Preview infrastructure.

No credential payloads, federation, application deployment or Production changes.
The fixed manifest is available offline with --manifest. Cloud writes require --apply.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ORGANIZATION = '594049370623'
ACCOUNT = 'haifawi30@gmail.com'
REGION = 'europe-west1'
STATE_BUCKET = PROJECT + '-tfstate'
PREFIX = 'khedmah/preview-v2/bootstrap'
SOURCE_BUCKET = PROJECT + '-cloudbuild-source'
INSTANCE = 'khedmah-preview-v2-db'
REPOSITORY = 'khedmah-preview'
LABELS = {'environment': 'preview', 'application': 'khedmah'}
ACCOUNTS = ('deployer', 'build', 'runtime', 'frontend', 'migrator')
BUILD_SECRETS = (
    'GOOGLE_MAPS_BROWSER_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
)
SECRET_NAMES = BUILD_SECRETS + ('DATABASE_URL', 'DATABASE_MIGRATION_URL', 'RESEND_API_KEY')
CORE_APIS = {
    'serviceusage.googleapis.com', 'cloudresourcemanager.googleapis.com',
    'iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com',
    'run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com',
    'secretmanager.googleapis.com', 'sqladmin.googleapis.com', 'storage.googleapis.com',
    'logging.googleapis.com', 'monitoring.googleapis.com',
}
PROVIDER_LOCK = '# This file is maintained automatically by "terraform init".\n# Manual edits may be lost in future updates.\n\nprovider "registry.terraform.io/hashicorp/google" {\n  version     = "6.50.0"\n  constraints = "~> 6.0"\n  hashes = [\n    "h1:faTJQOetP9/RYuHwA3r2SWnuYoyzQNm4tUWZrZggcgY=",\n    "zh:1f3513fcfcbf7ca53d667a168c5067a4dd91a4d4cccd19743e248ff31065503c",\n    "zh:3da7db8fc2c51a77dd958ea8baaa05c29cd7f829bd8941c26e2ea9cb3aadc1e5",\n    "zh:3e09ac3f6ca8111cbb659d38c251771829f4347ab159a12db195e211c76068bb",\n    "zh:7bb9e41c568df15ccf1a8946037355eefb4dfb4e35e3b190808bb7c4abae547d",\n    "zh:81e5d78bdec7778e6d67b5c3544777505db40a826b6eb5abe9b86d4ba396866b",\n    "zh:8d309d020fb321525883f5c4ea864df3d5942b6087f6656d6d8b3a1377f340fc",\n    "zh:93e112559655ab95a523193158f4a4ac0f2bfed7eeaa712010b85ebb551d5071",\n    "zh:d3efe589ffd625b300cef5917c4629513f77e3a7b111c9df65075f76a46a63c7",\n    "zh:d4a4d672bbef756a870d8f32b35925f8ce2ef4f6bbd5b71a3cb764f1b6c85421",\n    "zh:e13a86bca299ba8a118e80d5f84fbdd708fe600ecdceea1a13d4919c068379fe",\n    "zh:f569b65999264a9416862bca5cd2a6177d94ccb0424f3a4ef424428912b9cb3c",\n    "zh:fec30c095647b583a246c39d557704947195a1b7d41f81e369ba377d997faef6",\n  ]\n}\n\n'


class Stop(RuntimeError):
    pass


def require(condition, code):
    if not condition:
        raise Stop(code)


def emit(stage, **fields):
    print(json.dumps({'stage': stage, **fields}, sort_keys=True), flush=True)


def email(role):
    return f'khedmah-pv2-{role}@{PROJECT}.iam.gserviceaccount.com'


def manifest():
    resources = {}

    def add(kind, name, values):
        resources.setdefault(kind, {})[name] = values

    add('google_storage_bucket', 'build_source', {
        'name': SOURCE_BUCKET, 'project': PROJECT, 'location': REGION,
        'storage_class': 'STANDARD', 'uniform_bucket_level_access': True,
        'public_access_prevention': 'enforced', 'force_destroy': False,
        'labels': LABELS, 'soft_delete_policy': {'retention_duration_seconds': 604800},
        'lifecycle_rule': [{'condition': {'age': 30}, 'action': {'type': 'Delete'}}],
        'lifecycle': {'prevent_destroy': True},
    })
    add('google_artifact_registry_repository', 'images', {
        'project': PROJECT, 'location': REGION, 'repository_id': REPOSITORY,
        'format': 'DOCKER', 'description': 'Isolated replacement Preview images',
        'labels': LABELS, 'lifecycle': {'prevent_destroy': True},
    })
    for role in ACCOUNTS:
        add('google_service_account', role, {
            'project': PROJECT, 'account_id': 'khedmah-pv2-' + role,
            'display_name': 'Khedmah Preview V2 ' + role,
        })
    permissions = {
        'deployer': ['roles/run.admin', 'roles/cloudbuild.builds.editor',
                     'roles/serviceusage.serviceUsageConsumer', 'roles/cloudsql.viewer'],
        'build': ['roles/logging.logWriter', 'roles/serviceusage.serviceUsageConsumer'],
        'runtime': ['roles/cloudsql.client'], 'migrator': ['roles/cloudsql.client'],
    }
    for identity, roles in permissions.items():
        for role in roles:
            add('google_project_iam_member', identity + '_' + role.split('/')[-1].replace('.', '_'), {
                'project': PROJECT, 'role': role,
                'member': 'serviceAccount:' + email(identity),
                'depends_on': ['google_service_account.' + identity],
            })
    for identity in ACCOUNTS[1:]:
        add('google_service_account_iam_member', 'deployer_' + identity, {
            'service_account_id': '${google_service_account.' + identity + '.name}',
            'role': 'roles/iam.serviceAccountUser', 'member': 'serviceAccount:' + email('deployer'),
            'depends_on': ['google_service_account.deployer'],
        })
    for identity, role in [('build', 'roles/artifactregistry.writer'), ('deployer', 'roles/artifactregistry.reader')]:
        add('google_artifact_registry_repository_iam_member', identity, {
            'project': PROJECT, 'location': REGION,
            'repository': '${google_artifact_registry_repository.images.repository_id}',
            'role': role, 'member': 'serviceAccount:' + email(identity),
            'depends_on': ['google_service_account.' + identity],
        })
    for identity, role in [('build', 'roles/storage.objectViewer'), ('deployer', 'roles/storage.objectAdmin')]:
        add('google_storage_bucket_iam_member', 'source_' + identity, {
            'bucket': '${google_storage_bucket.build_source.name}',
            'role': role, 'member': 'serviceAccount:' + email(identity),
            'depends_on': ['google_service_account.' + identity],
        })
    add('google_sql_database_instance', 'preview', {
        'project': PROJECT, 'name': INSTANCE, 'region': REGION,
        'database_version': 'POSTGRES_16', 'deletion_protection': True,
        'settings': {
            'tier': 'db-custom-1-3840', 'edition': 'ENTERPRISE', 'availability_type': 'ZONAL',
            'disk_type': 'PD_SSD', 'disk_size': 10, 'disk_autoresize': True,
            'disk_autoresize_limit': 20, 'deletion_protection_enabled': True,
            'connector_enforcement': 'REQUIRED', 'user_labels': LABELS,
            'ip_configuration': {'ipv4_enabled': True, 'ssl_mode': 'ENCRYPTED_ONLY'},
            'backup_configuration': {
                'enabled': True, 'point_in_time_recovery_enabled': True,
                'transaction_log_retention_days': 7, 'start_time': '02:00',
                'backup_retention_settings': {'retained_backups': 7, 'retention_unit': 'COUNT'},
            },
        },
        'lifecycle': {'prevent_destroy': True, 'ignore_changes': ['settings[0].disk_size']},
    })
    add('google_sql_database', 'application', {
        'project': PROJECT, 'instance': '${google_sql_database_instance.preview.name}',
        'name': 'khedmah', 'charset': 'UTF8', 'lifecycle': {'prevent_destroy': True},
    })
    for name in SECRET_NAMES:
        add('google_secret_manager_secret', name, {
            'project': PROJECT, 'secret_id': name, 'replication': {'auto': {}},
            'labels': LABELS, 'lifecycle': {'prevent_destroy': True},
        })
        add('google_secret_manager_secret_iam_member', name + '_metadata', {
            'project': PROJECT, 'secret_id': '${google_secret_manager_secret.' + name + '.secret_id}',
            'role': 'roles/secretmanager.viewer', 'member': 'serviceAccount:' + email('deployer'),
            'depends_on': ['google_service_account.deployer'],
        })
        identity = 'build' if name in BUILD_SECRETS else ('migrator' if name == 'DATABASE_MIGRATION_URL' else 'runtime')
        add('google_secret_manager_secret_iam_member', name + '_payload', {
            'project': PROJECT, 'secret_id': '${google_secret_manager_secret.' + name + '.secret_id}',
            'role': 'roles/secretmanager.secretAccessor', 'member': 'serviceAccount:' + email(identity),
            'depends_on': ['google_service_account.' + identity],
        })
    return {
        'terraform': {
            'required_version': '>= 1.8.0, < 2.0.0',
            'required_providers': {'google': {'source': 'hashicorp/google', 'version': '= 6.50.0'}},
            'backend': {'gcs': {'bucket': STATE_BUCKET, 'prefix': PREFIX}},
        },
        'provider': {'google': {'project': PROJECT, 'region': REGION}},
        'resource': resources,
        'output': {
            'project_id': {'value': PROJECT}, 'project_number': {'value': NUMBER},
            'connection_name': {'value': '${google_sql_database_instance.preview.connection_name}'},
            'build_source_bucket': {'value': SOURCE_BUCKET},
        },
    }


def validate_project(project, billing, services):
    require(project.get('projectId') == PROJECT and str(project.get('projectNumber')) == NUMBER,
            'PROJECT_IDENTITY_MISMATCH')
    require(project.get('lifecycleState') == 'ACTIVE', 'PROJECT_NOT_ACTIVE')
    require(project.get('parent') == {'id': ORGANIZATION, 'type': 'organization'}, 'PARENT_MISMATCH')
    require(all(project.get('labels', {}).get(k) == v for k, v in LABELS.items()), 'PROJECT_LABELS_MISMATCH')
    require(billing.get('projectId') == PROJECT and billing.get('billingEnabled') is True, 'BILLING_NOT_ENABLED')
    enabled = {s.get('config', {}).get('name') for s in services if s.get('state') == 'ENABLED'}
    require(CORE_APIS <= enabled, 'CORE_API_MISSING')


def validate_bucket(bucket):
    require(bucket.get('name') == STATE_BUCKET and str(bucket.get('projectNumber')) == NUMBER,
            'STATE_BUCKET_IDENTITY_MISMATCH')
    require(bucket.get('location', '').lower() == REGION, 'STATE_BUCKET_REGION_MISMATCH')
    iam = bucket.get('iamConfiguration', {})
    require(iam.get('uniformBucketLevelAccess', {}).get('enabled') is True and
            iam.get('publicAccessPrevention') == 'enforced', 'STATE_BUCKET_ACCESS_MISMATCH')
    require(bucket.get('versioning', {}).get('enabled') is True, 'STATE_BUCKET_VERSIONING_MISSING')
    require(int(bucket.get('softDeletePolicy', {}).get('retentionDurationSeconds', 0)) >= 2592000,
            'STATE_BUCKET_RECOVERY_MISMATCH')
    require(all(bucket.get('labels', {}).get(k) == v for k, v in LABELS.items()), 'STATE_BUCKET_LABELS_MISMATCH')


def validate_plan(plan):
    require(not plan.get('errored', False), 'TERRAFORM_PLAN_ERRORED')
    require(not plan.get('deferred_changes'), 'TERRAFORM_PLAN_DEFERRED')
    require(not plan.get('resource_drift'), 'TERRAFORM_STATE_DRIFT_REQUIRES_REVIEW')
    config = manifest()['resource']
    expected = {kind + '.' + name for kind, entries in config.items() for name in entries}
    changes = plan.get('resource_changes', [])
    require({r.get('address') for r in changes} == expected and len(changes) == len(expected),
            'TERRAFORM_RESOURCE_SET_MISMATCH')
    created = 0
    for item in changes:
        address = item['address']
        kind, name = address.split('.', 1)
        require(item.get('mode') == 'managed' and not item.get('module_address'), 'TERRAFORM_NONROOT_RESOURCE')
        require(item.get('provider_name') == 'registry.terraform.io/hashicorp/google', 'TERRAFORM_PROVIDER_MISMATCH')
        actions = item.get('change', {}).get('actions')
        require(actions in (['create'], ['no-op']), 'TERRAFORM_NONCREATE_CHANGE_' + address)
        after = item['change'].get('after') or {}
        if 'project' in config[kind][name]:
            require(after.get('project') == PROJECT, 'TERRAFORM_FOREIGN_PROJECT')
        for key in ('role', 'member', 'account_id', 'secret_id', 'name', 'location', 'region'):
            wanted = config[kind][name].get(key)
            if isinstance(wanted, str) and not wanted.startswith('${'):
                require(after.get(key) == wanted, 'TERRAFORM_VALUE_MISMATCH_' + key)
        created += actions == ['create']
    return created, len(expected) - created


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Runner:
    def __init__(self):
        self.env = dict(os.environ)
        require(not any(k.startswith('CLOUDSDK_API_ENDPOINT_OVERRIDES_') and v for k, v in self.env.items()),
                'GCLOUD_ENDPOINT_OVERRIDE_PRESENT')
        self.env.update(CLOUDSDK_CORE_LOG_HTTP='false', CLOUDSDK_CORE_USER_OUTPUT_ENABLED='true',
                        CLOUDSDK_CORE_DISABLE_PROMPTS='true')
        self.token = None
        self.work = None

    def run(self, cmd, label, timeout=60, env=None, cwd=None, echo=False):
        emit(label + '_STARTED')
        try:
            p = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                               timeout=timeout, env=env or self.env, cwd=cwd)
        except subprocess.TimeoutExpired:
            raise Stop(label + '_TIMEOUT_RECONCILE_BEFORE_RETRY') from None
        except OSError:
            raise Stop(label + '_EXECUTION_FAILED') from None
        if p.returncode:
            # These commands never read payloads. Redact the in-memory OAuth token anyway.
            detail = (p.stderr or p.stdout)[-5000:]
            if self.token:
                detail = detail.replace(self.token, '[REDACTED]')
            print(detail, file=sys.stderr)
            raise Stop(label + '_FAILED_RECONCILE_BEFORE_RETRY')
        if echo:
            print(p.stdout.replace(self.token or '\x00', '[REDACTED]'), flush=True)
        return p.stdout.strip()

    def cloud(self, *args):
        return self.run(['gcloud', *args, '--account=' + ACCOUNT, '--user-output-enabled',
                         '--verbosity=error'], 'GCLOUD_' + args[0].upper())

    def api(self, path, body=None, missing_ok=False):
        require(path in ('/b/' + STATE_BUCKET, '/b?project=' + PROJECT), 'API_PATH_REJECTED')
        request = urllib.request.Request('https://storage.googleapis.com/storage/v1' + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
                return json.loads(response.read(1048576))
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and missing_ok:
                return None
            raise Stop('STATE_BUCKET_HTTP_' + str(exc.code)) from None
        except (ValueError, OSError):
            raise Stop('STATE_BUCKET_READ_OR_WRITE_UNCERTAIN_RECONCILE_BEFORE_RETRY') from None

    def apply(self):
        terraform = shutil.which('terraform')
        fallback = Path.home() / 'bin' / 'terraform'
        if not terraform and fallback.is_file() and os.access(fallback, os.X_OK):
            terraform = str(fallback)
        require(terraform, 'TERRAFORM_REQUIRED_IN_PATH_OR_HOME_BIN')
        for key in ('impersonate_service_account', 'access_token_file', 'credential_file_override'):
            require(self.cloud('config', 'get-value', 'auth/' + key) in ('', '(unset)'), 'AUTH_OVERRIDE_PRESENT')
        project = json.loads(self.cloud('projects', 'describe', PROJECT, '--format=json'))
        billing = json.loads(self.cloud('billing', 'projects', 'describe', PROJECT, '--format=json'))
        services = json.loads(self.cloud('services', 'list', '--enabled', '--project=' + PROJECT, '--format=json'))
        validate_project(project, billing, services)
        self.token = self.cloud('auth', 'print-access-token')
        require(self.token and not any(c.isspace() for c in self.token), 'TOKEN_UNAVAILABLE')
        recovery_root = Path.home() / 'khedmah-preview-v2-bootstrap-runs'
        recovery_root.mkdir(mode=0o700, exist_ok=True)
        require(not recovery_root.is_symlink(), 'RECOVERY_DIRECTORY_SYMLINK_REJECTED')
        os.chmod(recovery_root, 0o700)
        self.work = Path(tempfile.mkdtemp(prefix='run-', dir=recovery_root))
        os.chmod(self.work, 0o700)
        (self.work / 'main.tf.json').write_text(json.dumps(manifest(), indent=2) + '\n')
        (self.work / '.terraform.lock.hcl').write_text(PROVIDER_LOCK)
        tfenv = {k: v for k, v in self.env.items() if not k.startswith(('GOOGLE_', 'GCLOUD_', 'TF_'))}
        tfenv.update(GOOGLE_OAUTH_ACCESS_TOKEN=self.token, TF_IN_AUTOMATION='1', TF_INPUT='0')
        # Validate the pinned provider/config BEFORE the first cloud write.
        self.run([terraform, 'init', '-backend=false', '-input=false', '-lockfile=readonly', '-no-color'],
                 'TERRAFORM_LOCAL_INIT', 300, tfenv, self.work)
        self.run([terraform, 'validate', '-no-color'], 'TERRAFORM_VALIDATE', 120, tfenv, self.work)
        bucket = self.api('/b/' + STATE_BUCKET, missing_ok=True)
        if bucket is None:
            emit('STATE_BUCKET_CREATE_ATTEMPT', project=PROJECT, bucket=STATE_BUCKET)
            bucket = self.api('/b?project=' + PROJECT, {
                'name': STATE_BUCKET, 'location': REGION, 'storageClass': 'STANDARD', 'labels': LABELS,
                'iamConfiguration': {'uniformBucketLevelAccess': {'enabled': True}, 'publicAccessPrevention': 'enforced'},
                'versioning': {'enabled': True}, 'softDeletePolicy': {'retentionDurationSeconds': '2592000'},
            })
        validate_bucket(bucket)
        validate_bucket(self.api('/b/' + STATE_BUCKET))
        emit('STATE_BUCKET_VERIFIED', bucket=STATE_BUCKET)
        self.run([terraform, 'init', '-reconfigure', '-input=false', '-lockfile=readonly', '-no-color'],
                 'TERRAFORM_REMOTE_INIT', 300, tfenv, self.work)
        self.run([terraform, 'plan', '-input=false', '-lock-timeout=0s', '-out=reviewed.tfplan', '-no-color'],
                 'TERRAFORM_PLAN', 600, tfenv, self.work)
        plan = json.loads(self.run([terraform, 'show', '-json', 'reviewed.tfplan'],
                                  'TERRAFORM_PLAN_READ', 120, tfenv, self.work))
        create, unchanged = validate_plan(plan)
        emit('PREVIEW_PLAN_SCOPE_VERIFIED', create=create, unchanged=unchanged, project=PROJECT)
        if create:
            # Refresh token immediately before applying the exact saved, checked plan.
            self.token = self.cloud('auth', 'print-access-token')
            tfenv['GOOGLE_OAUTH_ACCESS_TOKEN'] = self.token
            self.run([terraform, 'apply', '-input=false', '-lock-timeout=0s', '-no-color', 'reviewed.tfplan'],
                     'TERRAFORM_APPLY', 3300, tfenv, self.work, echo=True)
        outputs = json.loads(self.run([terraform, 'output', '-json'], 'TERRAFORM_OUTPUT', 60, tfenv, self.work))
        require(outputs.get('connection_name', {}).get('value') == f'{PROJECT}:{REGION}:{INSTANCE}',
                'SQL_CONNECTION_READBACK_MISMATCH')
        require(outputs.get('project_id', {}).get('value') == PROJECT, 'OUTPUT_PROJECT_MISMATCH')
        sql = json.loads(self.cloud('sql', 'instances', 'describe', INSTANCE, '--project=' + PROJECT, '--format=json'))
        require(sql.get('project') == PROJECT and sql.get('name') == INSTANCE and
                sql.get('region') == REGION and sql.get('state') == 'RUNNABLE' and
                sql.get('connectionName') == f'{PROJECT}:{REGION}:{INSTANCE}', 'SQL_LIVE_READBACK_MISMATCH')
        emit('PREVIEW_V2_INFRASTRUCTURE_VERIFIED', project=PROJECT, project_number=NUMBER,
             connection_name=outputs['connection_name']['value'], credentials_provisioned=False,
             database_roles_provisioned=False, application_deployed=False, floot_connected=False)
        print('NEXT: isolated SQL roles/credentials, Firebase/Maps/mail configuration, federation and deployment wiring; then migrations and browser/Floot acceptance.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--manifest', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    if args.manifest:
        print(json.dumps(manifest(), indent=2))
        return
    if not args.apply:
        emit('PLAN_ONLY_NO_MUTATION', project=PROJECT, state_bucket=STATE_BUCKET,
             resources=sum(map(len, manifest()['resource'].values())))
        return
    runner = Runner()
    try:
        runner.apply()
    except (Stop, ValueError, KeyError) as exc:
        print('STOP: ' + (str(exc) if isinstance(exc, Stop) else 'INVALID_TOOL_RESPONSE'), file=sys.stderr)
        if runner.work:
            print('LOCAL_RECOVERY_DIRECTORY=' + str(runner.work), file=sys.stderr)
        raise SystemExit(1)
    else:
        if runner.work:
            shutil.rmtree(runner.work)


if __name__ == '__main__':
    main()
