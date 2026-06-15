/**
 * lib/format.ts — 숫자 포맷 유틸
 *
 * null/undefined 입력을 '-'로 처리해 UI에서 별도 null-check 없이 바로 쓸 수 있다.
 */

/** 전체 금액 (예: 1,234,567원). 목록·상세 화면에 사용. */
export const krw = (n: number | null | undefined) =>
  n == null ? '-' : new Intl.NumberFormat('ko-KR').format(n) + '원';

/**
 * 축약 금액 (예: 1234만). 카드·바 차트 등 공간이 좁은 곳에 사용.
 * 기준: 1000만 이상 → 천만 단위, 10000 이상 → 만 단위, 그 미만 → 전체 표시.
 */
export const krwShort = (n: number | null | undefined) => {
  if (n == null) return '-';
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return new Intl.NumberFormat('ko-KR').format(n);
};
