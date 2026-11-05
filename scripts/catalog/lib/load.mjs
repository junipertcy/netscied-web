// Loads a catalog tree: <root>/catalog, <root>/content/news and
// <root>/curation/recipes. A root without its own catalog/vocab uses the
// repository's (test fixtures rely on this).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readFrontMatter, readYaml } from './yaml.mjs';
import { loadVocab } from './vocab.mjs';
import { repoRoot } from './schemas.mjs';

const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []);

export function parseIdsLock(text) {
  const entries = [];
  const aliases = [];
  const malformed = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/\s+/);
    if ((parts[0] === 'dataset' || parts[0] === 'course') && parts.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[2])) {
      entries.push({ kind: parts[0], id: parts[1], added: parts[2], line: i + 1 });
    } else if (parts[0] === 'alias' && parts.length === 3) {
      aliases.push({ from: parts[1], to: parts[2], line: i + 1 });
    } else malformed.push({ line: i + 1, text: line });
  });
  return { entries, aliases, malformed };
}

export function loadCatalog(root) {
  const errors = [];
  const rel = (f) => path.relative(root, f);
  const catalogDir = path.join(root, 'catalog');
  const ownVocab = path.join(catalogDir, 'vocab');
  const { vocab, errors: vocabErrors } = loadVocab(existsSync(ownVocab) ? ownVocab : path.join(repoRoot, 'catalog', 'vocab'));
  for (const e of vocabErrors) errors.push({ ...e, file: path.relative(root, e.file) });

  const readAll = (dir) =>
    list(dir, '.yaml').map((f) => {
      const file = path.join(dir, f);
      const { data, error } = readYaml(file);
      if (error) errors.push({ file: rel(file), field: '(yaml)', message: error });
      return { file: rel(file), data };
    });

  const datasets = readAll(path.join(catalogDir, 'datasets')).filter((r) => r.data !== undefined);
  const courses = readAll(path.join(catalogDir, 'courses')).filter((r) => r.data !== undefined);
  const people = readAll(path.join(catalogDir, 'people')).filter((r) => r.data !== undefined);

  const versions = [];
  const versionsDir = path.join(catalogDir, 'versions');
  if (existsSync(versionsDir)) {
    for (const id of readdirSync(versionsDir).sort()) {
      const dir = path.join(versionsDir, id);
      for (const f of list(dir, '.json')) {
        const file = path.join(dir, f);
        try {
          versions.push({ file: rel(file), dir: id, name: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(file, 'utf8')) });
        } catch (e) {
          errors.push({ file: rel(file), field: '(json)', message: e.message });
        }
      }
    }
  }

  const news = list(path.join(root, 'content', 'news'), '.md').map((f) => {
    const file = path.join(root, 'content', 'news', f);
    const { data, body, error } = readFrontMatter(readFileSync(file, 'utf8'));
    if (error) errors.push({ file: rel(file), field: '(front matter)', message: error });
    return { file: rel(file), data, body };
  });

  const optionalYaml = (name) => {
    const file = path.join(catalogDir, name);
    if (!existsSync(file)) return undefined;
    const { data, error } = readYaml(file);
    if (error) errors.push({ file: rel(file), field: '(yaml)', message: error });
    return { file: rel(file), data };
  };

  const recipes = readAll(path.join(root, 'curation', 'recipes')).filter((r) => r.data !== undefined);

  const lockFile = path.join(catalogDir, 'ids.lock');
  const idsLock = existsSync(lockFile) ? { file: rel(lockFile), text: readFileSync(lockFile, 'utf8') } : null;
  if (!idsLock) errors.push({ file: 'catalog/ids.lock', field: '(file)', message: 'is missing' });

  return {
    root,
    vocab,
    datasets,
    courses,
    people,
    versions,
    news,
    recipes,
    international: optionalYaml('international.yaml'),
    rejected: optionalYaml('courses-rejected.yaml'),
    idsLock,
    errors,
  };
}
