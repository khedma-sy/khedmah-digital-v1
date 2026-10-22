#!/usr/bin/env python3
"""Read selected Preview V2 binding and direct-policy metadata; never deploy.

The frozen catalog reader supplies only preflight/cloud helpers. Its database,
token and secret-payload functions are never called. Federation source is parsed
as inert data. A receipt observes configuration, not effective release authority.
"""
import ast
import base64
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ACCOUNT = 'haifawi30@gmail.com'
REGION = 'europe-west1'
INSTANCE = 'khedmah-preview-v2-db'
CONNECTION = PROJECT + ':' + REGION + ':' + INSTANCE
SERVICE = 'khedmah-pr-274-backend'
KNOWN_REVISION = SERVICE + '-00008-tg8'
REPO = 'khedma-sy/khedmah-digital-v1'
READER_BLOB = '1f1565473cc1ab8d8e98791f0fc4af440f9d3d32'
READER_SHA256 = '154d46eab2799d131ca3134f7c8c0eebee58491e2190e9d86da205cd91c72d11'
FEDERATION_BLOB = '6694a1ab2a1cc4132992bd4918337f6af40791f8'
FEDERATION_SHA256 = '119e06b4ba23c77b755f5994d644f5778a4cc9c4985155134a6dd21fea6d8b26'
POOL = 'khedmah-preview-github'
PROVIDER = 'github-actions'
POOL_NAME = f'projects/{NUMBER}/locations/global/workloadIdentityPools/{POOL}'
PROVIDER_NAME = POOL_NAME + '/providers/' + PROVIDER
WIF_MEMBER = 'principalSet://iam.googleapis.com/' + POOL_NAME + '/attribute.repository_id/1307435925'
IDENTITIES = {role: f'khedmah-pv2-{role}@{PROJECT}.iam.gserviceaccount.com'
              for role in ('deployer', 'runtime', 'migrator', 'build')}
ENVIRONMENT_PATH = 'repos/' + REPO + '/environments/preview'
BRANCH_POLICY_PATH = ENVIRONMENT_PATH + '/deployment-branch-policies?per_page=100'
MAX_REVISIONS = 10
MAX_RESPONSE = 2 * 1024 * 1024
REGION_ARG = '--region=' + REGION
SERVICE_ARGS = ('run', 'services', 'describe', SERVICE, REGION_ARG)
# Project the entire repeated container field. `containers.env` loses the array;
# `containers[].env` can prune an env-less sidecar and hide its cardinality.
SERVICE_FIELDS = ('metadata.name,metadata.namespace,metadata.generation,metadata.labels,'
                  'metadata.deletionTimestamp,spec.template.metadata,spec.template.spec.serviceAccountName,'
                  'spec.template.spec.containers,spec.template.spec.timeoutSeconds,status.observedGeneration,status.conditions,'
                  'status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic')
REVISION_FIELDS = ('metadata.name,metadata.namespace,metadata.labels,metadata.annotations,'
                   'metadata.deletionTimestamp,spec.serviceAccountName,spec.containers,spec.timeoutSeconds,status.conditions')
CLOUD_READS = {
    SERVICE_ARGS: SERVICE_FIELDS,
    ('sql', 'instances', 'describe', INSTANCE): 'name,project,region,connectionName,state,databaseVersion',
    ('projects', 'get-iam-policy', PROJECT): 'version,bindings',
    ('iam', 'service-accounts', 'get-iam-policy', IDENTITIES['deployer']): 'version,bindings',
    ('iam', 'workload-identity-pools', 'describe', POOL, '--location=global'): 'name,state,disabled',
    ('iam', 'workload-identity-pools', 'providers', 'describe', PROVIDER, '--location=global',
     '--workload-identity-pool=' + POOL): 'name,state,disabled,attributeMapping,attributeCondition,oidc,aws,saml,x509',
}
for _email in IDENTITIES.values():
    CLOUD_READS[('iam', 'service-accounts', 'describe', _email)] = 'name,email,projectId,uniqueId,disabled'
    CLOUD_READS[('iam', 'service-accounts', 'get-iam-policy', _email)] = 'version,bindings'
for _secret in ('DATABASE_URL', 'DATABASE_MIGRATION_URL'):
    CLOUD_READS[('secrets', 'versions', 'describe', '1', '--secret=' + _secret)] = 'name,state'


def stop(code):
    raise SystemExit('STOP: ' + code)


