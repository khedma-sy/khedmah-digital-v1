#!/usr/bin/env python3
"""Validate a scaling-only recovery of the existing Preview V2 backend."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = 'khedmah-preview-v2-20261012'
REGION = 'europe-west1'
SERVICE = 'khedmah-pr-274-backend'
REVISION = SERVICE + '-00008-tg8'
DIGEST = 'sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17'
NAME = f'projects/{PROJECT}/locations/{REGION}/services/{SERVICE}'
URL = 'https://run.googleapis.com/v2/' + NAME
VALIDATE_URL = URL + '?updateMask=scaling.manualInstanceCount&validateOnly=true'
REVISION_URL = f'https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}/revisions/{REVISION}'
SCHEMA_SCRIPT_SHA = '4665b14534b96bb4474495e681b0fea318798c18a9e86b7306af5f55456f02b7'


def stop(reason):
    raise SystemExit('STOP: ' + reason)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def cloud_json(token, url, method='GET', body=None):
    request = urllib.request.Request(url, method=method,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            return json.loads(response.read(1048577))
    except urllib.error.HTTPError as error:
        error.close()
        stop('CLOUD_RUN_VALIDATION_REQUEST_FAILED')
    except (OSError, ValueError):
        stop('CLOUD_RUN_VALIDATION_REQUEST_FAILED')


def revision_matches(value):
    return value in (REVISION, NAME + '/revisions/' + REVISION)


def recovery_request(service):
    if (service.get('name') != NAME or service.get('reconciling') is True
            or not re.fullmatch(r'[1-9][0-9]*', str(service.get('generation')))
            or service.get('generation') != service.get('observedGeneration')
            or service.get('terminalCondition', {}).get('state') != 'CONDITION_SUCCEEDED'
            or not revision_matches(service.get('latestReadyRevision'))
            or not revision_matches(service.get('latestCreatedRevision'))):
        stop('SERVICE_NOT_STABLE_EXACT_REVISION')
    if service.get('scaling', {}).get('scalingMode') != 'MANUAL':
        stop('SERVICE_SCALING_MODE_CHANGED')
    count = service['scaling'].get('manualInstanceCount')
    if not ((type(count) is int and count == 0) or count == '0'):
        stop('SERVICE_NOT_MANUAL_ZERO')
    for key in ('traffic', 'trafficStatuses'):
        traffic = service.get(key)
        if (not isinstance(traffic, list) or len(traffic) != 1
                or traffic[0].get('tag') or traffic[0].get('percent') != 100
                or not (revision_matches(traffic[0].get('revision'))
                    or (key == 'traffic' and traffic[0].get('type') == 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST'
                        and not traffic[0].get('revision')))):
            stop('SERVICE_TRAFFIC_CHANGED')
    containers = service.get('template', {}).get('containers', [])
    if len(containers) != 1 or not containers[0].get('image', '').endswith('@' + DIGEST):
        stop('SERVICE_IMAGE_CHANGED')
    etag = service.get('etag')
    if not isinstance(etag, str) or not etag or len(etag) > 256:
        stop('SERVICE_ETAG_UNAVAILABLE')
    return {'name': NAME, 'etag': etag, 'scaling': {'manualInstanceCount': 1}}


def require_revision(service, revision):
    """Confirm the immutable deployed revision independently of the service template."""
    if (not isinstance(revision, dict)
            or revision.get('name') != NAME + '/revisions/' + REVISION
            or revision.get('service') not in (SERVICE, NAME)
            or revision.get('deletionTime') or revision.get('reconciling') is True
            or not isinstance(revision.get('conditions'), list)
            or not any(isinstance(condition, dict) and condition.get('type') == 'Ready'
                       and condition.get('state') == 'CONDITION_SUCCEEDED'
                       for condition in revision['conditions'])
            or not isinstance(revision.get('containers'), list)
            or len(revision['containers']) != 1
            or revision['containers'][0].get('image') != service['template']['containers'][0]['image']
            or not revision['containers'][0]['image'].endswith('@' + DIGEST)):
        stop('REVISION_IDENTITY_OR_IMAGE_NOT_VERIFIED')


def require_validation_operation(result):
    if not isinstance(result, dict) or result.get('error'):
        stop('SCALING_PATCH_VALIDATION_REJECTED')
    name = result.get('name')
    prefix = f'projects/{PROJECT}/locations/{REGION}/operations/'
    if not isinstance(name, str) or not name.startswith(prefix) or not name[len(prefix):]:
        stop('SCALING_PATCH_VALIDATION_OPERATION_INVALID')
    # Cloud Run returns a long-running Operation; absence of "done" means pending,
    # not failure or successful validation.
    if result.get('done') is not True:
        stop('SCALING_PATCH_VALIDATION_PENDING')
    if result.get('response') is not None and not isinstance(result['response'], dict):
        stop('SCALING_PATCH_VALIDATION_RESPONSE_INVALID')


def require_predecessor(receipt):
    catalog = receipt.get('catalog', {})
    detail = catalog.get('quota_diagnostics', {})
    if (receipt.get('stage') != 'PREVIEW_V2_APPROVAL_QUOTA_DIAGNOSTIC_READ_COMPLETED'
            or receipt.get('project') != PROJECT or receipt.get('instance') != 'khedmah-preview-v2-db'
            or catalog.get('database') != 'khedmah' or catalog.get('read_only') != 'on'
            or catalog.get('classification') != 'prerequisite-invalid'
            or catalog.get('required_relation_anchors') is not True
            or catalog.get('role_column_exact') is not True
            or catalog.get('quota_columns_exact') is not True
            or catalog.get('media_columns_exact') is not True
            or catalog.get('role_target') is not True or catalog.get('asset_predecessor') is not True
            or catalog.get('private_constraint_absent') is not True or catalog.get('quota_target') is not False
            or detail.get('body_025_exact') is not True or detail.get('body_036_exact') is not False
            or detail.get('routine_count') != 1 or detail.get('named_trigger_count') != 1
            or detail.get('user_insert_trigger_count') != 1 or detail.get('insert_rule_count') != 0
            or detail.get('routine_failed_checks') != [] or detail.get('trigger_failed_checks') != []):
        stop('DATABASE_PREDECESSOR_NOT_VERIFIED')


def read_predecessor():
    path = Path(__file__).with_name('read-preview-v2-approval-schema.py')
    if hashlib.sha256(path.read_bytes()).hexdigest() != SCHEMA_SCRIPT_SHA:
        stop('SCHEMA_READER_SOURCE_MISMATCH')
    result = subprocess.run([sys.executable, str(path), '--inspect-quota'],
        capture_output=True, timeout=240, check=False)
    if result.returncode or len(result.stdout) > 16384:
        stop('SCHEMA_READER_FAILED')
    require_predecessor(json.loads(result.stdout))


def validate():
    token = subprocess.run(['gcloud', 'auth', 'print-access-token', '--quiet'],
        capture_output=True, text=True, timeout=20, check=True).stdout.strip()
    if not token or any(char.isspace() for char in token):
        stop('TOKEN_UNAVAILABLE')
    service = cloud_json(token, URL)
    before = recovery_request(service)
    require_revision(service, cloud_json(token, REVISION_URL))
    read_predecessor()
    after_service = cloud_json(token, URL)
    if recovery_request(after_service) != before:
        stop('SERVICE_CHANGED_DURING_SCHEMA_READ')
    require_revision(after_service, cloud_json(token, REVISION_URL))
    result = cloud_json(token, VALIDATE_URL, method='PATCH', body=before)
    require_validation_operation(result)
    print(json.dumps({'stage': 'PREVIEW_V2_LOGIN_RECOVERY_PATCH_VALIDATED',
        'project': PROJECT, 'service': SERVICE, 'revision': REVISION,
        'cloud_resource_mutation': False, 'database_mutation': False,
        'recovery_authorized': False, 'database_connection_verified': False}, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] != ['--validate']:
        stop('ONLY_VALIDATE_IS_AVAILABLE')
    try:
        validate()
    except (OSError, ValueError, TypeError, KeyError, AttributeError, subprocess.SubprocessError):
        stop('RECOVERY_VALIDATION_FAILED')
