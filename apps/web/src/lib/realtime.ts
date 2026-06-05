import { supabase } from './supabase.js';

export interface LifecycleEventRow {
  id: number;
  family_id: string;
  subject_kind: 'ACCOUNT' | 'CARD' | 'FLOW';
  subject_id: string;
  event_type: string;
  reason_code: 'LIFE_EVENT' | 'CORRECTION';
  actor_user_id: string;
  notify_spouse: boolean;
  occurred_at: string;
  note: string | null;
  before_state: unknown;
  after_state: unknown;
}

/**
 * lifecycle_events INSERT를 구독.
 * 본인이 아닌 멤버가 만든, notify_spouse=true 이벤트만 callback 호출.
 */
export function subscribeLifecycle(
  familyId: string,
  myUserId: string,
  onEvent: (ev: LifecycleEventRow) => void,
) {
  const channel = supabase
    .channel(`family:${familyId}:lifecycle`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'lifecycle_events',
        filter: `family_id=eq.${familyId}`,
      },
      (payload) => {
        const ev = payload.new as LifecycleEventRow;
        if (ev.actor_user_id === myUserId) return; // 본인 변경은 무시
        if (!ev.notify_spouse) return;
        onEvent(ev);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * payment_flows / accounts / cards 변경도 같은 채널로 구독 (목록 자동 갱신용).
 */
export function subscribeFamilyData(
  familyId: string,
  onChange: (table: string, op: string) => void,
) {
  const channel = supabase
    .channel(`family:${familyId}:data`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_flows', filter: `family_id=eq.${familyId}` },
      (p) => onChange('payment_flows', p.eventType))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `family_id=eq.${familyId}` },
      (p) => onChange('accounts', p.eventType))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `family_id=eq.${familyId}` },
      (p) => onChange('cards', p.eventType))
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