def require(ok, code):
    if not ok:
        stop(code)


def revision_name(value):
    return (isinstance(value, str) and len(value) <= 63
            and re.fullmatch(re.escape(SERVICE) + r'-[a-z0-9]+(?:-[a-z0-9]+)*', value) is not None)


def gh_json(path, optional=False):
    allowed = {ENVIRONMENT_PATH, BRANCH_POLICY_PATH,
               *('repos/' + REPO + '/git/blobs/' + x for x in (READER_BLOB, FEDERATION_BLOB))}
    require(path in allowed, 'GITHUB_READ_SCOPE_REJECTED')
    env = {k: v for k, v in os.environ.items() if k not in ('GH_DEBUG', 'DEBUG')}
    try:
        result = subprocess.run(['gh', 'api', '--hostname', 'github.com', '--method', 'GET', path],
                                capture_output=True, timeout=60, env=env)
    except (OSError, subprocess.TimeoutExpired):
        if optional:
            return None
        stop('PINNED_SOURCE_READ_UNAVAILABLE')
    if result.returncode:
        if optional:
            return None
        stop('PINNED_SOURCE_READ_UNAVAILABLE')
    require(len(result.stdout) <= MAX_RESPONSE, 'GITHUB_METADATA_TOO_LARGE')
    try:
        value = json.loads(result.stdout)
    except (ValueError, TypeError):
        stop('GITHUB_METADATA_INVALID')
    require(isinstance(value, dict), 'GITHUB_METADATA_INVALID')
    return value


def verify_source(data, blob, checksum):
    require(isinstance(data, bytes) and len(data) <= 262144, 'PINNED_SOURCE_BYTES_INVALID')
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    require(actual == blob and hashlib.sha256(data).hexdigest() == checksum, 'PINNED_SOURCE_BYTES_MISMATCH')
    return data


def fetch_blob(blob, checksum):
    value = gh_json('repos/' + REPO + '/git/blobs/' + blob)
    require(isinstance(value, dict) and value.get('sha') == blob
            and value.get('encoding') == 'base64', 'PINNED_SOURCE_METADATA_MISMATCH')
    try:
        data = base64.b64decode(''.join(value['content'].split()), validate=True)
    except (ValueError, KeyError, TypeError, AttributeError):
        stop('PINNED_SOURCE_ENCODING_INVALID')
    require(type(value.get('size')) is int and value['size'] == len(data), 'PINNED_SOURCE_SIZE_MISMATCH')
    return verify_source(data, blob, checksum)


def federation_reference(source):
    verify_source(source, FEDERATION_BLOB, FEDERATION_SHA256)
    # Evaluate only string literals, fixed-name references, concatenation and the
    # CLAIMS dictionary. Never import/exec the historical mutation-capable batch.
    names = {}

    def inert(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name) and node.id in names:
            return names[node.id]
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            return inert(node.left) + inert(node.right)
        if isinstance(node, ast.Dict):
            return {inert(k): inert(v) for k, v in zip(node.keys, node.values)}
        stop('FEDERATION_REFERENCE_SHAPE_INVALID')

    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name in ('REPO', 'REPO_ID', 'OWNER_ID', 'BRANCH', 'CLAIMS'):
                require(name not in names, 'FEDERATION_REFERENCE_DUPLICATE')
                names[name] = inert(node.value)
    require(names.get('REPO') == REPO and names.get('REPO_ID') == '1307435925'
            and names.get('OWNER_ID') == '307214577' and isinstance(names.get('CLAIMS'), dict),
            'FEDERATION_REFERENCE_IDENTITY_MISMATCH')
    claims = names['CLAIMS']
    return dict(condition=' && '.join(f"assertion.{key} == '{value}'" for key, value in claims.items()),
                mapping={'google.subject': 'assertion.sub',
                         **{'attribute.' + key: 'assertion.' + key for key in claims}}, branch=names['BRANCH'])


def load_sources(work):
    source = fetch_blob(READER_BLOB, READER_SHA256)
    reference = federation_reference(fetch_blob(FEDERATION_BLOB, FEDERATION_SHA256))
    verify_source(source, READER_BLOB, READER_SHA256)
    path = work / 'pinned_reader.py'
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(source)
    spec = importlib.util.spec_from_file_location('preview_approval_release_transport', path)
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    require((reader.PROJECT, reader.NUMBER, reader.ACCOUNT, reader.REGION, reader.CONNECTION)
            == (PROJECT, NUMBER, ACCOUNT, REGION, CONNECTION), 'FROZEN_READER_IDENTITY_MISMATCH')
    return reader, reference


