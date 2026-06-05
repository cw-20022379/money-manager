import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { krw } from '../lib/format.js';
import { DraftResumeBanner } from '../features/DraftResumeModal.js';

interface Me {
  authenticated: boolean;
  user_id?: string;
  email?: string;
  membership?: { family_id: string; display_name: string; role: string } | null;
}

interface GraphSummary {
  summary: {
    fixed_sum: number; active_count: number; draft_count: number;
    upcoming: Array<{ id: string; merchant_name: string; amount_krw: number | null; due_date: string; diff_days: number }>;
  };
  tree: Array<{
    nickname: string; institution_name: string; monthly_sum: number;
    cards: Array<{ product_name: string; monthly_sum: number }>;
  }>;
}

export function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [g, setG] = useState<GraphSummary | null>(null);
  const [invite, setInvite] = useState<{ token: string } | null>(null);

  async function refresh() {
    try {
      const meRes = await api<Me>('/api/me');
      setMe(meRes);
      const gRes = await api<GraphSummary>('/api/graph');
      setG(gRes);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('ffn:data-changed', handler);
    return () => window.removeEventListener('ffn:data-changed', handler);
  }, []);

  async function createInvite() {
    const res = await api<{ token: string; expires_in_days: number }>(
      '/api/families/invite', { method: 'POST', body: '{}' });
    setInvite(res);
  }

  const empty = !g || (g.tree.length === 0 && g.summary.active_count === 0);

  return (
    <div className="space-y-3 p-4 pb-24">
      <DraftResumeBanner />

      {/* 인사 헤더 */}
      <div className="pb-1 pt-2">
        <p className="text-sm text-dim">안녕하세요</p>
        <h1 className="text-2xl font-bold tracking-tight text-body">
          {me?.membership?.display_name ?? '...'} 님 👋
        </h1>
      </div>

      {/* 이번달 빠질 돈 (P5: payment_flows SUM) */}
      <section className="rounded-2xl border border-line bg-bg p-5">
        <h2 className="mb-1 text-xs font-medium text-dim">이번달 빠질 돈</h2>
        <div className="text-[2rem] font-bold tracking-tight text-teal">
          {krw(g?.summary.fixed_sum ?? 0)}
        </div>
        <div className="mt-1 text-xs text-dim">
          활성 {g?.summary.active_count ?? 0}건
          {g && g.summary.draft_count > 0 && (
            <span className="ml-1.5 rounded-full bg-[#fff3e0] px-2 py-0.5 text-[10px] font-medium text-warn">
              초안 {g.summary.draft_count}건
            </span>
          )}
        </div>
      </section>

      {/* 다음 3일 안에 */}
      {g && g.summary.upcoming.length > 0 && (
        <section className="rounded-2xl border border-line bg-bg p-5">
          <h2 className="mb-3 text-xs font-medium text-dim">다음 3일 안에 빠질 돈</h2>
          <div className="space-y-2.5">
            {g.summary.upcoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#fff3e0] px-2 py-0.5 text-[10px] font-bold text-warn">
                    {u.diff_days === 0 ? '오늘' : `D-${u.diff_days}`}
                  </span>
                  <span className="text-sm font-medium text-body">{u.merchant_name}</span>
                </div>
                <span className="text-sm font-semibold text-body">{krw(u.amount_krw)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 한눈에 보기 */}
      {g && g.tree.length > 0 && (
        <section className="rounded-2xl border border-line bg-bg p-5">
          <h2 className="mb-3 text-xs font-medium text-dim">계좌별 월 지출</h2>
          <div className="space-y-3">
            {g.tree.slice(0, 3).map((acc) => (
              <div key={acc.institution_name + acc.nickname}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-body">
                    🏦 {acc.institution_name} · {acc.nickname}
                  </span>
                  <span className="text-sm font-bold text-teal">{krw(acc.monthly_sum)}</span>
                </div>
                {acc.cards.slice(0, 2).map((c) => (
                  <div key={c.product_name} className="ml-4 mt-1 flex justify-between text-xs text-dim">
                    <span>└ 💳 {c.product_name}</span>
                    <span>{krw(c.monthly_sum)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 배우자 초대 */}
      <section className="rounded-2xl border border-line bg-bg p-5">
        <h2 className="mb-3 text-xs font-medium text-dim">배우자 초대</h2>
        {invite ? (
          <div className="space-y-2">
            <div className="break-all rounded-xl bg-panel2 p-3 font-mono text-xs text-body">
              {invite.token}
            </div>
            <p className="text-xs text-dim">배우자에게 위 토큰을 전달하세요 (7일 유효).</p>
          </div>
        ) : (
          <button
            onClick={createInvite}
            className="w-full rounded-xl bg-teal py-3 text-sm font-bold text-white transition-opacity active:opacity-80"
          >
            초대 토큰 만들기
          </button>
        )}
      </section>

      {empty && (
        <section className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
          <div className="mb-1 text-base font-bold text-body">아직 비어있어요</div>
          <p className="text-sm text-dim">
            <a href="/list" className="font-medium text-teal underline">목록 탭</a>에서
            계좌·카드·정기지출을 등록하면 흐름도가 채워져요.
          </p>
        </section>
      )}
    </div>
  );
}
