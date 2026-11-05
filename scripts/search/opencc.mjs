// OpenCC dictionaries (opencc-data, Apache-2.0), used at build time only:
// TWVariantsRev maps Taiwan variant forms to OpenCC's standard Traditional, and
// TSCharacters maps Traditional to Simplified (first candidate). TSPhrases is
// used only by the gold-set gate to produce realistic Simplified queries.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dataDir = path.join(path.dirname(require.resolve('opencc-data/package.json')), 'data');

function readDict(name) {
  const map = new Map();
  for (const line of readFileSync(path.join(dataDir, `${name}.txt`), 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [from, to] = line.split('\t');
    if (from && to) map.set(from, to.split(' ')[0]);
  }
  return map;
}

let tables;
export function openccTables() {
  if (!tables) {
    tables = { twRev: readDict('TWVariantsRev'), ts: readDict('TSCharacters'), tsPhrases: readDict('TSPhrases') };
  }
  return tables;
}

// One character, Taiwan form or Traditional, to its Simplified fold.
export function foldChar(ch) {
  const { twRev, ts } = openccTables();
  const std = twRev.get(ch) ?? ch;
  return ts.get(std) ?? ts.get(ch) ?? std;
}

// Phrase-aware Traditional→Simplified conversion (longest match over TSPhrases,
// then characters), as a reader would type the query in Simplified Chinese.
export function toSimplified(text) {
  const { tsPhrases } = openccTables();
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; ) {
    let matched = false;
    for (let len = Math.min(8, chars.length - i); len >= 2; len--) {
      const phrase = chars.slice(i, i + len).join('');
      const hit = tsPhrases.get(phrase);
      if (hit) {
        out += hit;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += foldChar(chars[i]);
      i += 1;
    }
  }
  return out;
}
