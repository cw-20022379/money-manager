/**
 * services/lifecycle.ts — 변경 이력 append-only 기록 서비스
 *
 * 역할: 모든 데이터 변경(생성·수정·삭제·되돌리기)을 lifecycle_events 테이블에 기록한다.
 *
 * ★ Append-only 설계 이유:
 *   lifecycle_events는 RLS로 UPDATE/DELETE를 차단해 증거를 보존한다.
 *   부부가 서로의 수정 이력을 확인할 수 있어야 하고, 관리자도 임의 삭제할 수 없다.
 *   "되돌리기"도 원본을 지우지 않고 REVERTED 이벤트를 새로 append하는 방식.
 *
 * notify_spouse 결정 로직:
 *   아래 두 조건 중 하나라도 참이면 배우자에게 Web Push를 보낸다.
 *   1. reason_code === 'LIFE_EVENT' → 의도적 변경이므로 가족이 알아야 함.
 *   2. owner ≠ actor → 내 항목이 아닌 다른 사람 항목을 건드렸으므로 알림.
 *      (예: 아내 담당인 넷플릭스를 남편이 수정하면 아내에게 알림)
 *   owner가 null(공동 소유)이면 조건 2는 false → LIFE_EVENT 여부로만 판단.
 *
 * SUBJECT_LABEL:
 *   Web Push 본문에 한국어로 표시할 주어를 정의한다.
 *   ("계좌을(를) 변경했어요", "정기지출을(를) 해지했어요" 등)
 *   UI 표현과 서비스 코드를 분리하기 위해 여기서 중앙 관리.
 *
 * best-effort push:
 *   알림 발송 실패가 데이터 저장을 rollback해서는 안 된다.
 *   void + pushToFamilyExceptActor 내부 try/catch로 오류를 흡수한다.
 */
import { supabaseAdmin } from '../db.js';
import { pushToFamilyExceptActor } from './push.js';

export type SubjectKind = 'ACCOUNT' | 'CARD' | 'FLOW';
export type EventType =
  | 'CREATED'
  | 'UPDATED'
  | 'TERMINATED'
  | 'NOTE'
  | 'REVERTED'
  | 'RECLASSIFIED';
export type ReasonCode = 'LIFE_EVENT' | 'CORRECTION';

export interface InsertLifecycleParams {
  family_id: string;
  subject_kind: SubjectKind;
  subject_id: string;
  event_type: EventType;
  reason_code: ReasonCode;
  actor_user_id: string;
  before_state?: unknown;
  after_state?: unknown;
  note?: string;
  notify_spouse?: boolean;
}

// 푸시 알림 본문에 쓸 한국어 주어 레이블
// UI와 API 코드를 분리하기 위해 서비스 레이어에서 중앙 관리한다.
const SUBJECT_LABEL: Record<SubjectKind, string> = {
  ACCOUNT: '계좌', CARD: '카드', FLOW: '정기지출',
};
const EVENT_VERB: Record<EventType, string> = {
  CREATED: '등록했어요', UPDATED: '변경했어요', TERMINATED: '해지했어요',
  NOTE: '메모를 남겼어요', REVERTED: '되돌렸어요', RECLASSIFIED: '재분류했어요',
};

/**
 * 변경 기록 append-only 인서트.
 * RLS는 service_role이 우회. family_id + actor_user_id는 강제 주입.
 *
 * notify_spouse 결정:
 *  · reason_code === 'LIFE_EVENT' → true
 *  · owner ≠ actor (Soft ownership) → true
 *
 * notify_spouse=true면 Web Push 비동기 전송 (실패해도 throw 안 함).
 *
 * @param params 이벤트 데이터
 * @param ownerUserId 변경 대상의 소유자 user_id (soft ownership). null=공동 소유.
 */
export async function insertLifecycleEvent(
  params: InsertLifecycleParams,
  ownerUserId?: string | null,
): Promise<void> {
  // notify_spouse를 명시적으로 넘기면 그대로 사용.
  // 미지정이면 LIFE_EVENT이거나 owner≠actor인 경우에 알림.
  const notify =
    params.notify_spouse ??
    (params.reason_code === 'LIFE_EVENT' ||
      (ownerUserId != null && ownerUserId !== params.actor_user_id));

  const { error } = await supabaseAdmin.from('lifecycle_events').insert({
    family_id: params.family_id,
    subject_kind: params.subject_kind,
    subject_id: params.subject_id,
    event_type: params.event_type,
    reason_code: params.reason_code,
    actor_user_id: params.actor_user_id,
    before_state: params.before_state ?? null,
    after_state: params.after_state ?? null,
    note: params.note ?? null,
    notify_spouse: notify,
  });
  if (error) throw new Error(`lifecycle insert failed: ${error.message}`);

  if (notify) {
    // 비동기, 실패해도 무시 (best-effort)
    // 푸시 실패가 데이터 저장 결과에 영향 주어서는 안 된다.
    void pushToFamilyExceptActor(
      params.family_id,
      params.actor_user_id,
      {
        title: '🔔 우리 가족 금융',
        body: `${SUBJECT_LABEL[params.subject_kind]}을(를) ${EVENT_VERB[params.event_type]}${params.note ? ` · "${params.note}"` : ''}`,
        url: '/history',
        // 같은 항목의 연속 알림을 묶어주는 tag (Service Worker의 notification.tag)
        tag: `lifecycle-${params.subject_id}`,
      },
    );
  }
}