def cloud_read(reader, args, optional=False):
    args = tuple(args)
    fields = CLOUD_READS.get(args)
    if (len(args) == 5 and args[:3] == ('run', 'revisions', 'describe')
            and args[4] == REGION_ARG and revision_name(args[3])):
        fields = REVISION_FIELDS
    require(fields is not None, 'CLOUD_READ_SCOPE_REJECTED')
    try:
        value = reader.cloud(*args, fields=fields)
    except SystemExit as exc:
        failed = 'STOP: GCLOUD_' + '_'.join(args[:3]).upper().replace('-', '_') + '_FAILED_RECONCILE'
        if optional and str(exc) in (failed, 'STOP: GCLOUD_OPERATION_UNCONFIRMED_RECONCILE_BEFORE_RETRY'):
            return None
        raise
    require(len(json.dumps(value)) <= MAX_RESPONSE, 'CLOUD_METADATA_TOO_LARGE')
    require(isinstance(value, dict), 'CLOUD_METADATA_INVALID')
    return value


def ready(status):
    require(isinstance(status, dict) and isinstance(status.get('conditions'), list)
            and len(status['conditions']) <= 50 and all(isinstance(x, dict) and isinstance(x.get('type'), str)
                and x.get('status') in ('True', 'False', 'Unknown') for x in status['conditions']), 'READY_METADATA_INVALID')
    rows = [x for x in status['conditions'] if x.get('type') == 'Ready']
    require(len(rows) == 1 and rows[0].get('status') in ('True', 'False', 'Unknown'), 'READY_METADATA_INVALID')
    return rows[0]['status'] == 'True'


def binding(spec, metadata):
    require(isinstance(spec, dict) and isinstance(metadata, dict)
            and isinstance(spec.get('serviceAccountName'), str), 'BINDING_METADATA_INVALID')
    containers, annotations = spec.get('containers'), metadata.get('annotations', {})
    require(isinstance(containers, list) and len(containers) == 1 and isinstance(containers[0], dict)
            and isinstance(annotations, dict), 'BINDING_METADATA_INVALID')
    rows = containers[0].get('env', [])
    require(isinstance(rows, list) and len(rows) <= 300, 'ENV_METADATA_INVALID')
    env = {}
    for row in rows:
        require(isinstance(row, dict) and isinstance(row.get('name'), str)
                and row['name'] not in env, 'ENV_METADATA_INVALID')
        env[row['name']] = row
    aliases = {}
    alias_text = annotations.get('run.googleapis.com/secrets', '')
    require(isinstance(alias_text, str) and len(alias_text) <= 32768, 'SECRET_ALIAS_METADATA_INVALID')
    for part in alias_text.split(',') if alias_text else []:
        require(part.count(':') == 1, 'SECRET_ALIAS_METADATA_INVALID')
        name, target = part.split(':', 1)
        require(name and name not in aliases and target, 'SECRET_ALIAS_METADATA_INVALID')
        aliases[name] = target
    def reference(name):
        row = env.get(name)
        if row is None:
            return dict(form='absent', version='absent', recognized=False)
        if 'valueFrom' in row:
            require('value' not in row and isinstance(row['valueFrom'], dict), 'SECRET_REFERENCE_METADATA_INVALID')
            ref = row['valueFrom'].get('secretKeyRef')
            require(isinstance(ref, dict) and isinstance(ref.get('name'), str)
                    and type(ref.get('key')) in (str, int), 'SECRET_REFERENCE_METADATA_INVALID')
            target = aliases.get(ref['name'], ref['name'])
            known = {name: 'local_name', f'projects/{NUMBER}/secrets/{name}': 'project_number_resource',
                     f'projects/{PROJECT}/secrets/{name}': 'project_id_resource'}
            form = known.get(target, 'unrecognized')
            version = str(ref['key'])
            safe_version = version == 'latest' or re.fullmatch(r'[1-9][0-9]{0,19}', version) is not None
            return dict(form=form, version=version if safe_version else 'unrecognized',
                        recognized=form != 'unrecognized' and safe_version)
        require(type(row.get('value', '')) is str, 'ENV_METADATA_INVALID')
        return dict(form='plain_value', version='absent', recognized=False)

    database = reference('DATABASE_URL')
    operations = reference('OPERATIONS_PRODUCT_ROLE_BINDINGS')
    timeout = spec.get('timeoutSeconds')
    require(timeout is None or type(timeout) in (str, int) and re.fullmatch(r'[1-9][0-9]{0,3}', str(timeout))
            and int(timeout) <= 3600, 'REQUEST_TIMEOUT_METADATA_INVALID')
    connection = env.get('CLOUD_SQL_INSTANCE_CONNECTION_NAME', {})
    flag = env.get('CLASSIFIEDS_ENABLED')
    flag_state = ('absent' if flag is None else flag.get('value')
                  if 'valueFrom' not in flag and flag.get('value') in ('true', 'false') else 'invalid')
    return dict(runtime_service_account_matches=spec['serviceAccountName'] == IDENTITIES['runtime'],
                cloudsql_annotation_matches=annotations.get('run.googleapis.com/cloudsql-instances') == CONNECTION,
                connection_env_matches=connection.get('value') == CONNECTION and 'valueFrom' not in connection,
                database_url_reference_form=database['form'], database_url_version_one=database['version'] == '1',
                database_url_reference_matches=database['recognized'] and database['version'] == '1',
                operations_role_bindings_reference=operations,
                request_timeout_seconds=None if timeout is None else int(timeout), classifieds_enabled=flag_state)


