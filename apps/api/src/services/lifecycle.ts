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
 */
export async function insertLifecycleEvent(
  params: InsertLifecycleParams,
  ownerUserId?: string | null,
): Promise<void> {
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
    void pushToFamilyExceptActor(
      params.family_id,
      params.actor_user_id,
      {
        title: '🔔 우리 가족 금융',
        body: `${SUBJECT_LABEL[params.subject_kind]}을(를) ${EVENT_VERB[params.event_type]}${params.note ? ` · "${params.note}"` : ''}`,
        url: '/history',
        tag: `lifecycle-${params.subject_id}`,
      },
    );
  }
}
