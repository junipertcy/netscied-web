// Runs a CloudFront Function (cloudfront-js-2.0 viewer-request) in a bare VM context,
// with events shaped like the ones CloudFront passes in production.
import vm from 'node:vm';

export function loadHandler(code) {
  const context = vm.createContext({});
  vm.runInContext(code, context, { filename: 'viewer-request.js' });
  if (typeof context.handler !== 'function') throw new Error('the function defines no handler()');
  return context.handler;
}

// CloudFront hands query values to the function as received, still percent-encoded.
export function parseQuery(raw) {
  const out = {};
  if (!raw) return out;
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    const name = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? '' : part.slice(eq + 1);
    if (out[name]) {
      out[name].multiValue = out[name].multiValue ?? [{ value: out[name].value }];
      out[name].multiValue.push({ value });
    } else {
      out[name] = { value };
    }
  }
  return out;
}

export function viewerRequest(url, { host = 'netscied.tw' } = {}) {
  const q = url.indexOf('?');
  const uri = q < 0 ? url : url.slice(0, q);
  return {
    version: '1.0',
    context: { eventType: 'viewer-request', distributionId: 'ETEST', requestId: 'test' },
    viewer: { ip: '192.0.2.1' },
    request: {
      method: 'GET',
      uri,
      querystring: parseQuery(q < 0 ? '' : url.slice(q + 1)),
      headers: { host: { value: host } },
      cookies: {},
    },
  };
}
