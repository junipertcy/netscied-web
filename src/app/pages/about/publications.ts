// Publications listed at /about/#booklet. The original PDFs lived on hosts that
// no longer exist; owner decision A3 (2026-11-04): link labelled Internet Archive
// copies where they exist, otherwise list the item without a download link.
// Replace an `archived` link with a /files/ path once the owner provides the file.
export interface Publication {
  label: string;
  /** Live link, when the original is still online. */
  url?: string;
  /** Internet Archive copy, labelled as such on the page. */
  archived?: string;
}

export const BOOKLET: Publication[] = [
  { label: '中文翻譯《網絡素養：關於網絡科學的基本概念和核心思想》' },
  { label: '英文原版 Network Literacy: Essential Concepts and Core Ideas' },
];

export const COMPLEXITY_EXPLAINED: Publication[] = [
  { label: '英文原版 Complexity Explained', url: 'https://complexityexplained.github.io/ComplexityExplained.pdf' },
  { label: '中文翻譯《複雜系統：沒說你不知道》', url: 'https://complexityexplained.github.io/ComplexityExplained[Chinese].pdf' },
];
