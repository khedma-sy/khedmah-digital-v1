#!/usr/bin/env python3
"""Read-only classification of the latest lab secret-binding failure and cleanup."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess

PROJECT = 'khedmah-restore-lab-20261112'
INSTANCE = 'khedmah-restore-pg16-20261114'
REGION = 'europe-west1'
PRINCIPAL = 'khedmah-lab-transition@' + PROJECT + '.iam.gserviceaccount.com'
SECRETS = {
    'SQL': 'khedmah-lab-transition-sql',
    'PASSWORD': 'khedmah-lab-transition-password',
    'ADMIN': 'khedmah-lab-transition-admin',
}
PATTERNS = {
    'EXACT_PRINCIPAL_MISSING': r'service\s*account\s+[\'"\[]?' + re.escape(PRINCIPAL) + r'[\'"\]]?\s+(?:does not exist|not found)',
    'SERVICE_ACCOUNT_MISSING': r'(?:service\s*account|serviceaccount|principal|member)[^\n]{0,250}(?:does not exist|not found|doesn\x27t exist)',
    'PERMISSION_DENIED': r'permission.denied|does not have permission|access denied|\bforbidden\b|\b403\b',
    'ORGANIZATION_POLICY': r'organization(?:al)? policy|orgpolicy|org.policy|allowedpolicymemberdomains|constraints/iam',
    'INVALID_ARGUMENT': r'invalid.argument|unrecognized arguments|too few arguments|required arguments',
    'NOT_FOUND': r'\bnot.found\b|does not exist|doesn\x27t exist',
    'AUTHENTICATION': r'unauthenticated|invalid_grant|reauthentication|credentials? (?:have )?expired',
    'TRANSIENT_OR_QUOTA': r'timed? ?out|deadline.exceeded|connection (?:refused|reset)|resource.exhausted|\b(?:429|500|502|503|504)\b',
    'ETAG_OR_CONDITION': r'\betag\b|condition required|\baborted\b|\b409\b',
}



def pinned_runner_retry_match(fragment):
    """Mirror the pinned runner's exact one-line retry predicate; report only a boolean."""
    email = PRINCIPAL
    principal = re.escape(email)
    named = r'(?:\[' + principal + r'\]|"' + principal + r'"|\x27' + principal + r'\x27|' + principal + r')'
    pattern = (r'\s*ERROR:\s*\(gcloud\.secrets\.add-iam-policy-binding\)\s*'
               r'INVALID_ARGUMENT:\s*Service account\s+' + named +
               r'\s+does not exist\.?\s*')
    return any(re.fullmatch(pattern, line, re.IGNORECASE)
               for line in fragment.splitlines())


def error_flags(fragment):
    return {
        'PINNED_RUNNER_RETRY_PATTERN_MATCH': pinned_runner_retry_match(fragment),
        'GCLOUD_BIND_ERROR_PREFIX_PRESENT': bool(re.search(
            r'ERROR:\s*\(gcloud\.secrets\.add-iam-policy-binding\)', fragment, re.I)),
        **{name: bool(re.search(pattern, fragment, re.I)) for name, pattern in PATTERNS.items()},
    }


def receipt_second(value):
    try:
        return dt.datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
    except ValueError:
        raise argparse.ArgumentTypeError('expected a UTC time such as 2026-11-20T14:38:16Z') from None