def service_summary(value):
    metadata, status = value.get('metadata', {}), value.get('status', {})
    require(isinstance(metadata, dict) and isinstance(status, dict)
            and metadata.get('name') == SERVICE and str(metadata.get('namespace')) == NUMBER
            and metadata.get('labels', {}).get('cloud.googleapis.com/location') == REGION
            and not metadata.get('deletionTimestamp'), 'SERVICE_IDENTITY_MISMATCH')
    generation = metadata.get('generation')
    require(type(generation) in (str, int) and re.fullmatch(r'[1-9][0-9]*', str(generation))
            and type(status.get('observedGeneration')) in (str, int)
            and str(status['observedGeneration']) == str(generation), 'SERVICE_GENERATION_UNCONFIRMED')
    created, latest_ready = status.get('latestCreatedRevisionName'), status.get('latestReadyRevisionName')
    require(revision_name(created) and revision_name(latest_ready), 'SERVICE_REVISION_METADATA_INVALID')
    traffic = status.get('traffic')
    require(isinstance(traffic, list) and 1 <= len(traffic) <= 30, 'SERVICE_TRAFFIC_INVALID')
    targets, total, tags = {}, 0, set()
    for row in traffic:
        require(isinstance(row, dict) and revision_name(row.get('revisionName')), 'SERVICE_TRAFFIC_INVALID')
        percent, tag = row.get('percent', 0), row.get('tag')
        require(type(percent) is int and 0 <= percent <= 100
                and (tag is None or isinstance(tag, str) and re.fullmatch(r'[a-z][a-z0-9-]{0,62}', tag)), 'SERVICE_TRAFFIC_INVALID')
        require('latestRevision' not in row or type(row['latestRevision']) is bool, 'SERVICE_TRAFFIC_INVALID')
        require(not row.get('latestRevision') or row['revisionName'] == latest_ready, 'SERVICE_TRAFFIC_INVALID')
        if tag is not None:
            require(tag not in tags, 'SERVICE_TRAFFIC_INVALID')
            tags.add(tag)
        total += percent
        if percent or tag:
            target = targets.setdefault(row['revisionName'], dict(percent=0, tagged=False))
            target['percent'] += percent
            target['tagged'] |= tag is not None
    require(total == 100 and 1 <= len(targets) <= MAX_REVISIONS, 'SERVICE_TRAFFIC_INVALID')
    template = value.get('spec', {}).get('template', {})
    require(isinstance(template, dict), 'SERVICE_TEMPLATE_INVALID')
    return dict(generation=str(generation), ready=ready(status), latest_created_revision=created,
                latest_ready_revision=latest_ready,
                traffic=[dict(revision=name, **targets[name]) for name in sorted(targets)],
                latest_template_binding=binding(template.get('spec'), template.get('metadata', {})))


