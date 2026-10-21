import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, primitives, readSource } from './helpers/client-page-harness.mjs';

const professional = {
  id: 'professional_profile_publication_test', contentRevision: 'a'.repeat(64),
  headlineAr: 'مهني اختبار', headlineEn: '', bioAr: '', cityCode: 'damascus', countryCode: 'SY',
  skills: ['خبرة'], availability: 'available',
  contactEligibility: { visibility: 'public', moderationStatus: 'approved', lifecycleStatus: 'active', eligible: true }
};
function fixture() {
  const reads = [], writes = [], navigations = [];
  const router = { push: url => navigations.push(url), replace: url => navigations.push(url) };
  const api = {
    professionals: {
      getMine: () => { const request = deferred(); reads.push(request); return request.promise; },
      createOrUpdate: payload => { const request = { ...deferred(), payload }; writes.push(request); return request.promise; },
      getVerificationStatus: async () => ({ status: null })
    },
    media: { listForOwner: async () => [] }
  };
  const page = clientPage(readSource('apps/frontend/app/professional-profiles/new/page.tsx'), {
    'next/navigation': { useRouter: () => router },
    '../../../lib/api-client': { api },
    '../../../lib/use-syrian-cities': { useSyrianCities: () => ({ cities: [{ code: 'damascus', nameAr: 'دمشق' }], isLoading: false, error: '', retry: () => {} }) },
    '../../components/ui-primitives': primitives,
    '../../../components/owner-workspace.module.css': { default: css }
  });
  return { page, reads, writes, navigations };
}

test('new professional defaults to private and sends an explicit owner choice without claiming publication', async () => {
  for (const choice of ['private', 'public']) {
    const f = fixture();
    f.reads[0].reject(Object.assign(new Error('No profile'), { statusCode: 404 }));
    await f.page.flush();
    assert.equal(f.page.find(node => node.props?.name === 'visibility').props.value, 'private');
    const headline = f.page.find(node => node.props?.name === 'headlineAr');
    assert.equal(headline.props.minLength, 2);
    assert.equal(headline.props.maxLength, 200);
    assert.equal(f.page.find(node => node.props?.name === 'headlineEn').props.maxLength, 200);
    assert.ok(f.page.text.includes('اختيار العام لا ينشر الملف تلقائيًا'));
    f.page.edit('headlineAr', 'مهني نشر جديد');
    f.page.edit('cityCode', 'damascus');
    if (choice === 'public') f.page.edit('visibility', 'public');
    const saving = f.page.submit({});
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].payload.visibility, choice);
    assert.equal(f.writes[0].payload.expectedContentRevision, undefined);
    f.writes[0].resolve({ professional });
    await saving; await f.page.flush();
    assert.deepEqual(f.navigations, ['/professional-profiles']);
  }
});

test('editing preserves the loaded public or private choice and submits the matching owner revision', async () => {
  for (const visibility of ['public', 'private']) {
    const f = fixture();
    f.reads[0].resolve({ professional: { ...professional, contactEligibility: { ...professional.contactEligibility, visibility } } });
    await f.page.flush();
    assert.equal(f.page.find(node => node.props?.name === 'visibility').props.value, visibility);
    const saving = f.page.submit({});
    assert.equal(f.writes[0].payload.visibility, visibility);
    assert.equal(f.writes[0].payload.expectedContentRevision, professional.contentRevision);
    f.writes[0].resolve({ professional }); await saving;
  }
});

test('internal classification is displayed as reserved and omitted from owner writes', async () => {
  const f = fixture();
  f.reads[0].resolve({ professional: { ...professional, contactEligibility: { ...professional.contactEligibility, visibility: 'internal' } } });
  await f.page.flush();
  const choice = f.page.find(node => node.props?.name === 'visibility');
  assert.equal(choice.props.value, 'internal');
  assert.equal(choice.props.disabled, true);
  const saving = f.page.submit({});
  assert.equal(f.writes[0].payload.visibility, undefined);
  assert.equal(f.writes[0].payload.expectedContentRevision, professional.contentRevision);
  f.writes[0].resolve({ professional }); await saving;
});

test('a missing owner publication snapshot prevents an accidental private overwrite', async () => {
  for (const contactEligibility of [undefined, {}, { ...professional.contactEligibility, visibility: 'unknown' }]) {
    const f = fixture();
    f.reads[0].resolve({ professional: { ...professional, contactEligibility } });
    await f.page.flush();
    assert.ok(f.page.text.includes('تعذر تأكيد نسخة الملف وحالة ظهوره'));
    assert.equal(f.page.find(node => node.type === 'ActionButton' && node.props.type === 'submit').props.disabled, true);
    await f.page.submit({});
    assert.equal(f.writes.length, 0);
    assert.deepEqual(f.navigations, []);
  }
});

test('a visibility conflict keeps the owner draft and requires an explicit reload before another write', async () => {
  const f = fixture();
  f.reads[0].resolve({ professional }); await f.page.flush();
  f.page.edit('visibility', 'private');
  const saving = f.page.submit({});
  f.writes[0].reject(Object.assign(new Error('Changed profile'), { statusCode: 409 }));
  await saving; await f.page.flush();
  assert.equal(f.page.find(node => node.props?.name === 'visibility').props.value, 'private');
  assert.ok(f.page.text.includes('مسودتك ما زالت ظاهرة'));
  await f.page.submit({});
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.navigations, []);
  f.page.click('إعادة تحميل الملف');
  f.reads[1].resolve({ professional: { ...professional, contentRevision: 'b'.repeat(64), contactEligibility: { ...professional.contactEligibility, visibility: 'private' } } });
  await f.page.flush();
  const retry = f.page.submit({});
  assert.equal(f.writes[1].payload.expectedContentRevision, 'b'.repeat(64));
  assert.equal(f.writes[1].payload.visibility, 'private');
  f.writes[1].resolve({ professional }); await retry;
});
