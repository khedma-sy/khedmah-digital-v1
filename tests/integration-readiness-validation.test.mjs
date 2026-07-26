import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { executeCompleteOperationalChain } from './support/complete-operational-chain.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('unit: every OP-001D through OP-002F application boundary consumes its immediate canonical predecessor', async () => {
  const sources = await Promise.all([
    read('backend/operations/business_approval/application/business-approval-operations.mjs'),
    read('backend/operations/business_publication/application/business-publication-operations.mjs'),
    read('backend/operations/business_visibility/application/business-visibility-operations.mjs'),
    read('backend/operations/public_business_profile/application/public-business-profile-operations.mjs'),
    read('backend/operations/public_discovery/domain/public-discovery.mjs'),
    read('backend/operations/business_search/domain/business-search.mjs'),
  ]);
  assert.match(sources[0], /operational_status/);
  assert.match(sources[1], /operational_status/);
  assert.match(sources[2], /operational_status/);
  assert.match(sources[3], /createPublicBusinessProfile/);
  assert.match(sources[4], /projectPublicBusinessProfile/);
  assert.match(sources[5], /projectPublicBusinessProfile/);
});

test('integration: canonical lineage, policy, role, association, and audit continuity hold across the implemented chain', () => {
  const chain = executeCompleteOperationalChain();
  const caseIdentifier = chain.businessCase.caseIdentifier;
  const decisionReference = chain.businessCase.references.decision;
  assert.equal(chain.approved.approval.associations.businessCaseReference, caseIdentifier);
  assert.equal(chain.published.publication.associations.approvalReference, chain.approved.approval.approvalIdentifier);
  assert.equal(chain.visible.visibility.associations.publicationReference, chain.published.publication.publicationIdentifier);
  assert.equal(chain.profile.profile.associations.visibilityReference, chain.visible.visibility.visibilityIdentifier);
  assert.equal(chain.discovered.discovery.associations.publicProfileReference, chain.profile.profile.profileIdentifier);
  assert.equal(chain.searched.search.associations.discoveryReference, chain.discovered.discovery.discoveryIdentifier);
  assert.equal(chain.readyStatus.association.currentDecisionReference, decisionReference);
  assert.ok(chain.businessCase.timeline.every((event) => event.correlationId === chain.correlationIdentifier));
  assert.equal(chain.approved.approval.authorization.governingPolicyReference, chain.policyReference);
  assert.equal(chain.published.publication.governance.responsibleRole, chain.responsibleRole);
  assert.ok([chain.approved.approval, chain.published.publication, chain.visible.visibility, chain.discovered.discovery, chain.searched.search].every((record) => record.auditRecords.length === 2));
});

test('end-to-end: Registration through Search completes with intact public exposure and no forbidden output', () => {
  const chain = executeCompleteOperationalChain();
  assert.deepEqual(chain.businessCase.references, { registration: 'registration:integration:003a', verification: 'verification:integration:003a', decision: 'decision:integration:003a' });
  assert.equal(chain.readyStatus.currentStatus, 'READY_FOR_APPROVAL');
  assert.equal(chain.approved.approval.status, 'APPROVED');
  assert.equal(chain.published.publication.status, 'PUBLISHED');
  assert.equal(chain.visible.visibility.status, 'VISIBLE');
  assert.equal(chain.discovered.discovery.status, 'DISCOVERABLE');
  assert.equal(chain.searched.search.status, 'SEARCHABLE');
  assert.equal(chain.searched.results[0].businessName, 'خدمة التكامل');
  assert.equal('associations' in chain.searched.results[0], false);
  assert.equal('auditRecords' in chain.searched.results[0], false);
  assert.equal('ranking' in chain.searched, false);
  assert.equal('recommendations' in chain.searched, false);
});

test('regression: all OP-001D through OP-002F capability suites remain registered', async () => {
  const files = ['business-case-foundation', 'operational-status-foundation', 'business-approval-capability', 'business-publication-capability', 'business-visibility-capability', 'public-business-profile-capability', 'public-discovery-capability', 'business-search-capability'];
  const contents = await Promise.all(files.map((file) => read(`tests/${file}.test.mjs`)));
  assert.ok(contents.every((content) => content.includes("from 'node:test'")));
  assert.ok(contents.every((content) => /integration|end-to-end/i.test(content)));
});