def revision_summary(value, name):
    metadata = value.get('metadata', {})
    require(isinstance(metadata, dict) and metadata.get('name') == name
            and str(metadata.get('namespace')) == NUMBER and not metadata.get('deletionTimestamp')
            and metadata.get('labels', {}).get('serving.knative.dev/service') == SERVICE
            and metadata.get('labels', {}).get('cloud.googleapis.com/location', REGION) == REGION,
            'REVISION_IDENTITY_MISMATCH')
    return dict(revision=name, ready=ready(value.get('status')), binding=binding(value.get('spec'), metadata),
                matches_previous_revision=name == KNOWN_REVISION, provenance_followup_required=name != KNOWN_REVISION)


def service_account(value, email):
    if value is None:
        return dict(status='read_unavailable', enabled=None)
    require(value.get('email') == email and value.get('projectId') == PROJECT
            and value.get('name') in (f'projects/{PROJECT}/serviceAccounts/{email}', f'projects/{NUMBER}/serviceAccounts/{email}')
            and isinstance(value.get('uniqueId'), str) and re.fullmatch(r'[0-9]{1,30}', value['uniqueId'])
            and type(value.get('disabled', False)) is bool, 'SERVICE_ACCOUNT_IDENTITY_MISMATCH')
    return dict(status='read', enabled=not value.get('disabled', False))


def secret_version(value, name):
    if value is None:
        return dict(status='read_unavailable', state=None)
    require(value.get('name') == f'projects/{NUMBER}/secrets/{name}/versions/1'
            and value.get('state') in ('ENABLED', 'DISABLED', 'DESTROYED'), 'SECRET_VERSION_IDENTITY_MISMATCH')
    return dict(status='read', state=value['state'])


def federation(value, reference, provider=False):
    if value is None:
        return dict(status='read_unavailable', enabled=None)
    require(value.get('name') == (PROVIDER_NAME if provider else POOL_NAME)
            and value.get('state') in ('ACTIVE', 'DELETED')
            and type(value.get('disabled', False)) is bool, 'FEDERATION_IDENTITY_MISMATCH')
    result = dict(status='read', enabled=value['state'] == 'ACTIVE' and not value.get('disabled', False))
    if provider:
        require(isinstance(value.get('attributeMapping'), dict)
                and isinstance(value.get('attributeCondition', ''), str)
                and isinstance(value.get('oidc', {}), dict), 'FEDERATION_METADATA_INVALID')
        oidc = value.get('oidc', {})
        result.update(condition_matches_historical_pr274=value.get('attributeCondition') == reference['condition'],
                      mapping_matches_historical_pr274=value['attributeMapping'] == reference['mapping'],
                      github_oidc_matches=oidc.get('issuerUri') == 'https://token.actions.githubusercontent.com'
                      and oidc.get('allowedAudiences', []) == [] and not oidc.get('jwksJson')
                      and not any(value.get(k) for k in ('aws', 'saml', 'x509')))
    return result


def policy_summary(value, members):
    if value is None:
        return dict(status='read_unavailable', direct_bindings=None, effective_permissions_verified=False)
    bindings = value.get('bindings', [])
    require(type(value.get('version', 1)) is int and value.get('version', 1) in (0, 1, 3)
            and isinstance(bindings, list) and len(bindings) <= 5000, 'IAM_POLICY_METADATA_INVALID')
    selected = {label: [] for label in members}
    for row in bindings:
        require(isinstance(row, dict) and isinstance(row.get('role'), str)
                and isinstance(row.get('members'), list) and len(row['members']) <= 10000
                and all(isinstance(member, str) for member in row['members']), 'IAM_POLICY_METADATA_INVALID')
        condition = row.get('condition')
        require('condition' not in row or isinstance(condition, dict)
                and isinstance(condition.get('expression'), str) and isinstance(condition.get('title'), str), 'IAM_POLICY_METADATA_INVALID')
        require('_withcond_' not in row['role'] and (condition is None or value.get('version') == 3), 'IAM_POLICY_CONDITIONS_UNCONFIRMED')
        for label, member in members.items():
            if member in row['members']:
                require(re.fullmatch(r'(?:roles/[A-Za-z0-9.]+|projects/(?:' + PROJECT + '|' + NUMBER
                                     + r')/roles/[A-Za-z0-9_.]+|organizations/594049370623/roles/[A-Za-z0-9_.]+)', row['role'])
                        and len(row['role']) <= 256, 'IAM_ROLE_NAME_INVALID')
                selected[label].append(dict(role=row['role'], conditional=condition is not None))
    return dict(status='read', direct_bindings={k: sorted(v, key=lambda x: (x['role'], x['conditional']))
                for k, v in selected.items()}, effective_permissions_verified=False)


