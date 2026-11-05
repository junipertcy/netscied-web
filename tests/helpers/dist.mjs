// Helpers for tests that inspect the production build in dist/.
// Build first: `pnpm build` (or `pnpm test`, which builds and then tests).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const distRoot = path.join(repoRoot, 'dist', 'netscied');
export const browserRoot = path.join(distRoot, 'browser');

export function distPath(relative) {
  if (!existsSync(browserRoot)) {
    throw new Error(`No build in ${browserRoot}; run "pnpm build" first.`);
  }
  return path.join(browserRoot, relative);
}

export function readDist(relative) {
  return readFileSync(distPath(relative), 'utf8');
}
