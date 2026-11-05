// Loads catalog/vocab: the controlled vocabularies every record refers to.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readYaml } from './yaml.mjs';
import { loadSchemas, schemaErrors } from './schemas.mjs';

const FILES = ['domains', 'tags', 'licenses', 'formats', 'universities', 'labels', 'concepts'];

export function loadVocab(vocabDir) {
  const errors = [];
  const vocab = {};
  const schemas = loadSchemas();
  for (const name of FILES) {
    const file = path.join(vocabDir, `${name}.yaml`);
    if (!existsSync(file)) {
      errors.push({ file, field: '(file)', message: 'is missing' });
      continue;
    }
    const { data, error } = readYaml(file);
    if (error) {
      errors.push({ file, field: '(yaml)', message: error });
      continue;
    }
    for (const e of schemaErrors(schemas.vocab(name), data)) errors.push({ file, ...e });
    vocab[name] = data;
  }
  const spdxFile = path.join(vocabDir, 'spdx-licenses.json');
  vocab.spdx = JSON.parse(readFileSync(spdxFile, 'utf8'));
  for (const list of ['domains', 'tags', 'formats', 'universities', 'licenses']) {
    const seen = new Set();
    for (const entry of vocab[list] ?? []) {
      if (seen.has(entry.id)) errors.push({ file: path.join(vocabDir, `${list}.yaml`), field: entry.id, message: 'duplicate id' });
      seen.add(entry.id);
    }
  }
  const spdxIds = new Set(vocab.spdx.ids);
  for (const lic of vocab.licenses ?? []) {
    if (!/^(LicenseRef-|NOASSERTION$|NONE$)/.test(lic.id) && !spdxIds.has(lic.id)) {
      errors.push({ file: path.join(vocabDir, 'licenses.yaml'), field: lic.id, message: `is not in the pinned SPDX list ${vocab.spdx.licenseListVersion}` });
    }
  }
  const index = (list) => new Map((vocab[list] ?? []).map((e) => [e.id, e]));
  vocab.byId = {
    domains: index('domains'),
    tags: index('tags'),
    licenses: index('licenses'),
    formats: index('formats'),
    universities: index('universities'),
    concepts: new Map((vocab.concepts?.concepts ?? []).map((c) => [c.id, c])),
  };
  vocab.spdxIds = spdxIds;
  return { vocab, errors };
}
