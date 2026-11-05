// Tasks 5.6, 7.2 — scripts/smoke.sh against the preview server, which runs the
// real CloudFront function, the 404 mapping and the deploy's content types. The
// production run (BASE=https://netscied.tw) waits for the deploy, task 10.2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { startPreview } from '../../scripts/preview.mjs';
import { browserRoot, repoRoot } from '../helpers/dist.mjs';

// The server runs in this process, so the script must run asynchronously.
function run(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('the smoke checks pass against the built site served like CloudFront', { timeout: 60_000 }, async () => {
  const server = await startPreview({ root: browserRoot, port: 0, rewriteLocation: false });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { code, out } = await run('bash', [path.join(repoRoot, 'scripts', 'smoke.sh')], { LOCAL: '1', BASE: base });
    assert.equal(code, 0, out);
    assert.match(out, /all checks passed/);
  } finally {
    server.close();
  }
});
