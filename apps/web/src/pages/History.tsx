import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.js';
import { krw } from '../lib/format.js';

interface Event {
  id: number;
  subject_kind: 'ACCOUNT' | 'CARD' | 'FLOW';
  subject_id: string;
  event_type: 'CREATED' | 'UPDATED' | 'TERMINATED' | 'NOTE' | 'REVERTED' | 'RECLASSIFIED';
  reason_code: 'LIFE_EVENT' | 'CORRECTION';
  actor_user_id: string;
  notify_spouse: boolean;
  occurred_at: string;
  note: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
}

interface Member { user_id: string; display_name: string }

const SUBJECT_LABEL: Record<Event['subject_kind'], string> = {
  ACCOUNT: '계좌', CARD: '카드', FLOW: '정기지출',
};
const EVENT_LABEL: Record<Event['event_type'], string> = {
  CREATED: '등록', UPDATED: '수정', TERMINATED: '해지',
  NOTE: '메모', REVERTED: '되돌림', RECLASSIFIED: '재분류',
};
const EVENT_ICON: Record<Event['event_type'], string> = {
  CREATED: '➕', UPDATED: '📝', TERMINATED: '🚪',
  NOTE: '💬', REVERTED: '↩️', RECLASSIFIED: '🏷️',
};

export function History() {
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const toast = useToast();

  const load = useCallback(async () => {
    const [h, me] = await Promise.all([
      api<{ items: Event[] }>('/api/history?limit=100'),
      api<{ membership: Member | null }>('/api/me'),
    ]);
    setEvents(h.items);
    if (me.membership) setMembers([me.membership]); // v0.1.1: 본인 정보만. members 목록 API는 v0.2.
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('ffn:data-changed', handler);
    return () => window.removeEventListener('ffn:data-changed', handler);
  }, [load]);

  function nameOf(uid: string) {
    return members.find((m) => m.user_id === uid)?.display_name ?? '가족 멤버';
  }

  async function revert(ev: Event) {
    try {
      await api(`/api/history/${ev.id}/revert`, { method: 'POST', body: '{}' });
      toast.push('되돌림 완료');
      load();
    } catch (e: unknown) {
      const detail = (e as { detail?: { error?: string } }).detail;
      const msg = detail?.error === 'TOO_OLD' ? '7일이 지나 되돌릴 수 없어요'
        : detail?.error === 'ONLY_UPDATE_REVERTABLE' ? '수정 이벤트만 되돌릴 수 있어요'
        : JSON.stringify(detail ?? e);
      toast.push(`되돌리기 실패: ${msg}`, 'warn');
    }
  }

  // 날짜별 그룹핑
  const grouped = events.reduce<Record<string, Event[]>>((acc, ev) => {
    const day = ev.occurred_at.slice(0, 10);
    (acc[day] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <div className="space-y-3 p-4 pb-24">
      <h1 className="text-xl text-teal">📜 변경 기록</h1>
      {events.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-panel/40 p-6 text-center text-sm text-dim">
          아직 기록이 없어요. <br />등록·수정·해지를 하면 여기 쌓입니다.
        </div>
      )}
      {Object.entries(grouped).map(([day, list]) => (
        <section key={day}>
          <div className="mb-2 text-xs text-dim">── {day} ──</div>
          <div className="space-y-2">
            {list.map((ev) => {
              const ageMs = Date.now() - new Date(ev.occurred_at).getTime();
              const canRevert = ev.event_type === 'UPDATED' && ageMs < 7 * 24 * 3600_000;
              return (
                <div key={ev.id} className="rounded-xl border border-line bg-panel p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span>{EVENT_ICON[ev.event_type]}</span>
                      <span className="font-semibold">
                        {SUBJECT_LABEL[ev.subject_kind]} {EVENT_LABEL[ev.event_type]}
                      </span>
                      {ev.notify_spouse && (
                        <span className="rounded bg-teal/20 px-1.5 text-[10px] text-teal">알림 발송됨</span>
                      )}
                    </div>
                    <span className="text-xs text-dim">{ev.occurred_at.slice(11, 16)}</span>
                  </div>
                  <div className="mt-1 text-xs text-dim">
                    {nameOf(ev.actor_user_id)}
                    {ev.note && <span> · "{ev.note}"</span>}
                  </div>
                  <Diff before={ev.before_state} after={ev.after_state} />
                  {canRevert && (
                    <button
                      onClick={() => revert(ev)}
                      className="mt-2 rounded-md border border-line px-2 py-1 text-xs text-dim hover:border-teal hover:text-teal"
                    >↩️ 되돌리기</button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before || !after) {
    // CREATED는 after만, TERMINATED는 before만
    if (after) return <Pretty obj={after} label="등록 내용" />;
    if (before) return <Pretty obj={before} label="해지 직전" />;
    return null;
  }
  // 변경된 필드만
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: Array<[string, unknown, unknown]> = [];
  for (const k of keys) {
    if (['id', 'family_id', 'version', 'created_at', 'updated_at', 'deleted_at'].includes(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      diffs.push([k, before[k], after[k]]);
    }
  }
  if (diffs.length === 0) return null;
  return (
    <div className="mt-2 space-y-0.5 rounded bg-panel2 p-2 text-xs">
      {diffs.map(([k, b, a]) => (
        <div key={k} className="flex gap-2">
          <span className="w-32 text-dim">{labelOf(k)}</span>
          <span className="flex-1">
            <span className="text-bad">{fmt(k, b)}</span> → <span className="text-ok">{fmt(k, a)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Pretty({ obj, label }: { obj: Record<string, unknown>; label: string }) {
  const display = ['merchant_name', 'nickname', 'product_name', 'institution_name', 'issuer_name', 'amount_krw', 'schedule_day']
    .filter((k) => k in obj && obj[k] != null);
  if (display.length === 0) return null;
  return (
    <div className="mt-2 rounded bg-panel2 p-2 text-xs">
      <div className="mb-1 text-dim">{label}</div>
      {display.map((k) => (
        <div key={k} className="flex gap-2">
          <span className="w-24 text-dim">{labelOf(k)}</span>
          <span>{fmt(k, obj[k])}</span>
        </div>
      ))}
    </div>
  );
}

function labelOf(k: string): string {
  const map: Record<string, string> = {
    amount_krw: '금액', merchant_name: '대상', nickname: '별명',
    schedule_day: '결제일', category: '분류', notes: '메모',
    is_draft: '초안', institution_name: '은행', issuer_name: '카드사',
    product_name: '상품명', balance_krw: '잔액', payment_due_day: '결제일',
    billing_account_id: '결제계좌', source_card_id: '결제 카드', source_account_id: '출금 계좌',
    account_type: '계좌 종류', card_type: '카드 종류', account_number_masked: '계좌번호',
    card_number_masked: '카드번호', flow_kind: '결제 방식', status: '상태',
  };
  return map[k] ?? k;
}

function fmt(k: string, v: unknown): string {
  if (v == null) return '-';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (k.endsWith('_krw') && typeof v === 'number') return krw(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