def environment_summary(value, branches=None, historical_branch=None):
    if value is None:
        return dict(status='read_unavailable', complete=False)
    require(isinstance(value, dict) and value.get('name') == 'preview'
            and ('can_admins_bypass' not in value or type(value['can_admins_bypass']) is bool)
            and isinstance(value.get('protection_rules'), list) and len(value['protection_rules']) <= 100,
            'GITHUB_ENVIRONMENT_METADATA_INVALID')
    policy = value.get('deployment_branch_policy')
    require(policy is None or isinstance(policy, dict)
            and type(policy.get('protected_branches')) is bool and type(policy.get('custom_branch_policies')) is bool,
            'GITHUB_ENVIRONMENT_METADATA_INVALID')
    rules = []
    for row in value['protection_rules']:
        require(isinstance(row, dict) and isinstance(row.get('type'), str), 'GITHUB_ENVIRONMENT_METADATA_INVALID')
        kind = row['type']
        rule = dict(type=kind if kind in ('required_reviewers', 'wait_timer', 'branch_policy') else 'other')
        if kind == 'required_reviewers':
            require(isinstance(row.get('reviewers'), list) and len(row['reviewers']) <= 100
                    and type(row.get('prevent_self_review')) is bool
                    and all(isinstance(x, dict) and x.get('type') in ('User', 'Team')
                            and isinstance(x.get('reviewer'), dict) and type(x['reviewer'].get('id')) is int
                            and x['reviewer']['id'] > 0 for x in row['reviewers']), 'GITHUB_ENVIRONMENT_METADATA_INVALID')
            rule.update(required_reviewer_count=len(row['reviewers']), prevent_self_review=row['prevent_self_review'])
        if kind == 'wait_timer':
            require(type(row.get('wait_timer')) is int and 0 <= row['wait_timer'] <= 43200, 'GITHUB_ENVIRONMENT_METADATA_INVALID')
            rule['wait_timer_minutes'] = row['wait_timer']
        rules.append(rule)
    custom = bool(policy and policy['custom_branch_policies'])
    result = dict(status='read', can_admins_bypass=value.get('can_admins_bypass'),
                  deployment_branch_policy=None if policy is None else {
                      'protected_branches': policy['protected_branches'],
                      'custom_branch_policies': policy['custom_branch_policies']},
                  protection_rules=rules, complete=not custom and 'can_admins_bypass' in value
                  and all(x['type'] != 'other' for x in rules))
    if custom:
        result['custom_branch_rules'] = dict(status='read_unavailable', complete=False)
        if branches is not None:
            require(isinstance(branches, dict) and type(branches.get('total_count')) is int
                    and isinstance(branches.get('branch_policies'), list) and len(branches['branch_policies']) <= 100,
                    'GITHUB_BRANCH_POLICY_METADATA_INVALID')
            rows = branches['branch_policies']
            require(branches['total_count'] >= len(rows) and all(isinstance(x, dict) and isinstance(x.get('name'), str)
                    and x.get('type', 'branch') in ('branch', 'tag') for x in rows), 'GITHUB_BRANCH_POLICY_METADATA_INVALID')
            complete = branches['total_count'] == len(rows)
            result['custom_branch_rules'] = dict(status='read', complete=complete, total_count=branches['total_count'],
                historical_branch_exact=any(x['name'] == historical_branch and x.get('type', 'branch') == 'branch' for x in rows),
                main_exact=any(x['name'] == 'main' and x.get('type', 'branch') == 'branch' for x in rows),
                other_rule_count=sum(x['name'] not in ('main', historical_branch) or x.get('type', 'branch') != 'branch' for x in rows))
            result['complete'] = complete and 'can_admins_bypass' in value and all(x['type'] != 'other' for x in rules)
    return result


