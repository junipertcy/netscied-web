import { Injectable } from '@angular/core';
import { DefaultUrlSerializer, UrlTree } from '@angular/router';

/**
 * Repairs malformed percent-escapes before Angular parses a URL (final review W5).
 * The default serializer throws NG04018 on a lone "%" (…?utm_source=%) or on an
 * escape run that is not valid UTF-8 (a share cut off inside %E9%A6), and the app
 * then replaces the page with the home page. Here a "%" not followed by two hex
 * digits becomes "%25", and a run of escapes that is not valid UTF-8 is decoded
 * leniently (invalid bytes become U+FFFD) and encoded again.
 */
export function repairPercentEscapes(url: string): string {
  const lone = url.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
  return lone.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      decodeURIComponent(run);
      return run;
    } catch {
      const bytes = new Uint8Array(run.length / 3);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(run.slice(i * 3 + 1, i * 3 + 3), 16);
      return encodeURIComponent(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
    }
  });
}

@Injectable()
export class LenientUrlSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    return super.parse(repairPercentEscapes(url));
  }
}
