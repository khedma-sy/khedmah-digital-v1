import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { executeCompleteOperationalChain } from './support/complete-operational-chain.mjs';

const reportUrl = new URL('../docs/operations/ACP-001-ALPHA-CERTIFICATION-ASSESSMENT.md', import.meta.url);

test('certification evidence: approved business lifecycle remains unchanged', () => {
  const chain = executeCompleteOperationalChain();
  assert.deepEqual(
    [chain.readyStatus.currentStatus, chain.approved.approval.status, chain.published.publication.status, chain.visible.visibility.status, chain.discovered.discovery.status, chain.searched.search.status],
    ['READY_FOR_APPROVAL', 'APPROVED', 'PUBLISHED', 'VISIBLE', 'DISCOVERABLE', 'SEARCHABLE'],
  );
  assert.equal(chain.searched.results[0].businessName, 'خدمة التكامل');
  assert.equal('auditRecords' in chain.searched.results[0], false);
});

test('certification evidence: every required domain and operational item is classified', async () => {
  const report = await readFile(reportUrl, 'utf8');
  const sections = ['Certification Matrix', 'Business Integrity Report', 'Governance Integrity Report', 'Runtime Integrity Report', 'Monitoring Integrity Report', 'Recovery Integrity Report', 'Deployment Integrity Report', 'Operational Evidence Report', 'Repository Health Report', 'Remaining Risks', 'Remaining Blockers', 'Certification Recommendation', 'Executive Recommendation'];
  for (const section of sections) assert.match(report, new RegExp(`## ${section}`));
  const evidenceItems = ['Isolated Alpha Environment', 'Successful application startup', 'Successful workspace builds', 'Durable persistence', 'Secret and key management', 'Monitoring service', 'Recovery testing', 'Capacity evidence', 'Release evidence'];
  for (const item of evidenceItems) assert.match(report, new RegExp(`\\| ${item} \\| (?:VERIFIED|PARTIALLY VERIFIED|NOT VERIFIED) \\|`));
  for (const proofClass of ['Proven by execution', 'Proven by tests', 'Proven by documentation', 'Not proven']) assert.match(report, new RegExp(proofClass));
});

test('certification evidence: report issues exactly one authorized final outcome', async () => {
  const report = await readFile(reportUrl, 'utf8');
  const outcomes = report.match(/^(?:CERTIFIED FOR ALPHA|CONDITIONALLY CERTIFIED|NOT CERTIFIED)$/gm) ?? [];
  assert.deepEqual(outcomes, ['NOT CERTIFIED']);
  assert.equal(report.trim().endsWith('NOT CERTIFIED'), true);
});

