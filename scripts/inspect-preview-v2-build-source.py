#!/usr/bin/env python3
"""Owner-only metadata reconciliation of the first Preview build-source denial."""
import argparse
import datetime
import json
import os
import re
import subprocess

PROJECT = 'khedmah-preview-v2-20261012'
NUMBER = '1044962071847'
ACCOUNT = 'haifawi30@gmail.com'
REGION = 'europe-west1'
BUCKET = PROJECT + '-cloudbuild-source'
DEPLOYER = 'khedmah-pv2-deployer@' + PROJECT + '.iam.gserviceaccount.com'
BUILD = 'khedmah-pv2-build@' + PROJECT + '.iam.gserviceaccount.com'
MEMBERS = {'serviceAccount:' + DEPLOYER, 'serviceAccount:' + BUILD,
           'allUsers', 'allAuthenticatedUsers'}
START = '2026-10-14T11:15:00Z'
END = '2026-10-14T11:18:00Z'
PERMISSIONS = {'storage.buckets.get', 'storage.buckets.list', 'storage.objects.create',
               'storage.objects.get', 'storage.objects.list', 'serviceusage.services.use',
               'cloudbuild.builds.create', 'cloudbuild.builds.get', 'cloudbuild.builds.list'}


def emit(stage, **fields):
    print(json.dumps(dict(stage=stage, **fields), sort_keys=True), flush=True)


def stop(code):
    raise SystemExit('STOP: ' + code)


def cloud(*args, fields=None, plain=False):
    env = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS='true',
               CLOUDSDK_CORE_LOG_HTTP='false', CLOUDSDK_CORE_DISABLE_FILE_LOGGING='true',
               CLOUDSDK_CORE_USER_OUTPUT_ENABLED='true', LC_ALL='C')
    command = ['gcloud', *args, '--project=' + PROJECT, '--account=' + ACCOUNT,
               '--user-output-enabled', '--verbosity=error']
    if not plain:
        command.append('--format=json' + (('(' + fields + ')') if fields else ''))
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, timeout=60, env=env)
    except (OSError, subprocess.TimeoutExpired):
        return {'outcome': 'LOCAL_READ_FAILED'}, None
    if result.returncode:
        error = result.stderr
        outcome = ('PERMISSION_DENIED' if re.search(r'PERMISSION_DENIED|forbidden|permission.*denied', error, re.I)
                   else 'API_UNAVAILABLE' if re.search(r'SERVICE_DISABLED|API.*(?:not enabled|disabled|not been used)', error, re.I)
                   else 'NOT_FOUND_REPORTED' if re.search(r'NOT_FOUND|not found|does not exist', error, re.I)
                   else 'READ_FAILED')
        return {'outcome': outcome}, None
    if plain:
        return {'outcome': 'OK'}, result.stdout.strip()
    if len(result.stdout) > 2 * 1024 * 1024:
        return {'outcome': 'RESPONSE_LIMIT'}, None
    try:
        data = json.loads(result.stdout)
    except ValueError:
        return {'outcome': 'INVALID_METADATA'}, None
    return {'outcome': 'OK'}, data


def selected_policy(data):
    if not isinstance(data, dict) or not isinstance(data.get('bindings', []), list):
        stop('INVALID_POLICY_METADATA')
    selected = []
    for binding in data.get('bindings', []):
        if not isinstance(binding, dict) or not isinstance(binding.get('members'), list):
            stop('INVALID_POLICY_BINDING')
        members = sorted(MEMBERS.intersection(binding['members']))
        if members:
            item = {'role': binding.get('role'), 'members': members}
            if 'condition' in binding:
                item['condition'] = binding['condition']
            selected.append(item)
    return {'version': data.get('version', 1), 'selected_bindings': selected,
            'full_effective_iam_verified': False}


def bounded_list(stage, args, fields, limit):
    result, data = cloud(*args, '--limit=' + str(limit), fields=fields)
    if data is not None and not isinstance(data, list):
        result, data = {'outcome': 'INVALID_METADATA'}, None
    complete = data is not None and len(data) < limit
    emit(stage, **result, entries=data, inventory_complete=complete,
         empty_observed=complete and len(data) == 0)
    return complete


