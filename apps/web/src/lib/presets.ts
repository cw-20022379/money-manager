/**
 * lib/presets.ts — 은행·카드사 프리셋 목록 + 입력 정규화 유틸
 *
 * BANK_PRESETS / CARD_ISSUER_PRESETS: InstitutionSelect 셀렉트박스의 선택지.
 *   한국 주요 금융기관 목록. 프리셋에 없는 기관은 CUSTOM_OPTION("직접 입력")으로 처리.
 *   v0.2에서 packages/presets로 분리 권고.
 *
 * normalizeAccountNumber: 계좌번호 정규화. 대시·공백 제거, 숫자와 별표(*)만 유지.
 *   사용자가 "110-3456-7890"처럼 대시를 포함해 입력해도 정규화 후 저장.
 *
 * formatCardNumber: 카드번호 4자리마다 대시 자동 삽입.
 *   마스킹 문자(*)도 허용해 "5325xxxx1234" → "5325-xxxx-1234" 형태.
 */
// 한국 주요 은행·카드사 프리셋. 직접 입력 폴백 포함.
// v0.2에서 packages/presets로 분리 권고.

export const BANK_PRESETS = [
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  'NH농협은행',
  'IBK기업은행',
  'SC제일은행',
  '카카오뱅크',
  '토스뱅크',
  '케이뱅크',
  '한국씨티은행',
  '새마을금고',
  '신협',
  '우체국',
  '부산은행',
  '대구은행',
  '광주은행',
  '전북은행',
  '경남은행',
  '제주은행',
  '산업은행',
] as const;

export const CARD_ISSUER_PRESETS = [
  '신한카드',
  '삼성카드',
  '현대카드',
  'KB국민카드',
  '롯데카드',
  '우리카드',
  '하나카드',
  'BC카드',
  'NH농협카드',
  'IBK기업카드',
  '씨티카드',
  '카카오뱅크 카드',
  '토스뱅크 카드',
  '케이뱅크 카드',
] as const;

export const CUSTOM_OPTION = '직접 입력';

/**
 * 계좌번호 — 대시·공백 제거, 숫자와 별표(*)만 유지.
 */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[^0-9*]/g, '');
}

/**
 * 카드번호 — 숫자/별표만 추출 후 4자리마다 대시 자동 삽입.
 * 예: "5325xxxx1234" → "5325-xxxx-1234"
 */
export function formatCardNumber(raw: string): string {
  const clean = raw.replace(/[^0-9*]/gi, '').toLowerCase();
  if (!clean) return '';
  return clean.match(/.{1,4}/g)!.join('-');
}
