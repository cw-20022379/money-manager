// 백엔드 ENUM과 동일한 문자열 리터럴
export type AccountType = 'CHECKING' | 'SAVINGS' | 'LOAN' | 'OTHER';
export type CardType = 'CREDIT' | 'CHECK' | 'OTHER';
export type FlowKind =
  | 'CARD_RECURRING'
  | 'BANK_AUTO_TRANSFER'
  | 'CARD_BILL_PAYMENT'
  | 'OTHER';
export type FlowStatus = 'ACTIVE' | 'PAUSED' | 'TERMINATED';
export type EventType =
  | 'CREATED'
  | 'UPDATED'
  | 'TERMINATED'
  | 'NOTE'
  | 'REVERTED'
  | 'RECLASSIFIED';
export type ReasonCode = 'LIFE_EVENT' | 'CORRECTION';
export type Category =
  | 'UTILITY'
  | 'TELECOM'
  | 'INSURANCE'
  | 'MEDIA'
  | 'SAAS'
  | 'EDUCATION'
  | 'LOAN'
  | 'CARD_BILL'
  | 'RENT'
  | 'HEALTHCARE'
  | 'OTHER';

// 사용자 노출 라벨 (용어 사전)
export const REASON_LABEL: Record<ReasonCode, string> = {
  LIFE_EVENT: '가족에 알림',
  CORRECTION: '기록만',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  UTILITY: '공과금',
  TELECOM: '통신',
  INSURANCE: '보험',
  MEDIA: 'OTT/미디어',
  SAAS: '구독앱',
  EDUCATION: '교육·학원',
  LOAN: '대출 상환',
  CARD_BILL: '카드 대금',
  RENT: '월세',
  HEALTHCARE: '의료·약값',
  OTHER: '기타',
};
