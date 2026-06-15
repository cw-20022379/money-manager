/**
 * 프론트엔드 입력 검증용 Zod 스키마 (packages/shared).
 *
 * ⚠️ 주의: 이 스키마는 백엔드 apps/api의 각 route가 사용하는 CreateBody 타입과
 * 별도로 정의되어 있어, 일부 필드에서 불일치가 발생한다.
 *
 * 알려진 불일치 목록:
 *   - owner_user_id : 백엔드 CreateBody에는 있으나, 이 스키마에는 없다.
 *                     (프론트는 별도 셀렉트 UI로 전송하고 백엔드에서만 검증)
 *   - schedule_freq : 백엔드는 'MONTHLY' | 'QUARTERLY' | 'YEARLY' 지원하지만,
 *                     이 스키마에는 없고 백엔드가 'MONTHLY'를 default로 처리.
 *   - next_due_on   : 백엔드에서 schedule_day 기반으로 서버 계산. 스키마에 없음.
 *
 * → 검증 이원화 구조 — 프론트: Zod, 백엔드: 자체 검증.
 *   향후 단일화 과제: tRPC 또는 공유 Zod 스키마를 backend route 검증에도 직접 적용.
 */
import { z } from 'zod';

/** reason_code ENUM 검증. UI에서 ReasonModal 선택값을 서버로 전달할 때 사용. */
export const ReasonCodeSchema = z.enum(['LIFE_EVENT', 'CORRECTION']);

/**
 * 새 가족 그룹 생성 요청 스키마.
 * - name        : 가족 내부 식별자 (로그인·URL에 안 쓰임)
 * - display_name: 가입자 본인의 화면 표시명 (예: "남편", "아내")
 */
export const CreateFamilySchema = z.object({
  name: z.string().min(1).max(60),
  display_name: z.string().min(1).max(30),
});

/**
 * 초대 토큰으로 가족 합류 요청 스키마.
 * - token       : invite_tokens.token (7일 TTL, 1회용)
 * - display_name: 합류자의 화면 표시명
 */
export const JoinFamilySchema = z.object({
  token: z.string().min(8),
  display_name: z.string().min(1).max(30),
});

/**
 * 계좌 등록 요청 스키마.
 *
 * ⚠️ 불일치: 백엔드 CreateBody에는 owner_user_id(soft ownership 라벨 지정) 필드가 있으나
 * 이 스키마에는 없다. 프론트는 별도 셀렉트 UI 값을 직접 request body에 합쳐 전송하고,
 * 백엔드가 검증 후 저장한다.
 *
 * - account_number_masked: 뒤 4자리만 표시하는 마스킹 번호 (선택). UI 확인용, 인증 아님.
 * - balance_krw          : 현재 잔액. 정확한 금액이 아닌 참고용(자동 갱신 미지원 v0.x).
 */
export const CreateAccountSchema = z.object({
  institution_name: z.string().min(1).max(60),
  account_type: z.enum(['CHECKING', 'SAVINGS', 'LOAN', 'OTHER']),
  nickname: z.string().min(1).max(60),
  account_number_masked: z.string().optional(),
  balance_krw: z.number().int().nonnegative().optional(),
});

/**
 * 정기지출 등록 요청 스키마.
 *
 * ⚠️ 불일치: 백엔드 CreateBody 대비 누락된 필드:
 *   - owner_user_id : soft ownership 라벨 (누가 이 지출을 책임지는가).
 *                     null = 공동 부담. 백엔드에서만 검증.
 *   - schedule_freq : 현재 'MONTHLY'만 실사용이지만 백엔드 타입에 정의됨. 이 스키마에 없음.
 *
 * source_account_id / source_card_id XOR 제약:
 *   DB CHECK 제약과 동일하게 Zod refine으로도 강제한다.
 *   "카드 정기결제냐, 계좌 자동이체냐" — 출처가 하나로 명확해야 현금흐름이 올바르게 집계된다.
 *   둘 다 null이거나 둘 다 있으면 흐름의 출처가 모호해져 이중 계산 위험이 생긴다.
 *
 * amount_is_variable:
 *   true면 amount_krw가 null이어야 한다 (DB CHECK 제약과 대응).
 *   변동 지출(공과금 등)은 금액을 미리 알 수 없어 추정 평균값도 강제하지 않는다.
 *
 * schedule_day:
 *   매월 결제되는 날(1~31). 29~31일은 해당 월에 그 날이 없으면
 *   백엔드가 말일로 clamp해 next_due_on을 계산한다.
 */
export const CreateFlowSchema = z
  .object({
    merchant_name: z.string().min(1).max(60),
    category: z.enum([
      'UTILITY',
      'TELECOM',
      'INSURANCE',
      'MEDIA',
      'SAAS',
      'EDUCATION',
      'LOAN',
      'CARD_BILL',
      'RENT',
      'HEALTHCARE',
      'OTHER',
    ]),
    flow_kind: z.enum([
      'CARD_RECURRING',
      'BANK_AUTO_TRANSFER',
      'CARD_BILL_PAYMENT',
      'OTHER',
    ]),
    source_account_id: z.string().uuid().optional(),
    source_card_id: z.string().uuid().optional(),
    amount_krw: z.number().int().positive().optional(),
    amount_is_variable: z.boolean().default(false),
    schedule_day: z.number().int().min(1).max(31),
    is_draft: z.boolean().default(false),
    notes: z.string().max(200).optional(),
  })
  .refine(
    // XOR: source_account_id와 source_card_id 중 정확히 하나만 있어야 한다.
    // DB의 CHECK 제약과 동일한 규칙을 클라이언트에서도 미리 검증해 서버 왕복을 줄인다.
    (v) => !!v.source_account_id !== !!v.source_card_id,
    { message: 'source_account_id와 source_card_id 중 정확히 하나만 지정해야 합니다 (XOR)' },
  );
