// netscied.tw viewer-request function (runtime cloudfront-js-2.0, under 10 KB).
// Specs: site-hosting "Edge logic fails open and stays small"; site-structure
// "URL conventions" and "Legacy URLs keep working". Tests: tests/unit/edge-function.test.mjs.
//
// Order: www → apex; the redirect map; …/index.html → …/; add a trailing slash
// to extensionless paths; serve directory URLs from index.html. Any error lets
// the request through unchanged rather than failing it.
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

function redirect(location) {
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

    if (CONFIG.redirectHosts.indexOf(host) >= 0) {
      return redirect('https://' + CONFIG.canonicalHost + uri + query);
    }

    var key = uri.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
    if (Object.prototype.hasOwnProperty.call(CONFIG.paths, key)) {
      return redirect(withQuery(CONFIG.paths[key], query));
    }

    if (/\/index\.html$/.test(uri)) {
      return redirect(uri.slice(0, -'index.html'.length) + query);
    }

    // Machine paths such as /.well-known/ go to the origin as requested.
    if (uri.indexOf('/.well-known/') === 0) {
      return request;
    }

    var last = uri.slice(uri.lastIndexOf('/') + 1);
    if (last !== '' && last.indexOf('.') < 0) {
      return redirect(uri + '/' + query);
    }

    if (uri.charAt(uri.length - 1) === '/') {
      request.uri = uri + 'index.html';
    }
  } catch (e) {
    // Fail open: let the request through unchanged.
  }
  return request;
}
