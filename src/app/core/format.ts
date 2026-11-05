// Display helpers shared by the pages.
const nf = new Intl.NumberFormat('en-US');

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${nf.format(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export const number = (n: number) => nf.format(n);

/** 2026-11-04 → 2026 年 11 月 4 日 */
export function zhDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return d ? `${y} 年 ${m} 月 ${d} 日` : m ? `${y} 年 ${m} 月` : `${y} 年`;
}

export const shortSha = (sha: string) => sha.slice(0, 12);
