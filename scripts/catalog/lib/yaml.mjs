// Reads YAML 1.2 files strictly: duplicate keys and syntax errors are errors, and
// unquoted dates stay strings (YAML 1.2 has no timestamp type).
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

export function readYaml(file) {
  const text = readFileSync(file, 'utf8');
  return parseYamlText(text);
}

export function parseYamlText(text) {
  const doc = parseDocument(text, { version: '1.2', uniqueKeys: true, prettyErrors: true });
  if (doc.errors.length) {
    return { data: undefined, error: doc.errors.map((e) => e.message.split('\n')[0]).join('; ') };
  }
  return { data: doc.toJS({ maxAliasCount: 50 }), error: null };
}

// Splits a Markdown file with YAML front matter into { data, body }.
export function readFrontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) return { data: undefined, body: text, error: 'missing YAML front matter between --- lines' };
  const { data, error } = parseYamlText(m[1]);
  return { data, body: m[2], error };
}
