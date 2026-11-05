// Checks individual dataset or course record files against their schema and the
// vocabularies, without the cross-file rules of validate.mjs. Useful while
// drafting records outside catalog/.
//
//   node scripts/catalog/check-records.mjs path/to/datasets/x.yaml path/to/courses/y.yaml
// A file under a datasets/ directory is a dataset record; under courses/, a course.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml } from './lib/yaml.mjs';
import { loadVocab } from './lib/vocab.mjs';
import { checkCourse, checkDataset } from './lib/records.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const { vocab, errors: vocabErrors } = loadVocab(path.join(repoRoot, 'catalog', 'vocab'));
let errors = [...vocabErrors];
let warnings = [];
for (const file of process.argv.slice(2)) {
  const { data, error } = readYaml(file);
  if (error) {
    errors.push({ file, field: '(yaml)', message: error });
    continue;
  }
  const kind = file.split(path.sep).includes('courses') ? 'course' : 'dataset';
  const result = kind === 'course' ? checkCourse(data, file, { vocab }) : checkDataset(data, file, { vocab });
  errors = errors.concat(result.errors);
  warnings = warnings.concat(result.warnings);
}
for (const w of warnings) console.log(`warning: ${w.file}: ${w.field}: ${w.message}`);
for (const e of errors) console.log(`error: ${e.file}: ${e.field}: ${e.message}`);
console.log(`${process.argv.length - 2} files, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
