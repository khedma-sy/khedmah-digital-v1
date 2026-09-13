import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, css, readSource } from './helpers/client-page-harness.mjs';

function fixture() {
  const focuses = [], navigations = [];
  const h = clientPage(readSource('apps/frontend/app/components/smart-assistant.tsx') + '\nexport default SmartAssistant;', {
    'next/navigation': { useRouter: () => ({ push: href => navigations.push(href) }) },
    './smart-assistant.module.css': { default: css }
  });
  const trigger = () => h.find(n => n.props['aria-expanded'] !== undefined);
  trigger().props.ref.current = { focus: () => focuses.push('trigger') };
  const open = () => {
    trigger().props.onClick(); h.render(false);
    h.find(n => n.type === 'input').props.ref.current = { focus: () => focuses.push('input') };
    h.render();
  };
  return { h, focuses, navigations, trigger, open };
}

test('assistant opens an explicitly named region and focuses its input once', () => {
  const f = fixture(); f.open();
  const region = f.h.find(n => n.props.role === 'region');
  assert.equal(region.props.id, f.trigger().props['aria-controls']);
  assert.equal(f.trigger().props['aria-expanded'], true);
  assert.deepEqual(f.focuses, ['input']); f.h.render(); assert.deepEqual(f.focuses, ['input']);
});

test('Escape closes the assistant and returns focus without navigation or recording', () => {
  const f = fixture(); f.open(); let prevented = false;
  f.h.find(n => n.type === 'aside').props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; } }); f.h.render();
  assert.equal(prevented, true); assert.equal(f.trigger().props['aria-expanded'], false);
  assert.equal(f.h.find(n => n.type === 'input'), undefined);
  assert.deepEqual(f.focuses, ['input', 'trigger']); assert.deepEqual(f.navigations, []);
});

test('close button restores the trigger while reopening preserves the draft', () => {
  const f = fixture(); f.open();
  f.h.find(n => n.type === 'input').props.onChange({ target: { value: 'صيانة' } }); f.h.render();
  f.h.find(n => n.props['aria-label'] === 'إغلاق المساعد').props.onClick(); f.h.render();
  assert.equal(f.focuses.at(-1), 'trigger'); f.open();
  assert.equal(f.h.find(n => n.type === 'input').props.value, 'صيانة'); assert.deepEqual(f.navigations, []);
});

test('Escape on the closed trigger and other keys do not hijack page keyboard input', () => {
  const f = fixture();
  const event = key => ({ key, preventDefault() { assert.fail('unrelated keyboard input must remain native'); } });
  f.h.find(n => n.type === 'aside').props.onKeyDown(event('Escape'));
  f.open(); f.h.find(n => n.type === 'aside').props.onKeyDown(event('Tab'));
  assert.equal(f.trigger().props['aria-expanded'], true);
});

test('assistant trigger precedes its region in DOM reading and keyboard order', () => {
  const f = fixture(); f.open();
  const children = f.h.find(n => n.type === 'aside').props.children;
  assert.equal(children[0].type, 'button'); assert.equal(children[1].props.role, 'region');
});

test('assistant trigger is part of the single global header and creates no standalone page row', () => {
  const layout = readSource('apps/frontend/app/layout.tsx');
  assert.equal((layout.match(/<header className="khedma-header">/g) ?? []).length, 1);
  assert.equal((layout.match(/<SmartAssistant \/>/g) ?? []).length, 1);
  assert.match(layout, /<div className="khedma-header-actions">[\s\S]*<SmartAssistant \/>[\s\S]*<\/div>\s*<\/header>\s*\{children\}/);
  const styles = readSource('apps/frontend/app/components/smart-assistant.module.css');
  const root = styles.match(/\.root\{([^}]*)\}/)?.[1] ?? '';
  const panel = styles.match(/\.panel\{([^}]*)\}/)?.[1] ?? '';
  assert.match(root, /position:relative/);
  assert.doesNotMatch(root, /position:(?:fixed|sticky)|margin:/);
  assert.match(panel, /position:absolute/);
  assert.match(styles, /min-width:2\.75rem;min-height:2\.75rem/);
});

import { assessAssistantGeometry } from '../scripts/check-preview-interactions.mjs';
const box = (top, height, left = 12, width = 140) => ({ top, bottom: top + height, left, right: left + width, width, height });
const geometry = { assistant: box(24, 48), header: box(0, 96, 0, 320), main: box(96, 1000, 0, 320), trigger: box(24, 48), position: 'relative', viewportWidth: 320 };
test('mobile interaction assessment accepts a header-contained accessible assistant', () => {
  assert.deepEqual(assessAssistantGeometry(geometry), []);
});
for (const [name, change, code] of [
  ['detached positioning', { position: 'fixed' }, 'ASSISTANT_NOT_HEADER_ANCHORED'],
  ['outside header', { assistant: box(100, 48), trigger: box(100, 48) }, 'ASSISTANT_OUTSIDE_HEADER'],
  ['header overlapping page', { main: box(80, 1000, 0, 320) }, 'HEADER_OVERLAPS_PAGE'],
  ['tiny target', { trigger: box(24, 20) }, 'ASSISTANT_TARGET_CLIPPED'],
  ['clipped target', { trigger: box(24, 48, 300) }, 'ASSISTANT_TARGET_CLIPPED'],
  ['missing geometry', { assistant: null }, 'GEOMETRY_UNAVAILABLE']
]) test(`mobile interaction assessment rejects ${name}`, () => {
  assert.ok(assessAssistantGeometry({ ...geometry, ...change }).includes(code));
});

test('interaction workflow runs despite a failed baseline but cannot hide failures or use production', () => {
  const workflow = readSource('.github/workflows/preview-deployment.yml');
  const job = workflow.split('  review-evidence:')[1].split('  cleanup-preview:')[0];
  assert.match(job, /id: browser-tools/);
  assert.match(job, /if: always\(\) && !cancelled\(\) && steps\.browser-tools\.outcome == 'success'/);
  assert.match(job, /run: node scripts\/check-preview-interactions\.mjs/);
  assert.match(job, /AFTER_URL: \$\{\{ needs\.deploy-preview\.outputs\.frontend_url \}\}/);
  assert.doesNotMatch(job, /continue-on-error|\|\| true|id-token: write/);
  assert.match(job, /interactions-manifest\.json/);
});