def recorded_sql_log(directory, when):
    """Match one historical receipt. Its timestamp describes file mtime, rounded down to seconds."""
    second = int(when.timestamp())
    result = None
    try:
        if not directory.is_dir():
            return {'RECORDED_LOG_STATUS': 'UNAVAILABLE'}
        for path in directory.rglob('*.log'):
            if path.is_symlink() or not path.is_file():
                continue
            if path.stat().st_mtime_ns // 1_000_000_000 != second:
                continue
            with path.open('rb') as stream:
                before = os.fstat(stream.fileno())
                data = stream.read(2_000_001)
                after = os.fstat(stream.fileno())
            if (len(data) > 2_000_000 or before.st_mtime_ns != after.st_mtime_ns
                    or after.st_mtime_ns // 1_000_000_000 != second or len(data) != after.st_size):
                return {'RECORDED_LOG_STATUS': 'UNAVAILABLE'}
            text = data.decode('utf-8', errors='replace')
            if ('gcloud.secrets.add-iam-policy-binding' not in text
                    or not re.search(r'(?<![\w@.-])' + re.escape(PROJECT) + r'(?![\w.-])', text)
                    or not re.search(r'(?<![\w.-])' + re.escape(SECRETS['SQL']) + r'(?![\w.-])', text)):
                continue
            error = re.search(r'\bERROR\b|Traceback \(most recent call last\)', text, re.I)
            if not error:
                continue
            if result is not None:
                return {'RECORDED_LOG_STATUS': 'AMBIGUOUS'}
            # Keep the original line prefix when comparing the anchored runner predicate.
            fragment = text[text.rfind('\n', 0, error.start()) + 1:]
            wording, layouts = set(), set()
            for line in fragment.splitlines():
                for match in re.finditer(PATTERNS['EXACT_PRINCIPAL_MISSING'], line, re.I):
                    wording.add('NOT_FOUND' if match.group().lower().endswith('not found')
                                else 'DOES_NOT_EXIST')
                    header = line[:match.start()].strip().lower()
                    if header == 'error: (gcloud.secrets.add-iam-policy-binding) invalid_argument:':
                        layout = 'CLI_HEADER'
                    elif 'invalid_argument' in header:
                        layout = 'OTHER_HEADER_WITH_STATUS'
                    else:
                        layout = 'MESSAGE_ONLY_OR_OTHER_HEADER'
                    if line[match.end():].strip() not in ('', '.'):
                        layout += '_WITH_SUFFIX'
                    layouts.add(layout)
            result = {'RECORDED_LOG_STATUS': 'MATCH', 'LOG_MODIFIED_UTC': when.strftime('%Y-%m-%dT%H:%M:%SZ'),
                      'EXACT_PRINCIPAL_WORDING': ','.join(sorted(wording)) or 'NONE',
                      'EXACT_PRINCIPAL_LINE_LAYOUTS': ','.join(sorted(layouts)) or 'NONE',
                      **error_flags(fragment)}
    except OSError:
        return {'RECORDED_LOG_STATUS': 'UNAVAILABLE'}
    return result if result is not None else {'RECORDED_LOG_STATUS': 'NO_MATCH'}


def scan_logs(directory, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        paths = [p for p in directory.rglob('*.log') if p.is_file()]
        paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        return {'LOG_STATUS': 'UNAVAILABLE'}
    for path in paths[:4000]:
        try:
            stat = path.stat()
            if stat.st_size > 2_000_000:
                continue
            text = path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        if 'gcloud.secrets.add-iam-policy-binding' not in text:
            continue
        kinds = [kind for kind, value in SECRETS.items() if value in text]
        error = re.search(r'\bERROR\b|Traceback \(most recent call last\)', text, re.I)
        if not kinds or not error:
            continue
        when = dt.datetime.fromtimestamp(stat.st_mtime, dt.timezone.utc)
        out = {'LOG_STATUS': 'RECENT_MATCH', 'LOG_MODIFIED_UTC': when.strftime('%Y-%m-%dT%H:%M:%SZ')}
        if not 0 <= (now - when).total_seconds() <= 7200:
            out['LOG_STATUS'] = 'STALE_OR_CLOCK_UNVERIFIED'
            return out
        out['LOG_SECRET_KIND'] = kinds[0] if len(kinds) == 1 else 'MULTIPLE'
        out['LOG_PROJECT_MARKER_PRESENT'] = PROJECT in text
        fragment = text[error.start():]
        out.update(error_flags(fragment))
        return out
    return {'LOG_STATUS': 'NO_MATCHING_FAILED_LOG'}


def read_cloud(args):
    try:
        result = subprocess.run(['gcloud', '--quiet', '--project=' + PROJECT, *args, '--format=json'],
                                capture_output=True, text=True, timeout=90,
                                env={**os.environ, 'CLOUDSDK_CORE_DISABLE_PROMPTS': '1'})
        if result.returncode or result.stderr.strip():
            return None
        return json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def list_names(items, kind):
    if not isinstance(items, list):
        return None
    names = []
    for item in items:
        if not isinstance(item, dict):
            return None
        if kind == 'job':
            meta = item.get('metadata') or {}
            if not isinstance(meta, dict):
                return None
            name = meta.get('name') or item.get('name')
        else:
            name = item.get('email' if kind == 'account' else 'name')
        if not isinstance(name, str) or not name:
            return None
        names.append(name if kind == 'account' else name.rsplit('/', 1)[-1])
    return names


def inspect_cloud():
    row = read_cloud(['sql', 'instances', 'describe', INSTANCE])
    if isinstance(row, dict) and row.get('project') == PROJECT and row.get('name') == INSTANCE:
        settings = row.get('settings')
        policy = settings.get('activationPolicy') if isinstance(settings, dict) else None
        state = row.get('state')
        policy = policy if policy in ('ALWAYS', 'NEVER') else 'UNKNOWN'
        state = state if state in ('RUNNABLE', 'STOPPED', 'SUSPENDED', 'MAINTENANCE', 'FAILED') else 'UNKNOWN'
    else:
        policy = state = 'UNKNOWN'
    secrets = list_names(read_cloud(['secrets', 'list']), 'secret')
    accounts = list_names(read_cloud(['iam', 'service-accounts', 'list']), 'account')
    jobs = list_names(read_cloud(['run', 'jobs', 'list', '--region=' + REGION]), 'job')
    return {
        'LAB_STATE': state,
        'LAB_ACTIVATION_POLICY': policy,
        'TEMP_SECRETS_PRESENT': 'UNKNOWN' if secrets is None else any(name in secrets for name in SECRETS.values()),
        'TEMP_SERVICE_ACCOUNT_PRESENT': 'UNKNOWN' if accounts is None else PRINCIPAL in accounts,
        'TEMP_TRANSITION_JOB_PRESENT': 'UNKNOWN' if jobs is None else any(name.startswith('khedmah-lab-transition-') for name in jobs),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recorded-sql-log', type=receipt_second, metavar='UTC',
                        help='inspect only the original Cloud Shell log at a recorded UTC second; no cloud calls')
    args = parser.parse_args(argv)
    directory = Path(os.environ.get('CLOUDSDK_CONFIG') or (Path.home() / '.config/gcloud')).expanduser() / 'logs'
    if args.recorded_sql_log:
        result = recorded_sql_log(directory, args.recorded_sql_log)
        result['CLOUD_CALLS'] = False
    else:
        result = {**scan_logs(directory), **inspect_cloud()}
    for name, value in result.items():
        print(name + ':', value)
    print('RAW_LOG_OR_SECRET_PRINTED: False')
    print('READ_ONLY_NO_CLOUD_MUTATIONS: True')
    return 2 if args.recorded_sql_log and result['RECORDED_LOG_STATUS'] != 'MATCH' else 0


if __name__ == '__main__':
    raise SystemExit(main())
