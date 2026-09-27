import { readFile } from 'node:fs/promises';

const TERMINAL_EXECUTIONS = new Set([
  'EXECUTION_SUCCEEDED',
  'EXECUTION_FAILED',
  'EXECUTION_CANCELLED'
]);

function jobName(job) {
  const raw = job?.name ?? job?.metadata?.name ?? '';
  return String(raw).split('/').at(-1);
}

function jobImages(job) {
  const containers = [
    ...(job?.template?.template?.containers ?? []),
    ...(job?.spec?.template?.spec?.containers ?? []),
    ...(job?.spec?.template?.spec?.template?.spec?.containers ?? [])
  ];
  return [...new Set(containers.map(container => container?.image).filter(value => typeof value === 'string'))];
}

function executionInfo(job) {
  const executionCount = job?.executionCount ?? job?.status?.executionCount;
  const latest = job?.latestCreatedExecution ?? job?.status?.latestCreatedExecution;
  return {
    executionCount,
    completionStatus: latest?.completionStatus ?? latest?.status?.completionStatus ?? null
  };
}

function isPreviewJobForPullRequest(job, project, region) {
  const name = jobName(job);
  if (!/^khedmah-(?:preview|pr)-[a-z0-9-]+$/.test(name)) return null;

  const artifactPrefix = `${region}-docker.pkg.dev/${project}/khedmah-preview/`;
  const tags = jobImages(job)
    .filter(image => image.startsWith(artifactPrefix))
    .map(image => image.match(/:preview-pr-(\d+)-[a-f0-9]{7,40}$/i))
    .filter(Boolean);
  const prNumbers = [...new Set(tags.map(match => Number(match[1])))];
  if (prNumbers.length !== 1 || !Number.isSafeInteger(prNumbers[0])) return null;
  return prNumbers[0];
}

export function selectClosedPreviewJobCandidates(jobs, closedPullRequestNumbers, { project, region }) {
  if (!Array.isArray(jobs)) throw new TypeError('Cloud Run job inventory must be an array.');
  const closed = closedPullRequestNumbers instanceof Set
    ? closedPullRequestNumbers
    : new Set(closedPullRequestNumbers);
  const candidates = [];

  for (const job of jobs) {
    const name = jobName(job);
    const pullRequest = isPreviewJobForPullRequest(job, project, region);
    if (!pullRequest || !closed.has(pullRequest)) continue;

    const { executionCount, completionStatus } = executionInfo(job);
    const neverExecuted = executionCount === 0 && completionStatus === null;
    const finishedOnce = executionCount === 1 && TERMINAL_EXECUTIONS.has(completionStatus);
    if (!neverExecuted && !finishedOnce) continue;

    candidates.push({ name, pullRequest });
  }
  return candidates.sort((left, right) => left.name.localeCompare(right.name));
}

async function readPullRequestState(repository, number, token) {
  const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${number}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) throw new Error(`Cannot verify GitHub PR #${number}: HTTP ${response.status}`);
  const pullRequest = await response.json();
  if (pullRequest.number !== number || !['open', 'closed'].includes(pullRequest.state)) {
    throw new Error(`GitHub returned an invalid state for PR #${number}`);
  }
  return pullRequest.state;
}

async function main() {
  const inventoryPath = process.argv[2];
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.GOOGLE_CLOUD_REGION;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!inventoryPath || !project || !region || !repository || !token) {
    throw new Error('Preview cleanup requires inventory, project, region, repository, and GitHub token.');
  }
  if (!/^[a-z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(region) || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error('Preview cleanup scope is malformed.');
  }

  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  if (!Array.isArray(inventory)) throw new Error('Cloud Run job inventory must be a JSON array.');
  const potential = inventory
    .map(job => ({ job, pullRequest: isPreviewJobForPullRequest(job, project, region) }))
    .filter(item => item.pullRequest !== null);
  const pullRequests = [...new Set(potential.map(item => item.pullRequest))];
  const states = new Map();
  let next = 0;
  const workers = Array.from({ length: Math.min(6, pullRequests.length) }, async () => {
    while (next < pullRequests.length) {
      const number = pullRequests[next++];
      states.set(number, await readPullRequestState(repository, number, token));
    }
  });
  await Promise.all(workers);

  const closed = new Set([...states].filter(([, state]) => state === 'closed').map(([number]) => number));
  const candidates = selectClosedPreviewJobCandidates(inventory, closed, { project, region });
  console.error(`PREVIEW_JOB_CLEANUP_CANDIDATES=${candidates.length} CLOSED_PREVIEW_PRS=${closed.size} VERIFIED_PRS=${states.size}`);
  for (const candidate of candidates) {
    process.stdout.write(`${candidate.name}\t${candidate.pullRequest}\n`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(`PREVIEW_JOB_CLEANUP_PLAN_FAILED_CLOSED: ${error.message}`);
    process.exitCode = 1;
  });
}
