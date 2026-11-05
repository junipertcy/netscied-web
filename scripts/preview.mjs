// Serves the production build the way CloudFront serves the bucket, for local
// preview and for the Playwright tests:
//   1. the real viewer-request function (infra/cloudfront/viewer-request.js) runs
//      first, so redirects and index.html rewrites match production;
//   2. a missing key answers /404/index.html with status 404 (task 2.5's error
//      responses);
//   3. files carry the content types scripts/deploy.mjs sets at upload.
// /data/<id>/<version>/ is served from build/data/ when the curation pipeline has
// written local copies there (they are uploaded separately, task 8.6).
//
//   node scripts/preview.mjs [--port 4200] [--root dist/netscied/browser]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classify } from './deploy.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://netscied.tw';

const FALLBACK_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.graphml': 'application/graphml+xml',
  '.zip': 'application/zip',
};

function contentType(rel) {
  try {
    const c = classify(rel);
    if (c.contentType) return c.contentType;
  } catch {
    // Not a deployable site file (for example a /data/ file); fall back to the extension.
  }
  if (path.posix.basename(rel) === 'SHA256SUMS') return 'text/plain; charset=utf-8';
  return FALLBACK_TYPES[path.extname(rel)] ?? 'application/octet-stream';
}

function loadEdgeHandler() {
  const code = readFileSync(path.join(repoRoot, 'infra', 'cloudfront', 'viewer-request.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(code, context, { filename: 'viewer-request.js' });
  return context.handler;
}

function edgeEvent(req) {
  const url = req.url ?? '/';
  const q = url.indexOf('?');
  const querystring = {};
  if (q >= 0) {
    for (const part of url.slice(q + 1).split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const name = eq < 0 ? part : part.slice(0, eq);
      const value = eq < 0 ? '' : part.slice(eq + 1);
      if (querystring[name]) {
        querystring[name].multiValue = querystring[name].multiValue ?? [{ value: querystring[name].value }];
        querystring[name].multiValue.push({ value });
      } else querystring[name] = { value };
    }
  }
  return {
    version: '1.0',
    context: { eventType: 'viewer-request' },
    viewer: { ip: '127.0.0.1' },
    request: {
      method: req.method,
      uri: q < 0 ? url : url.slice(0, q),
      querystring,
      headers: { host: { value: 'netscied.tw' } },
      cookies: {},
    },
  };
}

// Resolves a request URI to a file under root, or null. Never leaves root.
function resolveFile(root, uri) {
  let decoded;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return null;
  }
  const file = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export function startPreview({ root, port = 4200, host = '127.0.0.1', dataRoot, rewriteLocation = false } = {}) {
  const siteRoot = path.resolve(root);
  const handler = loadEdgeHandler();
  const server = createServer((req, res) => {
    const result = handler(edgeEvent(req));
    if (result && result.statusCode) {
      const headers = {};
      for (const [name, { value }] of Object.entries(result.headers ?? {})) headers[name] = value;
      if (rewriteLocation && headers.location?.startsWith(ORIGIN)) {
        headers.location = headers.location.slice(ORIGIN.length);
      }
      res.writeHead(result.statusCode, headers);
      res.end();
      return;
    }
    const uri = result.uri;
    let file = null;
    let rel = uri.replace(/^\/+/, '');
    if (dataRoot && uri.startsWith('/data/')) {
      file = resolveFile(path.resolve(dataRoot), uri.slice('/data'.length));
    } else {
      file = resolveFile(siteRoot, uri);
    }
    let status = 200;
    if (!file) {
      status = 404;
      rel = '404/index.html';
      file = path.join(siteRoot, rel);
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
    }
    const headers = { 'content-type': contentType(rel) };
    if (uri.startsWith('/api/') || uri.startsWith('/data/')) headers['access-control-allow-origin'] = '*';
    res.writeHead(status, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const root = path.resolve(repoRoot, opt('--root', 'dist/netscied/browser'));
  if (!existsSync(root)) throw new Error(`no build at ${root}; run "pnpm build" first`);
  const port = Number(opt('--port', '4200'));
  const dataRoot = path.join(repoRoot, 'build', 'data');
  const server = await startPreview({ root, port, dataRoot: existsSync(dataRoot) ? dataRoot : undefined, rewriteLocation: true });
  console.log(`netscied preview: http://127.0.0.1:${server.address().port}/ (serving ${path.relative(repoRoot, root)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