def collect(reader, reference):
    reader.preflight()
    service_raw = cloud_read(reader, SERVICE_ARGS)
    service = service_summary(service_raw)
    revisions = [revision_summary(cloud_read(reader, ('run', 'revisions', 'describe', row['revision'], REGION_ARG)), row['revision'])
                 for row in service['traffic']]
    instance = cloud_read(reader, ('sql', 'instances', 'describe', INSTANCE))
    require(all(instance.get(k) == v for k, v in dict(name=INSTANCE, project=PROJECT, region=REGION,
            connectionName=CONNECTION, databaseVersion='POSTGRES_16', state='RUNNABLE').items()), 'SQL_INSTANCE_IDENTITY_OR_STATE_MISMATCH')
    accounts = {role: service_account(cloud_read(reader, ('iam', 'service-accounts', 'describe', email), optional=True), email)
                for role, email in IDENTITIES.items()}
    versions = {name: secret_version(cloud_read(reader, ('secrets', 'versions', 'describe', '1', '--secret=' + name), optional=True), name)
                for name in ('DATABASE_URL', 'DATABASE_MIGRATION_URL')}
    pool = federation(cloud_read(reader, ('iam', 'workload-identity-pools', 'describe', POOL, '--location=global'), optional=True), reference)
    provider = federation(cloud_read(reader, ('iam', 'workload-identity-pools', 'providers', 'describe', PROVIDER,
        '--location=global', '--workload-identity-pool=' + POOL), optional=True), reference, provider=True)
    principals = {'owner': 'user:' + ACCOUNT, **{k: 'serviceAccount:' + v for k, v in IDENTITIES.items()}}
    deployer = policy_summary(cloud_read(reader, ('iam', 'service-accounts', 'get-iam-policy', IDENTITIES['deployer']), optional=True),
                              {'historical_wif_principal': WIF_MEMBER, **principals})
    scoped = {role: policy_summary(cloud_read(reader, ('iam', 'service-accounts', 'get-iam-policy', IDENTITIES[role]), optional=True), principals)
              for role in ('runtime', 'migrator', 'build')}
    project = policy_summary(cloud_read(reader, ('projects', 'get-iam-policy', PROJECT), optional=True),
                             principals)
    environment = gh_json(ENVIRONMENT_PATH, optional=True)
    branches = (gh_json(BRANCH_POLICY_PATH, optional=True) if isinstance(environment, dict)
                and isinstance(environment.get('deployment_branch_policy'), dict)
                and environment['deployment_branch_policy'].get('custom_branch_policies') is True else None)
    github = environment_summary(environment, branches, reference['branch'])
    service_after = cloud_read(reader, SERVICE_ARGS)
    service_summary(service_after)
    # Compare the private bounded metadata, not only its redacted projection:
    # changed tag names or other template fields must not disappear in redaction.
    require(service_after == service_raw, 'SERVICE_CHANGED_DURING_METADATA_READ')
    return dict(stage='PREVIEW_V2_APPROVAL_RELEASE_METADATA_READ_COMPLETED', project=PROJECT, region=REGION,
        service=SERVICE, service_metadata=service, serving_revisions=revisions,
        sql_instance_identity_verified=True, service_metadata_stable_on_reread=True,
        execution_identities=accounts, secret_version_metadata=versions, workload_identity_pool=pool,
        workload_identity_provider=provider, deployer_direct_policy=deployer, project_direct_policy=project,
        scoped_service_account_policies=scoped,
        github_preview_environment=github, policy_snapshot_atomic=False,
        reader_git_blob=READER_BLOB, reader_sha256=READER_SHA256,
        federation_reference_git_blob=FEDERATION_BLOB, federation_reference_sha256=FEDERATION_SHA256,
        secret_payload_access=False, credential_values_printed=False, database_connection_opened=False,
        application_data_rows_read=False, cloud_resource_mutation=False, schema_mutation=False, role_mutation=False,
        application_data_mutation=False, application_deployment_performed=False, build_provenance_reread=False,
        deployment_authority_verified=False, schema_readiness_verified=False, release_gates_verified=False,
        evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())


def inspect():
    require(all(shutil.which(name) for name in ('gh', 'gcloud')), 'REQUIRED_METADATA_TOOLS_MISSING')
    with tempfile.TemporaryDirectory(prefix='pv2-release-', dir='/tmp') as directory:
        work = Path(directory)
        os.chmod(work, 0o700)
        reader, reference = load_sources(work)
        receipt = collect(reader, reference)
    print(json.dumps(receipt, sort_keys=True))


def main(argv=None):
    require((sys.argv[1:] if argv is None else argv) == ['--inspect'], 'USE_INSPECT_ONLY')
    os.umask(0o077)
    try:
        inspect()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, EOFError, SyntaxError,
            subprocess.SubprocessError, KeyboardInterrupt):
        stop('LOCAL_OR_RELEASE_METADATA_READ_FAILURE')


if __name__ == '__main__':
    main()
