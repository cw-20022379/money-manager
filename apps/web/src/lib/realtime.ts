/**
 * lib/realtime.ts — Supabase Realtime 구독 유틸
 *
 * 두 채널을 분리한 이유:
 *   - lifecycle_events: 배우자 알림 전용. notify_spouse=true + 본인 제외 필터링.
 *   - payment_flows/accounts/cards: 테이블 변경 전부를 감지해 ffn:data-changed 이벤트 발행.
 *     App.tsx가 이 이벤트를 받아 전파하고, 각 페이지가 자체 refetch 한다.
 *
 * 반환값은 unsubscribe 함수 → useEffect cleanup에서 호출하면 된다.
 */
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
 *
 * 필터를 두 가지로 적용하는 이유:
 *   1) family_id 필터: Supabase가 서버 단에서 필터링해 불필요한 메시지를 줄임.
 *   2) actor_user_id 비교: 본인이 만든 변경은 이미 UI에 반영됐으므로 토스트 중복 방지.
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
 * payment_flows / accounts / cards 변경을 구독해 UI 자동 갱신을 트리거한다.
 *
 * App.tsx에서 이 구독을 받아 ffn:data-changed 커스텀 이벤트를 발행한다.
 * 각 페이지(List, Home, Flow 등)는 이 이벤트를 listen하다가 자체 refetch 한다.
 * → prop drilling·전역 store 없이 느슨한 데이터 동기화 달성.
 *
 * 세 테이블을 하나의 채널에 묶는 이유: 채널 수를 줄여 연결 비용 최소화.
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
