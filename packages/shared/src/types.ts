/**
 * 백엔드 ENUM과 동일한 문자열 리터럴 타입 정의.
 *
 * 이 파일은 packages/shared에 위치해 프론트엔드(apps/web)와
 * 백엔드(apps/api) 양쪽에서 공통으로 import한다.
 * Supabase DB ENUM과 1:1 대응이므로, DB ENUM 변경 시 이 파일도 함께 수정해야 한다.
 */

/** 계좌 종류. CHECKING=입출금, SAVINGS=예·적금, LOAN=대출계좌, OTHER=기타. */
export type AccountType = 'CHECKING' | 'SAVINGS' | 'LOAN' | 'OTHER';

/** 카드 종류. CREDIT=신용카드, CHECK=체크카드, OTHER=기타(선불·포인트 등). */
export type CardType = 'CREDIT' | 'CHECK' | 'OTHER';

/**
 * 정기지출의 출처/성격 분류(flow_kind).
 *
 * - CARD_RECURRING   : 카드로 결제되는 정기 자동결제 (예: OTT, 학원비 카드납)
 * - BANK_AUTO_TRANSFER: 계좌에서 자동이체되는 정기출금 (예: 공과금, 보험료 CMS)
 * - CARD_BILL_PAYMENT : 카드 대금 결제 — 카드사에서 청구 금액이 결제 계좌에서 빠지는 것
 *                       (카드 사용분 집계 목적. 이중 계산 방지를 위해 별도 kind로 분리)
 * - OTHER            : 위 셋에 해당하지 않는 기타 정기지출
 */
export type FlowKind =
  | 'CARD_RECURRING'
  | 'BANK_AUTO_TRANSFER'
  | 'CARD_BILL_PAYMENT'
  | 'OTHER';

/**
 * 정기지출의 현재 상태.
 *
 * - ACTIVE    : 활성(매월 발생 중)
 * - PAUSED    : 일시 중단 (예: 육아휴직 중 OTT 잠깐 끊음). next_due_on 계산에서 제외.
 * - TERMINATED: 해지·종료. soft-delete 전 최종 상태. lifecycle 이벤트로 기록됨.
 */
export type FlowStatus = 'ACTIVE' | 'PAUSED' | 'TERMINATED';

/**
 * lifecycle_events 테이블에 기록되는 사건 유형.
 * lifecycle_events는 append-only 감사 로그이므로 이 이벤트들은 삭제되지 않는다.
 *
 * - CREATED      : 계좌·카드·정기지출 최초 등록
 * - UPDATED      : 금액·날짜·카테고리 등 필드 변경 (before_state/after_state에 diff 저장)
 * - TERMINATED   : 정기지출 해지 또는 계좌/카드 폐쇄
 * - NOTE         : 변경 없이 메모만 추가 (가족에게 공유할 맥락 설명 등)
 * - REVERTED     : 직전 UPDATED를 되돌림. 원본 레코드를 수정하지 않고 별도 이벤트로 append.
 *                  (v0.1.1 P2 패치로 추가 — 변경 증거를 지우지 않는 철학)
 * - RECLASSIFIED : 카테고리나 FlowKind 재분류. 금액/날짜 변경 없이 분류만 바뀔 때 구분.
 */
export type EventType =
  | 'CREATED'
  | 'UPDATED'
  | 'TERMINATED'
  | 'NOTE'
  | 'REVERTED'
  | 'RECLASSIFIED';

/**
 * lifecycle_events 변경 이유 코드.
 *
 * - LIFE_EVENT : 가족에게 알림을 보내는 의미 있는 변화 (이직·이사·아이 학원 시작 등).
 *               notify_spouse=true로 설정되며 상대방 화면에 Realtime 토스트가 뜬다.
 * - CORRECTION : 기록 오류 수정. 가족 알림 없이 조용히 정정. notify_spouse=false.
 */
export type ReasonCode = 'LIFE_EVENT' | 'CORRECTION';

/**
 * 정기지출 카테고리 11종.
 * UI 필터·도넛 차트·분담 집계에 사용된다.
 * 한국 가정의 주요 고정지출 항목을 망라했으며,
 * 세분화가 필요 없는 잡다한 항목은 OTHER로 묶는다.
 */
export type Category =
  | 'UTILITY'      // 공과금 (전기·수도·가스·관리비 등)
  | 'TELECOM'      // 통신비 (휴대폰·인터넷·IPTV)
  | 'INSURANCE'    // 보험료 (실비·생명·자동차보험 등)
  | 'MEDIA'        // OTT/미디어 (넷플릭스·유튜브 프리미엄 등)
  | 'SAAS'         // 구독앱/SaaS (노션·어도비·쿠팡와우 등)
  | 'EDUCATION'    // 교육·학원비 (영어·수학·음악 등)
  | 'LOAN'         // 대출 원리금 (주담대·전세대출·신용대출 이자)
  | 'CARD_BILL'    // 카드 대금 — FlowKind.CARD_BILL_PAYMENT와 대응
  | 'RENT'         // 월세·임대료
  | 'HEALTHCARE'   // 의료·건강 (헬스장·필라테스·약값)
  | 'OTHER';       // 기타

/**
 * ReasonCode 사용자 노출 라벨.
 * ReasonModal에서 버튼 텍스트로, 변경 기록 목록에서 배지 텍스트로 사용한다.
 */
export const REASON_LABEL: Record<ReasonCode, string> = {
  LIFE_EVENT: '가족에 알림',  // 상대방 Realtime 토스트 + Web Push 발송
  CORRECTION: '기록만',       // 조용히 정정, 알림 없음
};

/**
 * Category 사용자 노출 라벨.
 * 목록 필터 버튼, 도넛 차트 범례, 분담 집계 행에 표시되는 한국어 이름.
 */
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

/**
 * Category별 색상 — Bank Salad 팔레트 기반.
 * 도넛 차트 세그먼트, 목록 카테고리 배지, 현금흐름 캘린더 셀 테두리에 공통으로 사용한다.
 * 변경 시 차트·배지·캘린더 모두 동시에 바뀌므로 한 곳에서 관리한다.
 */
export const CATEGORY_COLOR: Record<Category, string> = {
  UTILITY: '#f59e0b',    // amber
  TELECOM: '#3b82f6',    // blue
  INSURANCE: '#14b8a6',  // teal
  MEDIA: '#8b5cf6',      // violet
  SAAS: '#ec4899',       // pink
  EDUCATION: '#f97316',  // orange
  LOAN: '#ef4444',       // red (부담감 강조)
  CARD_BILL: '#6366f1',  // indigo
  RENT: '#10b981',       // emerald
  HEALTHCARE: '#06b6d4', // cyan
  OTHER: '#94a3b8',      // slate (중립)
};
