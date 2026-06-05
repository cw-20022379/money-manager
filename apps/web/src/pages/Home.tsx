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
      <h1 className="text-xl">
        안녕하세요, <span className="text-teal">{me?.membership?.display_name ?? '...'}님</span> 👋
      </h1>

      {/* 이번달 빠질 돈 (P5: payment_flows SUM) */}
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="mb-1 text-xs text-dim">📅 이번달 빠질 돈</h2>
        <div className="text-2xl font-bold text-teal">{krw(g?.summary.fixed_sum ?? 0)}</div>
        <div className="text-xs text-dim">
          {g?.summary.active_count ?? 0}건
          {g && g.summary.draft_count > 0 && ` + 초안 ${g.summary.draft_count}`}
        </div>
      </section>

      {/* 다음 3일 안에 */}
      {g && g.summary.upcoming.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="mb-2 text-xs text-dim">⏰ 다음 3일 안에</h2>
          <div className="space-y-1 text-sm">
            {g.summary.upcoming.map((u) => (
              <div key={u.id} className="flex justify-between">
                <span>
                  {u.diff_days === 0 ? '오늘' : `D-${u.diff_days}`} {u.merchant_name}
                </span>
                <span className="text-dim">{krw(u.amount_krw)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 한눈에 보기 - 정적 인포그래픽 (P5 합의 - v0.1에서 흐름 약속 유지) */}
      {g && g.tree.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="mb-2 text-xs text-dim">💡 한눈에 보기</h2>
          <div className="space-y-1 text-sm">
            {g.tree.slice(0, 3).map((acc) => (
              <div key={acc.institution_name + acc.nickname}>
                🏦 {acc.nickname} <span className="text-dim">매월 {krw(acc.monthly_sum)}</span>
                {acc.cards.slice(0, 2).map((c) => (
                  <div key={c.product_name} className="ml-4 text-xs text-dim">
                    └ 💳 {c.product_name} ({krw(c.monthly_sum)})
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 배우자 초대 */}
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="mb-2 text-xs text-dim">🤝 배우자 초대</h2>
        {invite ? (
          <div className="space-y-2 text-sm">
            <div className="break-all rounded bg-panel2 p-2 font-mono text-xs">{invite.token}</div>
            <div className="text-xs text-dim">
              배우자에게 위 토큰을 전달하세요 (7일 유효).
            </div>
          </div>
        ) : (
          <button
            onClick={createInvite}
            className="rounded-md border border-teal px-3 py-1.5 text-sm text-teal"
          >초대 토큰 만들기</button>
        )}
      </section>

      {empty && (
        <section className="rounded-2xl border border-dashed border-line bg-panel/40 p-4 text-sm">
          <div className="text-teal">⚠️ 아직 비어있어요</div>
          <p className="mt-1 text-dim">
            <a href="/list" className="underline">목록 탭</a>에서
            계좌·카드·정기지출을 등록하면 흐름도가 채워져요.
          </p>
        </section>
      )}
    </div>
  );
}
