// Small git helpers for rules that look at history: manifest immutability and
// the append-only ids.lock compare against a base ref (origin/main in CI).
import { execFileSync } from 'node:child_process';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

export function refExists(cwd, ref) {
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

// Paths (relative to cwd) of files under dir at ref.
export function listAtRef(cwd, ref, dir) {
  try {
    return git(cwd, ['ls-tree', '-r', '--name-only', ref, '--', dir]).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function showAtRef(cwd, ref, rel) {
  try {
    return git(cwd, ['show', `${ref}:./${rel}`]);
  } catch {
    return null;
  }
}
