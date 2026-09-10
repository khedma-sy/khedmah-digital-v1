import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function requireRunUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid URL.`); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.run.app')) {
    throw new Error(`${label} must be an HTTPS Cloud Run service URL.`);
  }
  return parsed;
}

async function probe(url, fetchImpl, timeoutMs) {
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    };
  } catch (cause) {
    return {
      ok: false,
      status: 0,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      error: cause instanceof Error ? cause.name : 'RequestError'
    };
  }
}

export async function observeStagingRuntime({
  backendUrl,
  frontendUrl,
  sampleCount = 6,
  intervalMs = 10_000,
  timeoutMs = 15_000,
  fetchImpl = fetch,
  sleepImpl = delay,
  nowImpl = () => new Date()
}) {
  const backend = requireRunUrl(backendUrl, 'BACKEND_URL');
  const frontend = requireRunUrl(frontendUrl, 'FRONTEND_URL');
  const samples = [];

  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const [backendResult, frontendResult] = await Promise.all([
      probe(new URL('/api/v1/health', backend).toString(), fetchImpl, timeoutMs),
      probe(new URL('/', frontend).toString(), fetchImpl, timeoutMs)
    ]);
    samples.push({
      sample,
      observedAt: nowImpl().toISOString(),
      backend: backendResult,
      frontend: frontendResult
    });
    if (!backendResult.ok || !frontendResult.ok) {
      return { contractVersion: 'staging-runtime-observation-v1', passed: false, requestedSamples: sampleCount, completedSamples: sample, urlsRecorded: false, samples };
    }
    if (sample < sampleCount) await sleepImpl(intervalMs);
  }

  return { contractVersion: 'staging-runtime-observation-v1', passed: true, requestedSamples: sampleCount, completedSamples: sampleCount, urlsRecorded: false, samples };
}

function boundedInteger(value, fallback, minimum, maximum, name) {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return parsed;
}

async function main() {
  if (process.env.DEPLOYMENT_ENVIRONMENT !== 'staging') throw new Error('Runtime observation is Staging-only.');
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const productionProject = process.env.PRODUCTION_GOOGLE_CLOUD_PROJECT?.trim();
  if (!project || !productionProject) throw new Error('Staging and Production project identifiers are required.');
  if (project === productionProject) throw new Error('Refusing to observe a Production target as Staging.');

  const sampleCount = boundedInteger(process.env.STAGING_HEALTH_SAMPLES, 6, 3, 12, 'STAGING_HEALTH_SAMPLES');
  const intervalMs = boundedInteger(process.env.STAGING_HEALTH_INTERVAL_MS, 10_000, 1_000, 60_000, 'STAGING_HEALTH_INTERVAL_MS');
  const timeoutMs = boundedInteger(process.env.STAGING_HEALTH_TIMEOUT_MS, 15_000, 1_000, 60_000, 'STAGING_HEALTH_TIMEOUT_MS');
  const evidenceDirectory = resolve(process.env.EVIDENCE_DIRECTORY || 'staging-runtime-evidence');

  const evidence = await observeStagingRuntime({
    backendUrl: process.env.BACKEND_URL || '',
    frontendUrl: process.env.FRONTEND_URL || '',
    sampleCount,
    intervalMs,
    timeoutMs
  });
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(resolve(evidenceDirectory, 'runtime-observation.json'), `${JSON.stringify({
    ...evidence,
    revision: process.env.GITHUB_SHA || null
  }, null, 2)}\n`, 'utf8');

  if (!evidence.passed) {
    console.error(`Staging runtime observation failed after ${evidence.completedSamples}/${evidence.requestedSamples} samples.`);
    process.exitCode = 2;
    return;
  }
  console.log(`Staging runtime observation passed: ${evidence.completedSamples}/${evidence.requestedSamples} samples; URLs omitted from evidence.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) await main();
