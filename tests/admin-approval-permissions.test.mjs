import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { clientPage, readSource } from './helpers/client-page-harness.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const files = Object.fromEntries(await Promise.all(Object.entries({
  roles: 'apps/backend/src/operations-product/operations-product.types.ts',
  rbac: 'apps/backend/src/operations-product/operations-rbac.service.ts',
  operations: 'apps/backend/src/operations-product/operations-product.service.ts',
  koraService: 'apps/backend/src/kora-admin/kora-admin.service.ts',
  ads: 'apps/backend/src/classifieds/ad.service.ts',
  adRepository: 'apps/backend/src/classifieds/ad.repository.ts',
  products: 'apps/backend/src/products/product.service.ts',
  productRepository: 'apps/backend/src/products/product.repository.ts',
  profiles: 'apps/backend/src/moderation/profile-review-write.ts',
  verification: 'apps/backend/src/moderation/verification-review.service.ts',
  documents: 'apps/backend/src/media/driver-document-review.service.ts',
  taxi: 'apps/backend/src/taxi/taxi-operational-approval.service.ts',
  admin: 'apps/frontend/app/admin/page.tsx',
  moderation: 'apps/frontend/app/admin/moderation/page.tsx',
  verificationUi: 'apps/frontend/app/admin/verification/page.tsx',
  documentsUi: 'apps/frontend/app/admin/driver-documents/page.tsx',
  documentsPanel: 'apps/frontend/app/components/driver-documents-panel.tsx',
  taxiUi: 'apps/frontend/app/admin/taxi-drivers/page.tsx',
  contract: 'docs/operations/ADMIN-APPROVAL-PERMISSIONS.md',
  kora: 'docs/operations/KORA-ADMIN-OPERATING-CONTRACT.md'
}).map(async ([key, path]) => [key, await read(path)])));

