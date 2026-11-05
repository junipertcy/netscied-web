// Text helpers for generated output.
const CJK = /[\p{Script=Han}　-〿＀-￯「」『』（）、，。：；！？《》〈〉—–]/u;

// YAML block scalars keep the curator's line breaks. A line break between two
// CJK characters is dropped (Chinese has no spaces between words); any other
// single line break becomes a space; a blank line separates paragraphs.
export function joinLines(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .reduce((acc, line) => {
          if (!acc) return line;
          const a = Array.from(acc).at(-1);
          const b = Array.from(line)[0];
          return acc + (CJK.test(a) && CJK.test(b) ? '' : ' ') + line;
        }, ''),
    )
    .filter(Boolean)
    .join('\n\n');
}

// Applies joinLines to every zh-Hant/en value of a bilingual text object.
export function joinText(t) {
  if (!t || typeof t !== 'object') return t;
  const out = {};
  for (const [k, v] of Object.entries(t)) out[k] = joinLines(v);
  return out;
}

// The first sentence (or the first maxChars characters) of a text, for one-line summaries.
export function firstSentence(text, maxChars = 80) {
  if (!text) return '';
  const flat = text.replace(/\s*\n+\s*/g, ' ');
  const m = /^.*?[。！？](?=\s|$|[^」』）])|^.*?[.!?](?=\s|$)/u.exec(flat);
  const s = (m ? m[0] : flat).trim();
  const chars = Array.from(s);
  return chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join('')}…` : s;
}

export function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(';') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvField(r[c])).join(','))].join('\n') + '\n';
}

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
