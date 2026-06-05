export const krw = (n: number | null | undefined) =>
  n == null ? '-' : new Intl.NumberFormat('ko-KR').format(n) + '원';

export const krwShort = (n: number | null | undefined) => {
  if (n == null) return '-';
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return new Intl.NumberFormat('ko-KR').format(n);
};
