import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const client = readFileSync(new URL('../lib/verification-review-client.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/admin/verification/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('verification admin client binds decisions to the exact request and displayed profile revision', () => {
  assert.match(client, /\/admin\/moderation\/verification\/pending/);
  assert.match(client, /encodeURIComponent\(requestId\)/);
  assert.match(client, /decision === 'approved' \? 'approve' : 'reject'/);
  assert.match(client, /JSON\.stringify\(\{ expectedRevision, notes \}\)/);
  assert.match(client, /credentials: 'include'/);
});

test('verification review UI requires human notes for both decisions and reloads stale conflicts without replay', () => {
  assert.match(page, /const noteMinimum = 10/);
  assert.match(page, /notes\.trim\(\)\.length < noteMinimum/);
  assert.match(page, /verificationReviewApi\.decide\(dialog\.item\.requestId, dialog\.decision, dialog\.item\.profileRevision, notes\.trim\(\)\)/);
  assert.match(page, /statusCodeFor\(cause\) === 409/);
  assert.match(page, /await loadQueue\(\)/);
  assert.doesNotMatch(page, /approveModeration|rejectModeration/);
  assert.doesNotMatch(page, /automatedDecision|auto-approve|auto approve/i);
});

test('verification approval UI fails closed on missing, malformed, or excessive evidence', () => {
  assert.match(client, /readonly evidence: readonly VerificationEvidenceItem\[\]/);
  assert.match(client, /readonly profileSummary: VerificationProfileSummary/);
  assert.match(page, /value\.secureUrl === `\/api\/v1\/media\/public\/\$\{encodeURIComponent\(value\.id\)\}`/);
  assert.match(page, /evidence\.length >= 1 && evidence\.length <= 3/);
  assert.match(page, /decision === 'approved' && !reviewDataReady\(item\)/);
  assert.match(page, /dialog\.decision === 'approved' && !reviewDataReady\(dialog\.item\)/);
  assert.match(page, /النظام لا يثبت أصالة الوثيقة آليًا/);
});

test('verification UI explains publication boundaries and is reachable from the admin console', () => {
  assert.match(page, /اعتماد تحقق النشاط التجاري يمكن أن يعتمد حالة الثقة فقط، ولا يعتمد محتوى النشاط/);
  assert.match(page, /اعتماد تحقق المهني يسجل نتيجة التحقق فقط/);
  assert.match(admin, /href="\/admin\/verification"/);
});
