import { supabaseAdmin } from '../db.js';

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

/**
 * 변경 기록(lifecycle_events) append-only 인서트.
 * RLS는 family_id + actor_user_id를 service_role이 우회하므로 강제 주입.
 *
 * notify_spouse는 다음 룰로 결정:
 *  · reason_code === 'LIFE_EVENT' → true
 *  · owner ≠ actor (Soft ownership P-합의) → true (강제 override)
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
}
