#!/usr/bin/env node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [browser, targetUrl, timeoutInput = '30000'] = process.argv.slice(2);
const timeoutMs = Number(timeoutInput);
if (!browser || !targetUrl || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
  console.error('usage: capture-live-map-dom.mjs BROWSER URL TIMEOUT_MS');
  process.exit(64);
}
const parsed = new URL(targetUrl);
if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.run.app')) {
  console.error('Maps certification URL must be an HTTPS run.app origin.');
  process.exit(64);
}

const profile = await mkdtemp(join(tmpdir(), 'khedmah-maps-cert-'));
const child = spawn(browser, [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  targetUrl
], { stdio: 'ignore' });

let socket;
let nextId = 0;
const pending = new Map();
const deadline = Date.now() + timeoutMs;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanup() {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (!child.killed) child.kill('SIGTERM');
}
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('SIGTERM', () => { cleanup(); process.exit(143); });

try {
  let port;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready (${child.exitCode}).`);
    try {
      const activePort = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
      port = Number(activePort.split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) break;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await delay(100);
  }
  if (!port) throw new Error('Timed out waiting for Chrome DevTools.');

  let page;
  while (Date.now() < deadline) {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    page = pages.find((entry) => entry.type === 'page' && entry.url === targetUrl)
      ?? pages.find((entry) => entry.type === 'page');
    if (page?.webSocketDebuggerUrl) break;
    await delay(100);
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome did not expose the certification page.');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await command('Runtime.enable');

  let lastHtml = '';
  while (Date.now() < deadline) {
    const result = await command('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const root = document.querySelector('main#foundation-content');
        if (!root) return null;
        return {
          html: root.outerHTML,
          status: root.getAttribute('data-map-status'),
          renderStatus: root.getAttribute('data-map-render-status')
        };
      })()`
    });
    const value = result?.result?.value;
    if (value?.html) lastHtml = value.html;
    if (value?.status === 'error' || (value?.status === 'ready' && value?.renderStatus === 'ready')) {
      process.stdout.write(value.html);
      process.exitCode = 0;
      break;
    }
    await delay(250);
  }
  if (process.exitCode === undefined) {
    if (lastHtml) process.stdout.write(lastHtml);
    process.exitCode = 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cleanup();
  await rm(profile, { recursive: true, force: true });
}
