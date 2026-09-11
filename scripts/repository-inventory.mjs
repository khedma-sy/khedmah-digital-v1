import { execFileSync } from 'node:child_process';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (cwd, args, options = {}) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });

export function reviewablePath(path) {
  if (path.split('/').some((part) => part.startsWith('.') && part !== '.github')) return false;
  if (/(?:^|\/)(?:node_modules|dist|build|coverage|secrets|credentials)(?:\/|$)/i.test(path)) return false;
  if (/\.(?:pem|key|p12|pfx|keystore|jks|zip|png|jpe?g|webp|woff2?|ttf|env)$/i.test(path)) return false;
  if (/^(?:package(?:-lock)?\.json|README\.md|AGENTS\.md|ROADMAP-EXECUTION-2026-09-08\.md|Dockerfile\.(?:frontend|backend|migrations))$/.test(path)) return true;
  if (/^apps\/(?:frontend|backend)\/(?:package(?:-lock)?\.json|tsconfig\.json|next\.config\.(?:js|mjs|ts))$/.test(path)) return true;
  return /^(?:apps\/frontend\/(?:app|components|lib|tests)\/|apps\/backend\/(?:src|tests)\/|backend\/|tests\/|scripts\/|docs\/|\.github\/workflows\/)/.test(path)
    && /\.(?:tsx?|mjs|cjs|css|md|sql|sh|ya?ml)$/.test(path);
}

export function parseTree(raw) {
  return raw.split('\0').filter(Boolean).map((record) => {
    const split = record.indexOf('\t');
    const [mode, type, blob] = record.slice(0, split).split(' ');
    const path = record.slice(split + 1);
    return { path, mode, type, blob };
  });
}

function sourceAt(cwd, ref, path) {
  return git(cwd, ['show', `${ref}:${path}`]);
}

