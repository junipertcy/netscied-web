// Builds the `normalize` block of /api/v1/catalog.json: the Traditional→Simplified
// fold map cut down to the characters the corpus needs (design D4, about 1–5 KB),
// and the word lists of catalog/vocab/concepts.yaml, already folded, so the
// browser applies exactly what the build applied.
import { foldChar, openccTables } from './opencc.mjs';

const fold1 = (s) => Array.from(s.normalize('NFKC').toLowerCase()).map(foldChar).join('');

export function makeNormalizeData(concepts, corpusTexts) {
  // Phrase folds apply after the character fold, in order.
  const phrases = concepts.phrase_folds.map(([from, to]) => [fold1(from), fold1(to)]);
  const foldText = (s) => phrases.reduce((t, [from, to]) => t.split(from).join(to), fold1(s));
  const lists = {
    generic: concepts.generic.map(foldText),
    fillers: concepts.fillers.map(foldText).sort((a, b) => b.length - a.length || (a < b ? -1 : 1)),
    networking: concepts.networking_intent.map(foldText),
    modeWords: {
      courses: concepts.mode_words.courses.map(foldText),
      datasets: concepts.mode_words.datasets.map(foldText),
    },
  };
  // Characters the folded corpus contains: any character that folds to one of
  // them must be in the map, so a query in either script lands on the same form.
  const corpus = [...corpusTexts, ...concepts.generic, ...concepts.fillers, ...concepts.networking_intent,
    ...concepts.mode_words.courses, ...concepts.mode_words.datasets, ...concepts.phrase_folds.flat()];
  // Both before and after the phrase folds: 絡 must still fold to 络 for the
  // phrase fold 网络 → 网路 to apply.
  const needed = new Set();
  for (const text of corpus) {
    for (const ch of Array.from(fold1(text ?? ''))) needed.add(ch);
    for (const ch of Array.from(foldText(text ?? ''))) needed.add(ch);
  }
  const sources = new Set();
  for (const text of corpus) for (const ch of Array.from((text ?? '').normalize('NFKC').toLowerCase())) sources.add(ch);
  const fold = {};
  const consider = (ch) => {
    const to = foldChar(ch);
    if (to !== ch && needed.has(to)) fold[ch] = to;
  };
  for (const ch of sources) consider(ch);
  // Also the other Traditional forms that fold onto a needed character (臺 and 台
  // both fold to 台; a query may use either), from the OpenCC tables.
  for (const ch of allTraditionalFoldingTo(needed)) consider(ch);
  const sorted = Object.fromEntries(Object.entries(fold).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { fold: sorted, phrases, ...lists };
}

function* allTraditionalFoldingTo(needed) {
  const { twRev, ts } = openccTables();
  for (const ch of new Set([...twRev.keys(), ...ts.keys()])) {
    if (Array.from(ch).length === 1 && needed.has(foldChar(ch))) yield ch;
  }
}
