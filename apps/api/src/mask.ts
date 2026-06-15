/**
 * mask.ts — 마스킹된 계좌·카드 번호 처리 유틸 (백엔드 공용).
 *
 * accounts·cards 라우트가 동일하게 쓰던 last4 추출 로직을 한 곳으로 모았다.
 */

/**
 * extractLast4 (P10 마이데이터 매칭 대비):
 *   "****1234" 같은 마스킹 문자열에서 숫자만 추출해 뒤 4자리를 반환.
 *   향후 마이데이터 API가 반환하는 계좌·카드 정보와 last4로 매칭할 수 있도록,
 *   account_last4 / card_last4 컬럼에 저장해둔다. (지금은 UI에 노출하지 않음)
 *   4자리 미만이면 매칭 키로 못 쓰므로 null.
 */
export function extractLast4(masked?: string): string | null {
  if (!masked) return null;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}
