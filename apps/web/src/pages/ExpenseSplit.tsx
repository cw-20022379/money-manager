import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { krw } from '../lib/format.js';
import { CATEGORY_LABEL, type Category } from '@ffn/shared';

interface Member { user_id: string; display_name: string; is_me: boolean }
interface SplitFlow {
  id: string;
  merchant_name: string;
  category: Category;
  amount_krw: number | null;
  is_draft: boolean;
  owner_user_id: string | null;
}

const PALETTE = ['#00d2c4', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
function colorFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function ExpenseSplit() {
  const [members, setMembers] = useState<Member[]>([]);
  const [flows, setFlows] = useState<SplitFlow[] | null>(null);

  useEffect(() => {
    const load = () => {
      api<{ members: Member[] }>('/api/families/members').then((r) => setMembers(r.members)).catch(() => setMembers([]));
      api<{ items: SplitFlow[] }>('/api/flows?status=ACTIVE').then((r) => setFlows(r.items)).catch(() => setFlows([]));
    };
    load();
    window.addEventListener('ffn:data-changed', load);
    return () => window.removeEventListener('ffn:data-changed', load);
  }, []);

  const { totals, grand, realFlows } = useMemo(() => {
    const totals: Record<string, number> = {};
    members.forEach((m) => { totals[m.user_id] = 0; });
    const memberIds = new Set(members.map((m) => m.user_id));
    const realFlows = (flows ?? []).filter((f) => !f.is_draft && f.amount_krw != null);
    let grand = 0;
    for (const f of realFlows) {
      const amt = f.amount_krw ?? 0;
      grand += amt;
      if (f.owner_user_id && memberIds.has(f.owner_user_id)) {
        totals[f.owner_user_id]! += amt;
      } else {
        // 공동 — 멤버 균등 분배
        const share = members.length ? amt / members.length : 0;
        members.forEach((m) => { totals[m.user_id]! += share; });
      }
    }
    return { totals, grand, realFlows };
  }, [flows, members]);

  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.user_id === id)?.display_name ?? '구성원') : null;

  return (
    <div className="space-y-3 p-4 pb-24" style={{ background: '#f8fafc', minHeight: '100%' }}>
      <header className="pt-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-dim">가족</p>
        <h1 className="text-[20px] font-bold text-body" style={{ letterSpacing: '-0.03em' }}>지출 분담</h1>
      </header>

      {flows == null && <div className="py-4 text-[13px] text-dim">불러오는 중...</div>}

      {flows != null && (
        <>
          {/* 전체 분담 합계 + 비율 바 */}
          <section className="bs-card p-4">
            <div className="text-xs text-dim">이번달 고정지출 합계</div>
            <div className="num mt-0.5 text-2xl font-bold text-body">{krw(grand)}</div>

            {grand > 0 && (
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-panel2">
                {members.map((m) => {
                  const pct = (totals[m.user_id]! / grand) * 100;
                  if (pct <= 0) return null;
                  return <div key={m.user_id} style={{ width: `${pct}%`, background: colorFor(m.user_id) }} />;
                })}
              </div>
            )}

            <div className="mt-3 space-y-2">
              {members.map((m) => {
                const amt = totals[m.user_id]!;
                const pct = grand > 0 ? Math.round((amt / grand) * 100) : 0;
                return (
                  <div key={m.user_id} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorFor(m.user_id) }} />
                    <span className="flex-1 text-sm text-body">
                      {m.display_name}{m.is_me ? ' (나)' : ''}
                    </span>
                    <span className="num text-sm font-semibold text-body">{krw(Math.round(amt))}</span>
                    <span className="num w-10 text-right text-xs text-dim">{pct}%</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-dim">공동 지출은 구성원 수만큼 똑같이 나눠 계산해요.</p>
          </section>

          {/* 항목별 분담 */}
          <section className="bs-card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-xs font-semibold text-dim">항목별 부담</div>
            {realFlows.length === 0 ? (
              <div className="px-4 py-4 text-center text-sm text-dim">집계할 정기지출이 없어요.</div>
            ) : (
              <ul>
                {[...realFlows].sort((a, b) => (b.amount_krw ?? 0) - (a.amount_krw ?? 0)).map((f) => {
                  const owner = memberName(f.owner_user_id);
                  return (
                    <li key={f.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 last:border-0">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-body">{f.merchant_name}</div>
                        <div className="text-[11px] text-dim">{CATEGORY_LABEL[f.category]}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {owner
                          ? <span className="rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: colorFor(f.owner_user_id!) }}>{owner}</span>
                          : <span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-dim">👫 공동</span>}
                        <span className="num text-sm text-body">{krw(f.amount_krw)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
