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

  const displayName = me?.membership?.display_name ?? '...';

  return (
    <div className="min-h-screen bg-bg">
      {/* 상단 헤더 */}
      <header className="bg-panel px-5 pt-6 pb-4 shadow-[0_1px_0_#ececec]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-dim">안녕하세요 👋</p>
            <h1 className="text-xl font-bold text-kakao-dark">
              {displayName}님,<br />
              <span className="text-base font-medium text-navy">이번달도 화이팅!</span>
            </h1>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-kakao text-xl shadow-kakao">
            💛
          </div>
        </div>
      </header>

      <div className="space-y-3 p-4 pb-24">
        <DraftResumeBanner />

        {/* 이번달 빠질 돈 — 카카오 옐로우 메인 카드 */}
        <section className="kb-card-yellow">
          <p className="mb-1 text-xs font-semibold text-kakao-dark/60">이번달 빠질 돈</p>
          <div className="text-3xl font-bold text-kakao-dark">{krw(g?.summary.fixed_sum ?? 0)}</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-medium text-kakao-dark/70">
            <span className="rounded-full bg-kakao-dark/10 px-2.5 py-0.5">
              {g?.summary.active_count ?? 0}건 확정
            </span>
            {g && g.summary.draft_count > 0 && (
              <span className="rounded-full bg-kakao-dark/10 px-2.5 py-0.5">
                초안 {g.summary.draft_count}건
              </span>
            )}
          </div>
          <p className="mt-3 text-[11px] text-kakao-dark/50">매달 정해진 지출, 미리 파악하면 든든해요 ✨</p>
        </section>

        {/* 다음 3일 안에 */}
        {g && g.summary.upcoming.length > 0 && (
          <section className="kb-card">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-kakao-dark">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-kakao text-xs">⏰</span>
              곧 빠질 돈
            </h2>
            <div className="space-y-2">
              {g.summary.upcoming.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-kakao px-2 py-0.5 text-[11px] font-bold text-kakao-dark">
                      {u.diff_days === 0 ? '오늘' : `D-${u.diff_days}`}
                    </span>
                    <span className="text-sm font-medium text-kakao-dark">{u.merchant_name}</span>
                  </div>
                  <span className="text-sm font-semibold text-navy">{krw(u.amount_krw)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 한눈에 보기 */}
        {g && g.tree.length > 0 && (
          <section className="kb-card">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-kakao-dark">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-kakao text-xs">💡</span>
              한눈에 보기
            </h2>
            <div className="space-y-2">
              {g.tree.slice(0, 3).map((acc) => (
                <div key={acc.institution_name + acc.nickname} className="rounded-2xl bg-bg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-kakao-dark">🏦 {acc.nickname}</span>
                    <span className="text-sm font-bold text-navy">매월 {krw(acc.monthly_sum)}</span>
                  </div>
                  {acc.cards.slice(0, 2).map((c) => (
                    <div key={c.product_name} className="mt-1 flex items-center justify-between pl-4">
                      <span className="text-xs text-dim">└ 💳 {c.product_name}</span>
                      <span className="text-xs text-dim">{krw(c.monthly_sum)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 배우자 초대 */}
        <section className="kb-card">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-kakao-dark">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-kakao text-xs">🤝</span>
            배우자 초대
          </h2>
          {invite ? (
            <div className="space-y-3">
              <div className="break-all rounded-2xl bg-bg p-3 font-mono text-xs text-navy">{invite.token}</div>
              <p className="text-xs text-dim">배우자에게 위 토큰을 전달하세요 (7일 유효)</p>
            </div>
          ) : (
            <button
              onClick={createInvite}
              className="kb-btn w-full text-center"
            >초대 토큰 만들기</button>
          )}
        </section>

        {empty && (
          <section className="rounded-3xl border-2 border-dashed border-line bg-panel p-6 text-center">
            <div className="mb-2 text-3xl">💛</div>
            <div className="text-sm font-bold text-kakao-dark">아직 비어있어요</div>
            <p className="mt-1.5 text-xs text-dim">
              <a href="/list" className="font-semibold text-navy underline">목록 탭</a>에서
              계좌·카드·정기지출을 등록하면<br />흐름도가 채워져요.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