test('the dedicated role is approval-only and receives no broad security or platform mutation authority', () => {
  assert.match(files.roles, /'smart_admin_approver'/);
  const mapping = files.roles.match(/smart_admin_approver:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  for (const permission of [
    'content.approvals.approve',
    'trust.approvals.approve',
    'mobility.approvals.approve'
  ]) assert.ok(mapping.includes(`'${permission}'`), `missing ${permission}`);
  assert.doesNotMatch(mapping, /operations\.read|security\.manage|infrastructure\.manage|deployments\.manage|releases\.manage|incidents\.manage|rbac\.manage|billing|finance|iam|secret/i);
  assert.match(files.rbac, /assertAny\(/);
  assert.match(files.rbac, /permissions\.length === 0/);
  const overview = files.operations.slice(
    files.operations.indexOf('private async overviewActor('),
    files.operations.indexOf('async inventory(')
  );
  for (const permission of [
    'content.approvals.approve',
    'trust.approvals.approve',
    'mobility.approvals.approve'
  ]) assert.ok(overview.includes(`'${permission}'`), `overview missing ${permission}`);
  assert.match(overview, /this\.rbac\.assertAny/);
  assert.match(overview, /if \(!permissions\.includes\('operations\.read'\)\)/);
  assert.match(overview, /services:\s*\[\]/);
  assert.match(overview, /openIncidents:\s*0/);
  assert.match(overview, /pendingChanges:\s*0/);
  const restricted = files.operations.slice(files.operations.indexOf('async inventory('));
  assert.match(restricted, /async inventory[\s\S]*this\.actor\(cookie, 'operations\.read'\)/);
  assert.match(restricted, /async histories[\s\S]*this\.actor\(cookie, 'operations\.read'\)/);
  assert.match(restricted, /recordSupervisedAdminAudit[\s\S]*this\.actor\(cookie, 'operations\.read'\)/);
  assert.match(files.operations, /assertOperationsRead[\s\S]*this\.actor\(cookie, 'operations\.read'\)/);
  assert.match(files.koraService, /private async authorize[\s\S]*this\.operations\.assertOperationsRead\(cookie\)/);
  assert.doesNotMatch(files.koraService, /private async authorize[\s\S]*this\.operations\.overview\(cookie\)/);
});

test('content queues accept the bounded permission while rejection remains security-only', () => {
  assert.match(files.ads, /assertAny\(actor\.email, \['security\.manage', 'content\.approvals\.approve'\]\)/);
  assert.match(files.ads, /decision === 'rejected'[\s\S]*assert\(actor\.email, 'security\.manage'\)/);
  assert.match(files.products, /assertAny\(actor\.email, \['security\.manage', 'content\.approvals\.approve'\]\)/);
  assert.match(files.products, /decision === 'rejected'[\s\S]*assert\(actor\.email, 'security\.manage'\)/);
  assert.match(files.adRepository, /ownerUserId === reviewerUserId/);
  assert.match(files.products, /product\.ownerUserId === actor\.id/);
  assert.match(files.products, /repository\.review\(updated, product\.revision, actor\.id\)/);
  assert.match(files.productRepository, /INSERT INTO trust_history/);
  assert.match(files.productRepository, /'product'/);
  assert.match(files.productRepository, /reviewerUserId/);
  assert.match(files.profiles, /current\.owner_id === actorId/);
});

test('trust and mobility permissions accept only and enforce non-self review', () => {
  assert.match(files.verification, /\['security\.manage', 'trust\.approvals\.approve'\]/);
  assert.match(files.verification, /current\.owner_user_id === actor\.id/);
  assert.match(files.verification, /else \{\s*this\.rbac\.assert\(actor\.email, 'security\.manage'\)/);
  assert.match(files.documents, /\['security\.manage', 'mobility\.approvals\.approve'\]/);
  assert.match(files.documents, /owner_user_id === actor\.id/);
  assert.match(files.documents, /status === 'approved'[\s\S]*assertAny/);
  assert.match(files.documents, /else \{\s*this\.rbac\.assert\(actor\.email, 'security\.manage'\)/);
  assert.match(files.taxi, /\['security\.manage', 'mobility\.approvals\.approve'\]/);
  assert.match(files.taxi, /owner_user_id === actor\.id/);
  const restrict = files.taxi.slice(files.taxi.indexOf('async restrict('));
  assert.match(restrict, /this\.rbac\.assert\(actor\.email, 'security\.manage'\)/);
});

test('the limited UI exposes acceptance queues without destructive controls or reports', () => {
  for (const permission of [
    'content.approvals.approve',
    'trust.approvals.approve',
    'mobility.approvals.approve'
  ]) assert.ok(files.admin.includes(permission));
  assert.match(files.moderation, /hasSecurityAuthority/);
  assert.match(files.moderation, /securityAuthority\s*\?\s*api\.moderation\.listReports\(\)/);
  assert.match(files.moderation, /requiresSecurityAuthority/);
  assert.match(files.admin, /hasBroadAdminSurface/);
  assert.match(files.admin, /overview\.permissions\.includes\('operations\.read'\)/);
  assert.match(files.verificationUi, /decision === 'rejected' && !hasSecurityAuthority/);
  assert.match(files.verificationUi, /hasSecurityAuthority && <button[^>]*className="moderation-reject"/);
  assert.match(files.documentsUi, /approvalOnly=\{!hasSecurityAuthority\}/);
  assert.match(files.documentsPanel, /approvalOnly&&decision\.status==='rejected'/);
  assert.match(files.taxiUi, /action !== 'approve' && !hasSecurityAuthority/);
  assert.match(files.taxiUi, /hasSecurityAuthority && candidate\.operationalStatus === 'approved'/);
});

test('limited mobility approval fails closed for rejected documents and restricted Taxi states', () => {
  // The generic driver-document reviewer must hide the acceptance path for a
  // rejected latest document and repeat the same rule in the submit handler.
  assert.match(files.documentsPanel, /approvalOnly&&doc\.reviewStatus==='rejected'\?/);
  assert.match(files.documentsPanel, /approvalOnly&&decision\.status==='approved'&&documents\.find\(document=>document\.id===decision\.id\)\?\.reviewStatus!=='pending'/);
  assert.match(files.documentsPanel, /يجب رفع نسخة جديدة/);

  // Taxi document decisions repeat the guard at both dialog-open and write
  // time. A security reviewer keeps the explicit override path.
  assert.match(files.taxiUi, /decision === 'approved' && document\.reviewStatus === 'rejected' && !hasSecurityAuthority/);
  assert.match(files.taxiUi, /documentDialog\.decision === 'approved' && documentDialog\.document\.reviewStatus === 'rejected' && !hasSecurityAuthority/);
  assert.match(files.taxiUi, /hasSecurityAuthority \|\| document\.reviewStatus !== 'rejected'/);
  assert.match(files.taxiUi, /ارفع نسخة جديدة بعد الرفض، أو اطلب مراجعة مسؤول الأمن/);

  // A bounded reviewer may approve a new/approved candidate, but cannot
  // resurrect suspended or revoked operational authority. Security can.
  assert.match(files.taxiUi, /const requiresSecurityForOperationalApproval = \(candidate: TaxiOperationalCandidate\) =>[\s\S]*candidate\.operationalStatus === 'suspended' \|\| candidate\.operationalStatus === 'revoked'/);
  assert.match(files.taxiUi, /action === 'approve' && requiresSecurityForOperationalApproval\(candidate\) && !hasSecurityAuthority/);
  assert.match(files.taxiUi, /operationalDialog\.action === 'approve' && requiresSecurityForOperationalApproval\(operationalDialog\.candidate\) && !hasSecurityAuthority/);
  assert.match(files.taxiUi, /const baseApprovalReady = candidate\.profileReady && candidate\.documentsApproved/);
  assert.match(files.taxiUi, /const canApprove = baseApprovalReady && \(hasSecurityAuthority \|\| !securityOnlyReapproval\)/);
  assert.match(files.taxiUi, /إعادة اعتماد ملف تكسي معلّق أو ملغى تتطلب مراجعة مسؤول الأمن/);
});

for (const permissionDiscovery of ['bounded', 'unavailable']) {
  test(`content moderation remains usable without reports when permission discovery is ${permissionDiscovery}`, async () => {
    let reportReads = 0;
    const api = {
      operationsProduct: { overview: async () => {
        if (permissionDiscovery === 'unavailable') throw new Error('permission discovery offline');
        return { operationsProduct: { permissions: ['content.approvals.approve'] } };
      } },
      moderation: {
        listPending: async () => ({ businesses: [], professionals: [] }),
        listReports: async () => { reportReads += 1; throw new Error('reports must not be requested'); }
      },
      adminProducts: {
        pending: async () => ({ products: [{ id: 'product-1', revision: 'revision-1', titleAr: 'منتج للمراجعة', price: 10, currency: 'SYP', categoryCode: 'general', availability: 'in_stock', requiresPrescription: false, controlledItem: false }] }),
        review: async () => ({})
      },
      businesses: { approveModeration: async () => ({}), rejectModeration: async () => ({}) },
      professionals: { approveModeration: async () => ({}), rejectModeration: async () => ({}) }
    };
    const page = clientPage(readSource('apps/frontend/app/admin/moderation/page.tsx'), {
      '../../../lib/api-client': { api },
      '../../../lib/classifieds-client': { adminClassifiedsApi: { pending: async () => ({ ads: [] }) }, CLASSIFIEDS_SMART_ADMIN_VERSION: 'classifieds-smart-admin-v1' },
      '../../../lib/classifieds': { CLASSIFIEDS_ENABLED: false, AD_KIND_LABELS: {}, formatAdPrice: () => '' }
    }, {
      window: { requestAnimationFrame: (callback) => callback() },
      document: { activeElement: null, addEventListener() {}, removeEventListener() {} },
      HTMLElement: class {}
    });
    await page.flush();
    assert.match(page.text, /منتج للمراجعة/);
    assert.ok(page.find((node) => node.type === 'button' && node.props.children === 'نشر'));
    assert.equal(page.find((node) => node.type === 'button' && String(node.props.children).includes('رفض')), undefined);
    assert.doesNotMatch(page.text, /بلاغات المستخدمين/);
    assert.equal(reportReads, 0);
  });
}

test('the operating contract is human-only and KORA remains non-executing', () => {
  for (const phrase of [
    'human reviewer',
    'Approval of a record owned by the reviewer is forbidden',
    'approval-only authority',
    'does not create an autonomous AI actor',
    'separately authorized deployment'
  ]) assert.ok(files.contract.includes(phrase), `missing ${phrase}`);
  assert.match(files.kora, /KORA cannot approve\/reject a profile/);
  assert.doesNotMatch(`${files.roles}\n${files.rbac}`, /SMART_ADMIN_APPROVALS_ENABLED|khedmah\.smart-admin/);
});
