// netscied.tw viewer-request function (runtime cloudfront-js-2.0, under 10 KB).
// Specs: site-hosting "Edge logic fails open and stays small"; site-structure
// "URL conventions" and "Legacy URLs keep working". Tests: tests/unit/edge-function.test.mjs.
//
// Rules, first match wins: the redirect map; …/index.html → …/; add a trailing
// slash to extensionless paths; collapse repeated slashes; www → apex. Then
// directory URLs are served from index.html. Every site redirect is an absolute
// https://netscied.tw URL, so no crafted path (//host, /\host) can send a browser
// off the site. Any error lets the request through unchanged rather than failing it.
//
// The map between the markers is generated from config/redirects.yaml by
// `pnpm edge:build`. Do not edit it by hand.
var CONFIG = /* redirects:begin */{"canonicalHost":"netscied.tw","redirectHosts":["www.netscied.tw"],"paths":{}}/* redirects:end */;

// Rebuilds the query string. CloudFront passes values still percent-encoded, so
// they are copied as received.
function queryString(querystring) {
  var parts = [];
  for (var name in querystring) {
    var field = querystring[name];
    var values = field.multiValue ? field.multiValue : [field];
    for (var i = 0; i < values.length; i++) {
      var value = values[i] && values[i].value;
      parts.push(value ? name + '=' + value : name);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// Puts the query before any #fragment in the target.
function withQuery(target, query) {
  var hash = target.indexOf('#');
  return hash < 0 ? target + query : target.slice(0, hash) + query + target.slice(hash);
}

// target is a site path (made absolute on the canonical host) or an https URL from the map.
function redirect(target) {
  var location = target.charAt(0) === '/' ? 'https://' + CONFIG.canonicalHost + target : target;
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: location },
      // Bounded, so a later change to the redirect map reaches browsers within a day.
      'cache-control': { value: 'public, max-age=86400' },
    },
  };
}

function handler(event) {
  var request = event.request;
  try {
    var uri = request.uri;
    var host = request.headers && request.headers.host ? request.headers.host.value : '';
    var query = queryString(request.querystring || {});
    var path = uri.replace(/\/{2,}/g, '/');
    var target = null;

    var key = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
    if (Object.prototype.hasOwnProperty.call(CONFIG.paths, key)) {
      target = withQuery(CONFIG.paths[key], query);
    } else if (/\/index\.html$/.test(path)) {
      target = path.slice(0, -'index.html'.length) + query;
    } else if (path.indexOf('/.well-known/') !== 0) {
      // Machine paths such as /.well-known/ go to the origin as requested.
      var last = path.slice(path.lastIndexOf('/') + 1);
      if (last !== '' && last.indexOf('.') < 0) {
        target = path + '/' + query;
      }
    }

    if (target === null && (path !== uri || CONFIG.redirectHosts.indexOf(host) >= 0)) {
      target = path + query;
    }
    if (target !== null) {
      return redirect(target);
    }

    if (path.charAt(path.length - 1) === '/') {
      request.uri = path + 'index.html';
    }
  } catch (e) {
    // Fail open: let the request through unchanged.
  }
  return request;
}
