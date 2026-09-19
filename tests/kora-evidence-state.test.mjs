import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, deferred, readSource } from './helpers/client-page-harness.mjs';

function fixture() {
  const requests = [], navigations = [], actionRequests = { draft: [], kill: [], autopsy: [] };
  const evidenceApi = Object.fromEntries(['executive','expose','metrics','anomalies'].map(kind => [kind, () => {
    const request = { ...deferred(), kind }; requests.push(request); return request.promise;
  }]));
  const action = (kind, payload) => {
    const request = { ...deferred(), payload }; actionRequests[kind].push(request); return request.promise;
  };
  const koraAdminApi = {
    ...evidenceApi,
    draftTask: payload => action('draft', payload),
    killCritic: payload => action('kill', payload),
    autopsy: payload => action('autopsy', payload),
  };
  const page = clientPage(readSource('apps/frontend/app/admin/kora/page.tsx'), {
    'next/link': { default: 'Link' },
    'next/navigation': { useRouter: () => ({ replace: url => navigations.push(url) }) },
    '../../../lib/kora-admin-client': { koraAdminApi },
    './kora.module.css': { default: css },
  });
  function succeed(offset = 0, count = 7, findings = []) {
    const data = {
      executive: { riskLevel: 'medium', problemCount: count, needsOwnerDecision: true, recommendations: [] },
      expose: { uiChecks: [], note: 'دليل اختباري' },
      metrics: { metrics: [{ key:'measured', label:'طلبات اختبار', status:'available', value:count, window:'24h' }] },
      anomalies: { findings },
    };
    for(const r of requests.slice(offset, offset+4)) r.resolve(data[r.kind]);
  }
  return { page, requests, actionRequests, navigations, succeed };
}
const summary = page => page.find(n => n.props?.['aria-label'] === 'ملخص KORA التنفيذي');
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node);
const forms = page => page.all().filter(node => node.type === 'form');
const button = (page, label) => page.all().find(node => node.type === 'button' && text(node) === label);
function formFixture(values) {
  const form = { resetCalls: 0, elements: { namedItem: name => ({ value: values[name] }) }, reset() { form.resetCalls++; } };
  return form;
}
const submit = (formNode, currentTarget) => formNode.props.onSubmit({ preventDefault() {}, currentTarget });

test('KORA never reports zero findings or no owner decision when evidence loading fails', async () => {
  const f = fixture();
  assert.ok(text(summary(f.page)).includes('قرار مالك مطلوبغير محدد'));
  assert.ok(text(summary(f.page)).includes('مقاييس موصولة—'));
  assert.equal(f.page.text.includes('لا توجد finding'), false);
  f.requests[0].reject(new Error('Evidence unavailable')); await f.page.flush();
  assert.ok(f.page.text.includes('لم تكتمل قراءة الأدلة'));
  assert.ok(text(summary(f.page)).includes('فجوات القياس—'));
  assert.equal(f.page.text.includes('لا توجد finding'), false);
});

test('KORA drops stale evidence when a refresh fails instead of displaying the old state as current', async () => {
  const f = fixture(); f.succeed(); await f.page.flush();
  assert.ok(text(summary(f.page)).includes('مشكلات مؤكدة7'));
  f.page.click('تحديث الأدلة');
  assert.ok(text(summary(f.page)).includes('مشكلات مؤكدة—'));
  f.requests[4].reject(Object.assign(new Error('Denied'), {statusCode:403})); await f.page.flush();
  assert.ok(f.page.text.includes('لا يملك صلاحية'));
  assert.equal(f.page.text.includes('طلبات اختبار7'), false);
});

test('KORA ignores responses from a superseded refresh and from an unmounted page', async () => {
  const f = fixture(); f.page.replay();
  f.succeed(4, 9); await f.page.flush();
  f.succeed(0, 2); await f.page.flush();
  assert.ok(text(summary(f.page)).includes('مشكلات مؤكدة9'));
  f.page.click('تحديث الأدلة'); f.page.unmount();
  f.succeed(8, 3); await f.page.flush();
  assert.equal(f.page.writesAfterUnmount,0); assert.deepEqual(f.navigations,[]);
});

test('KORA shares one draft flight across finding and form, disables both entries, and ignores completion after unmount', async () => {
  const f = fixture();
  const finding = { id:'finding-1', kind:'incident', resource:'orders', title:'فشل طلب', summary:'تعذر إكمال الطلب بالدليل', severity:'high', evidence:'request-id-1', source:'test', detectedAt:'2026-09-15T12:00:00.000Z' };
  f.succeed(0, 1, [finding]); await f.page.flush();

  const convert = button(f.page, 'حوّل إلى مهمة');
  assert.ok(convert);
  convert.props.onClick(); convert.props.onClick();
  f.page.render();
  assert.equal(f.actionRequests.draft.length, 1);
  const draftForm = forms(f.page)[0];
  await submit(draftForm, formFixture({ kind:'incident', resource:'orders', title:'مسودة يدوية', summary:'ملخص يدوي موثق للمشكلة', severity:'medium', evidence:'manual-evidence' }));
  assert.equal(f.actionRequests.draft.length, 1, 'finding and manual form must share the same flight');
  assert.equal(draftForm.props['aria-busy'], true);
  const loadingButtons = f.page.all().filter(node => node.type === 'button' && text(node) === 'جارٍ إنشاء المسودة…');
  assert.equal(loadingButtons.length, 2); assert.ok(loadingButtons.every(node => node.props.disabled));

  f.page.unmount();
  f.actionRequests.draft[0].resolve({ task: { id:'task-1' } });
  await f.page.flush();
  assert.equal(f.page.writesAfterUnmount, 0);
});

test('KillCritic is single-flight, visibly busy, and does not write after unmount', async () => {
  const f = fixture(), killForm = forms(f.page)[1];
  const target = formFixture({ action:'تغيير إعداد', environment:'preview', impact:'medium' });
  const first = submit(killForm, target), duplicate = submit(killForm, target);
  f.page.render();
  assert.equal(f.actionRequests.kill.length, 1);
  assert.equal(forms(f.page)[1].props['aria-busy'], true);
  const loading = button(f.page, 'جارٍ تشغيل KillCritic…'); assert.ok(loading?.props.disabled);

  f.page.unmount();
  f.actionRequests.kill[0].resolve({ decision:'review', questions:[] });
  await Promise.all([first, duplicate]); await f.page.flush();
  assert.equal(f.page.writesAfterUnmount, 0);
});

test('Autopsy is single-flight, visibly busy, and does not write after unmount', async () => {
  const f = fixture(), autopsyForm = forms(f.page)[2];
  const target = formFixture({ title:'حادثة اختبار', observedAt:'2026-09-15T12:00', summary:'ملخص حادثة موثق بالكامل', evidence:'sha-and-request-id' });
  const first = submit(autopsyForm, target), duplicate = submit(autopsyForm, target);
  f.page.render();
  assert.equal(f.actionRequests.autopsy.length, 1);
  assert.equal(forms(f.page)[2].props['aria-busy'], true);
  const loading = button(f.page, 'جارٍ تشغيل Autopsy…'); assert.ok(loading?.props.disabled);

  f.page.unmount();
  f.actionRequests.autopsy[0].resolve({ rootCause:{ status:'undetermined', reason:'الدليل غير كافٍ' }, nextEvidence:[], preventionDecision:'انتظار الدليل' });
  await Promise.all([first, duplicate]); await f.page.flush();
  assert.equal(f.page.writesAfterUnmount, 0);
});