export function inventory(cwd, ref = 'HEAD') {
  const commit = git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const tree = git(cwd, ['rev-parse', `${commit}^{tree}`]).trim();
  const entries = parseTree(git(cwd, ['ls-tree', '-rz', '--full-tree', commit]));
  const files = entries.filter((entry) => entry.type === 'blob');
  const routes = files.filter(({ path }) => /^apps\/frontend\/app\/(?:.*\/)?page\.tsx$/.test(path)).map(({ path, blob }) => {
    const source = sourceAt(cwd, commit, path);
    const segments = path.replace(/^apps\/frontend\/app\//, '').replace(/(?:^|\/)page\.tsx$/, '').split('/').filter(Boolean);
    const route = '/' + segments.filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith('@')).join('/');
    return {
      route, path, blob,
      redirect: /\bredirect\(\s*(['"`])([^\n]+?)\1\s*\)/.exec(source)?.[2] ?? null,
      reexport: /^\s*export\s*\{\s*default\s*\}\s*from\s*(['"])([^'"]+)\1\s*;?\s*$/.exec(source)?.[2] ?? null,
      titles: [...source.matchAll(/\btitle="([^"]+)"|<h1(?:\s[^>]*)?>([^<{]+)<\/h1>/g)].map((m) => m[1] || m[2]),
      imports: [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
      apiCalls: [...new Set([...source.matchAll(/\bapi\.[A-Za-z]+\.[A-Za-z]+/g)].map((m) => m[0]))],
      verification: 'source-inventory-only; not a runtime or visual pass'
    };
  }).sort((a, b) => a.route.localeCompare(b.route));
  const rootFiles = files.filter(({ path }) => !path.includes('/')).map(({ path }) => path);
  const groups = {};
  for (const { path } of files) {
    const key = path.includes('/') ? path.split('/')[0] : '[root files]';
    groups[key] = (groups[key] ?? 0) + 1;
  }
  const byBlob = new Map();
  for (const { path, blob } of files) byBlob.set(blob, [...(byBlob.get(blob) ?? []), path]);
  const duplicates = [...byBlob].filter(([, paths]) => paths.length > 1).map(([blob, paths]) => ({ blob, paths, action: 'review references; do not delete automatically' }));
  const layout = files.find(({ path }) => path === 'apps/frontend/app/layout.tsx');
  const cssLoadOrder = layout ? [...sourceAt(cwd, commit, layout.path).matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map((m) => m[1]) : [];
  return {
    schemaVersion: 1, commit, tree, scope: 'tracked files at a pinned commit; no cloud or account enumeration',
    fileCount: files.length, routeCount: routes.length, groups, rootFiles, routes, cssLoadOrder,
    duplicateContentGroups: duplicates,
    nonRegularEntries: entries.filter(({ mode }) => !['100644', '100755', '040000'].includes(mode)),
    files: files.map(({ path, blob, mode }) => ({ path, blob, mode }))
  };
}

// Resolve existing parents before creating output; lexical paths alone do not detect
// a symlink that points an apparently external directory back into the checkout.
async function physicalDestination(path) {
  let current = resolve(path);
  const missing = [];
  for (;;) {
    try { return resolve(await realpath(current), ...missing.slice().reverse()); }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(basename(current));
      current = parent;
    }
  }
}

export async function writeInventory({ cwd = process.cwd(), ref = 'HEAD', out, bundle = false }) {
  if (!out) throw new Error('An explicit output directory outside the checkout is required.');
  const root = await realpath(git(cwd, ['rev-parse', '--show-toplevel']).trim());
  const output = await physicalDestination(out);
  const relation = relative(root, output);
  if (!relation || (!relation.startsWith('..' + '/') && relation !== '..' && !isAbsolute(relation))) {
    throw new Error('Output must be outside the checkout; the inventory never changes repository files.');
  }
  // Refuse redirected output files as well as redirected output directories.
  // Run in a trusted runner-owned directory; this is not an adversarial filesystem sandbox.
  for (const name of ['repository-inventory.json', 'repository-inventory.md', 'review-source.tar']) {
    try {
      if ((await lstat(resolve(output, name))).isSymbolicLink()) throw new Error('Inventory output must not be a symbolic link.');
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const data = inventory(root, ref);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'repository-inventory.json'), JSON.stringify(data, null, 2) + '\n');
  const table = data.routes.map((r) => `| \`${r.route}\` | \`${r.path}\` | ${r.redirect ? `redirect: \`${r.redirect}\`` : r.reexport ? `shared page re-export: \`${r.reexport}\`` : 'source present; runtime not certified'} |`).join('\n');
  await writeFile(resolve(output, 'repository-inventory.md'), `# Repository inventory\n\nCommit: \`${data.commit}\`\n\nTracked files: ${data.fileCount}. Page entry files: ${data.routeCount}.\n\nThis is a source inventory, not deployment, safety, visual, or completeness certification. Duplicate content is a review signal, never deletion authority.\n\n## Routes\n\n| Route | Owning file | Source disposition |\n|---|---|---|\n${table}\n\n## CSS import order\n\n${data.cssLoadOrder.map((p, i) => `${i + 1}. \`${p}\``).join('\n')}\n`);
  if (bundle) {
    const paths = data.files.filter(({ path, mode }) => ['100644', '100755'].includes(mode) && reviewablePath(path)).map(({ path }) => path);
    if (paths.length) {
      // Explicit tracked source allowlist: never include local .env, key files, media or generated outputs.
      const archive = git(root, ['archive', '--format=tar', data.commit, '--', ...paths], { encoding: null });
      await writeFile(resolve(output, 'review-source.tar'), archive);
    }
  }
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const readArg = (name) => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  try {
    const data = await writeInventory({ out: readArg('--out'), ref: readArg('--ref') ?? 'HEAD', bundle: args.includes('--bundle') });
    console.log(`Inventory ${data.commit}: ${data.fileCount} tracked files; ${data.routeCount} pages. No repository files changed.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Inventory failed.');
    process.exitCode = 1;
  }
}