def inspect():
    for key in ('CLOUDSDK_AUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE',
                'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT'):
        if os.environ.get(key):
            stop('AUTH_OVERRIDE_PRESENT')
    for key in ('impersonate_service_account', 'access_token_file', 'credential_file_override'):
        result, value = cloud('config', 'get-value', 'auth/' + key, plain=True)
        if result['outcome'] != 'OK' or value not in ('', '(unset)'):
            stop('AUTH_CONFIGURATION_UNCONFIRMED')
    result, project = cloud('projects', 'describe', PROJECT,
                            fields='projectId,projectNumber,lifecycleState,parent')
    if (result['outcome'] != 'OK' or not isinstance(project, dict)
            or project.get('projectId') != PROJECT or str(project.get('projectNumber')) != NUMBER
            or project.get('lifecycleState') != 'ACTIVE'
            or project.get('parent') != {'id': '594049370623', 'type': 'organization'}):
        stop('PROJECT_IDENTITY_UNCONFIRMED')
    emit('PREVIEW_BUILD_SOURCE_PROJECT_VERIFIED', project=PROJECT, project_number=NUMBER)
    result, bucket = cloud('storage', 'buckets', 'describe', 'gs://' + BUCKET, '--raw',
                           fields='name,projectNumber,location,iamConfiguration')
    if bucket is not None and (not isinstance(bucket, dict) or bucket.get('name') != BUCKET
            or str(bucket.get('projectNumber')) != NUMBER or bucket.get('location') != 'EUROPE-WEST1'):
        stop('SOURCE_BUCKET_IDENTITY_MISMATCH')
    emit('PREVIEW_BUILD_SOURCE_BUCKET_METADATA', **result, metadata=bucket)
    for stage, args in (
        ('PREVIEW_BUILD_SOURCE_DIRECT_IAM', ('storage', 'buckets', 'get-iam-policy', 'gs://' + BUCKET)),
        ('PREVIEW_BUILD_PROJECT_SELECTED_IAM', ('projects', 'get-iam-policy', PROJECT))):
        result, policy = cloud(*args)
        emit(stage, **result, policy=selected_policy(policy) if policy is not None else None)
    for role in ('roles/storage.objectAdmin', 'roles/storage.objectViewer',
                 'roles/serviceusage.serviceUsageConsumer'):
        result, metadata = cloud('iam', 'roles', 'describe', role, fields='name,includedPermissions')
        if metadata is not None and (not isinstance(metadata, dict) or metadata.get('name') != role
                or not isinstance(metadata.get('includedPermissions'), list)):
            stop('ROLE_METADATA_MISMATCH')
        emit('PREVIEW_BUILD_RELEVANT_ROLE_PERMISSIONS', **result, role=role,
             relevant_permissions=sorted(PERMISSIONS.intersection(metadata['includedPermissions'])) if metadata else None)
    complete = []
    for kind in ('services', 'jobs'):
        complete.append(bounded_list('PREVIEW_BUILD_RECONCILE_' + kind.upper(),
            ('run', kind, 'list', '--region=' + REGION), 'metadata.name,metadata.namespace', 101))
    complete.append(bounded_list('PREVIEW_BUILD_ATTEMPT_WINDOW',
        ('builds', 'list', '--region=' + REGION, '--filter=createTime>="' + START + '" AND createTime<"' + END + '"',
         '--sort-by=createTime'), 'id,status,createTime,finishTime,serviceAccount', 101))
    query = ('timestamp>="' + START + '" AND timestamp<"' + END + '" '
             'AND protoPayload.authenticationInfo.principalEmail="' + DEPLOYER + '" '
             'AND (protoPayload.serviceName="storage.googleapis.com" OR '
             'protoPayload.serviceName="cloudbuild.googleapis.com" OR '
             'protoPayload.serviceName="serviceusage.googleapis.com")')
    complete.append(bounded_list('PREVIEW_BUILD_ATTEMPT_AUDIT_METADATA',
        ('logging', 'read', query, '--order=asc'),
        'timestamp,protoPayload.serviceName,protoPayload.methodName,protoPayload.resourceName,'
        'protoPayload.status.code,protoPayload.authorizationInfo.permission,protoPayload.authorizationInfo.granted', 31))
    emit('PREVIEW_V2_BUILD_SOURCE_RECONCILIATION_READ_COMPLETED', project=PROJECT,
         evidence_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
         bounded_inventories_complete=all(complete), cloud_mutation=False,
         object_data_access=False, secret_payload_access=False, credential_values_printed=False,
         full_effective_iam_verified=False, root_cause_proven=False, retry_authorized=False,
         application_deployment_performed=False, deployment_readiness_verified=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true', required=True)
    parser.parse_args()
    os.umask(0o077)
    inspect()
