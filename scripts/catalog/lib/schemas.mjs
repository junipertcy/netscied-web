// Compiles the JSON Schemas in schemas/v1 with ajv (draft 2020-12) and turns
// ajv errors into messages that name the field.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const schemaDir = path.join(repoRoot, 'schemas', 'v1');
const BASE = 'https://netscied.tw/api/v1/schema/';

let cached;
export function loadSchemas() {
  if (cached) return cached;
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const files = readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'));
  for (const f of files) ajv.addSchema(JSON.parse(readFileSync(path.join(schemaDir, f), 'utf8')));
  const get = (name) => {
    const v = ajv.getSchema(BASE + name);
    if (!v) throw new Error(`schema not found: ${name}`);
    return v;
  };
  cached = {
    ajv,
    files,
    dataset: get('dataset.schema.json'),
    version: get('version.schema.json'),
    person: get('person.schema.json'),
    course: get('course.schema.json'),
    news: get('news.schema.json'),
    recipe: get('recipe.schema.json'),
    vocab: (part) => get(`vocab.schema.json#/$defs/${part}`),
  };
  return cached;
}

// Field path for an ajv error: "a.b[0].c", plus the missing property for `required`.
export function fieldOf(err) {
  let p = err.instancePath
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? `[${s}]` : `.${s}`))
    .join('')
    .replace(/^\./, '');
  if (err.keyword === 'required') p = p ? `${p}.${err.params.missingProperty}` : err.params.missingProperty;
  if (err.keyword === 'additionalProperties' || err.keyword === 'unevaluatedProperties') {
    const extra = err.params.additionalProperty ?? err.params.unevaluatedProperty;
    p = p ? `${p}.${extra}` : extra;
  }
  return p || '(record)';
}

function describe(err) {
  switch (err.keyword) {
    case 'required':
      return 'is required';
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return 'is not an allowed field';
    case 'enum':
      return `must be one of: ${err.params.allowedValues.join(', ')}`;
    case 'type':
      return `must be ${err.params.type}${err.params.type === 'string' ? ' (quote it in YAML)' : ''}`;
    case 'const':
      return `must be ${JSON.stringify(err.params.allowedValue)}`;
    case 'not':
      return 'has a value that is not allowed here';
    default:
      return err.message;
  }
}

// Runs a compiled validator and returns [{ field, message }], without the
// noise of if/then/allOf wrapper errors.
export function schemaErrors(validate, data) {
  if (validate(data)) return [];
  const seen = new Set();
  const out = [];
  for (const err of validate.errors ?? []) {
    if (['if', 'allOf', 'anyOf', 'oneOf'].includes(err.keyword) && validate.errors.length > 1) continue;
    const field = fieldOf(err);
    const message = describe(err);
    const key = `${field}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ field, message });
  }
  return out;
}
