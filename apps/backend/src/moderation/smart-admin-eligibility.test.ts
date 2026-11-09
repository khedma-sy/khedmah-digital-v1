import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessSmartAdminEligibility, type SmartAdminEligibilityInput } from './smart-admin-eligibility';

const valid: SmartAdminEligibilityInput = {
  domain: 'professional_content', submitted: true, snapshotComplete: true,
  revisionMatches: true, ownerIsReviewer: false, flagged: false,
  policyVersion: 'reviewed-v1', categoryAllowed: true, checksPassed: true
};

test('ordinary professional content can qualify only with all review prerequisites', () => {
  assert.deepEqual(assessSmartAdminEligibility(valid), { eligible: true, policyVersion: 'reviewed-v1' });
});
test('sensitive approvals never inherit routine content automation authority', () => {
  for (const domain of ['identity_verification', 'driver_document', 'vehicle_document', 'taxi_activation'] as const) {
    assert.deepEqual(assessSmartAdminEligibility({ ...valid, domain }), {
      eligible: false, reason: 'sensitive_domain_requires_independent_verified_workflow'
    });
  }
});
test('incomplete, stale, risky, self-reviewed, or unapproved content fails closed', () => {
  for (const patch of [
    { submitted: false }, { snapshotComplete: false }, { revisionMatches: false },
    { ownerIsReviewer: true }, { flagged: true }, { policyVersion: '' },
    { categoryAllowed: false }, { checksPassed: false }
  ]) {
    assert.equal(assessSmartAdminEligibility({ ...valid, ...patch }).eligible, false);
  }
});

test('unknown runtime approval domain cannot inherit routine content eligibility', () => {
  // Simulates malformed or future API input bypassing static TypeScript typing.
  const forged = { ...valid, domain: 'unrecognized_content' } as unknown as SmartAdminEligibilityInput;
  assert.deepEqual(assessSmartAdminEligibility(forged), {
    eligible: false, reason: 'unknown_domain'
  });
});

test('all four known routine content domains still qualify with complete evidence', () => {
  for (const domain of ['professional_content', 'business_content', 'classified_content', 'product_content'] as const) {
    assert.deepEqual(assessSmartAdminEligibility({ ...valid, domain }), {
      eligible: true, policyVersion: 'reviewed-v1'
    });
  }
});

test('malformed runtime input is denied without throwing', () => {
  for (const malformed of [null, undefined, false, 1, '', [], 'professional_content']) {
    assert.deepEqual(
      assessSmartAdminEligibility(malformed as unknown as SmartAdminEligibilityInput),
      { eligible: false, reason: 'invalid_input' },
    );
  }
});

test('truthy strings, absent booleans and nonstring policy versions cannot grant eligibility', () => {
  for (const key of ['submitted', 'snapshotComplete', 'revisionMatches', 'categoryAllowed', 'checksPassed'] as const) {
    for (const malformed of ['true', 1, undefined]) {
      const input = { ...valid, [key]: malformed } as unknown as SmartAdminEligibilityInput;
      assert.equal(assessSmartAdminEligibility(input).eligible, false, key + ':' + String(malformed));
    }
  }
  for (const key of ['ownerIsReviewer', 'flagged'] as const) {
    for (const malformed of [undefined, null, 0, '']) {
      const input = { ...valid, [key]: malformed } as unknown as SmartAdminEligibilityInput;
      assert.equal(assessSmartAdminEligibility(input).eligible, false, key + ':' + String(malformed));
    }
  }
  for (const malformed of [123, true, [], {}, '   ']) {
    const input = { ...valid, policyVersion: malformed } as unknown as SmartAdminEligibilityInput;
    assert.deepEqual(assessSmartAdminEligibility(input), {
      eligible: false, reason: 'missing_policy_version'
    });
  }
});
