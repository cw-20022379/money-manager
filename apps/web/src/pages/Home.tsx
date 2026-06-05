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
    <div className="p-4 pb-24 max-w-[700px] mx-auto">
      <DraftResumeBanner />

      {/* 페이지 헤더 */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold text-[#37352f] leading-snug">
          안녕하세요, {me?.membership?.display_name ?? '...'}님 👋
        </h1>
        <p className="text-[13px] text-[#787774] mt-0.5">우리 가족 금융 내비게이터</p>
      </div>

      {/* 이번달 빠질 돈 */}
      <section className="mb-4 rounded-md border border-line p-4 hover:bg-[#f7f6f3] transition-colors">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-[#787774] mb-1">📅 이번달 빠질 돈</div>
            <div className="text-[26px] font-semibold text-[#37352f] leading-none">
              {krw(g?.summary.fixed_sum ?? 0)}
            </div>
            <div className="text-[12px] text-[#9b9a97] mt-1">
              {g?.summary.active_count ?? 0}건 활성
              {g && g.summary.draft_count > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] badge-orange">
                  초안 {g.summary.draft_count}건
                </span>
              )}
            </div>
          </div>
          <span className="text-2xl">💰</span>
        </div>
      </section>

      {/* 다음 3일 안에 */}
      {g && g.summary.upcoming.length > 0 && (
        <section className="mb-4">
          <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-2 px-1">
            ⏰ 다가오는 결제
          </div>
          <div className="rounded-md border border-line divide-y divide-line">
            {g.summary.upcoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-[#f7f6f3] transition-colors">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-10 text-[11px] font-medium text-bad text-center">
                    {u.diff_days === 0 ? '오늘' : `D-${u.diff_days}`}
                  </span>
                  <span className="text-sm text-[#37352f]">{u.merchant_name}</span>
                </div>
                <span className="text-sm text-[#787774]">{krw(u.amount_krw)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 한눈에 보기 */}
      {g && g.tree.length > 0 && (
        <section className="mb-4">
          <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-2 px-1">
            💡 한눈에 보기
          </div>
          <div className="rounded-md border border-line divide-y divide-line">
            {g.tree.slice(0, 3).map((acc) => (
              <div key={acc.institution_name + acc.nickname}>
                <div className="flex items-center justify-between px-3 py-2.5 hover:bg-[#f7f6f3] transition-colors">
                  <span className="text-sm text-[#37352f]">🏦 {acc.nickname}</span>
                  <span className="text-[12px] text-[#787774]">매월 {krw(acc.monthly_sum)}</span>
                </div>
                {acc.cards.slice(0, 2).map((c) => (
                  <div key={c.product_name} className="flex items-center justify-between pl-8 pr-3 py-1.5 bg-[#f7f6f3]">
                    <span className="text-[12px] text-[#787774]">└ 💳 {c.product_name}</span>
                    <span className="text-[12px] text-[#9b9a97]">{krw(c.monthly_sum)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 배우자 초대 */}
      <section className="mb-4 rounded-md border border-line p-4">
        <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-3">
          🤝 배우자 초대
        </div>
        {invite ? (
          <div className="space-y-2">
            <div className="break-all rounded border border-line bg-[#f7f6f3] p-2.5 font-mono text-xs text-[#37352f]">
              {invite.token}
            </div>
            <p className="text-[12px] text-[#787774]">배우자에게 위 토큰을 전달하세요 (7일 유효).</p>
          </div>
        ) : (
          <button
            onClick={createInvite}
            className="text-[13px] text-teal hover:bg-[#dbeafe] hover:bg-opacity-40 px-2 py-1 rounded transition-colors -mx-2"
          >
            + 초대 토큰 만들기
          </button>
        )}
      </section>

      {/* 빈 상태 */}
      {empty && (
        <div className="rounded-md border border-dashed border-line p-6 text-center">
          <div className="text-3xl mb-3">📭</div>
          <div className="text-sm font-medium text-[#37352f] mb-1">아직 비어있어요</div>
          <p className="text-[12px] text-[#787774]">
            <a href="/list" className="text-teal hover:underline">목록 탭</a>에서
            계좌·카드·정기지출을 등록하면 흐름도가 채워져요.
          </p>
        </div>
      )}
    </div>
  );
}
