import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { krw, krwShort } from '../lib/format.js';
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

// 카테고리 색상 매핑 (뱅샐 팔레트)
const CAT_COLORS: Record<string, string> = {
  MEDIA: '#8b5cf6',
  COMMUNICATION: '#3b82f6',
  EDUCATION: '#f59e0b',
  INSURANCE: '#00d2c4',
  HOUSING: '#ef4444',
  FOOD: '#f97316',
  TRANSPORT: '#10b981',
  HEALTH: '#ec4899',
  OTHER: '#94a3b8',
};

const CAT_LABEL: Record<string, string> = {
  MEDIA: '미디어',
  COMMUNICATION: '통신',
  EDUCATION: '교육',
  INSURANCE: '보험',
  HOUSING: '주거',
  FOOD: '식비',
  TRANSPORT: '교통',
  HEALTH: '건강',
  OTHER: '기타',
};

// 도넛 차트 SVG 컴포넌트
function DonutChart({ segments }: {
  segments: Array<{ label: string; value: number; color: string; pct: number }>;
}) {
  const r = 44;
  const cx = 56;
  const cy = 56;
  const circumference = 2 * Math.PI * r;
  const gap = 2; // degrees gap between segments

  let currentAngle = -90; // start from top

  return (
    <svg width="112" height="112" viewBox="0 0 112 112">
      {/* 배경 링 */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />

      {segments.map((seg, i) => {
        const segAngle = (seg.pct / 100) * 360 - gap;
        const startRad = (currentAngle * Math.PI) / 180;
        const endRad = ((currentAngle + segAngle) * Math.PI) / 180;

        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);

        const largeArc = segAngle > 180 ? 1 : 0;
        const pathData = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;

        currentAngle += (seg.pct / 100) * 360;

        return (
          <path
            key={i}
            d={pathData}
            fill="none"
            stroke={seg.color}
            strokeWidth="12"
            strokeLinecap="round"
            className="donut-segment"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        );
      })}

      {/* 중앙 텍스트 */}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="Pretendard">
        이번달
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize="11" fill="#1c1f26" fontWeight="700" fontFamily="Pretendard">
        {segments.length}개 항목
      </text>
    </svg>
  );
}

// 미니 바 차트 (계좌별 월 지출)
function MiniBarChart({ items }: {
  items: Array<{ label: string; value: number; color?: string }>;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value));

  return (
    <div className="flex items-end gap-2 h-16">
      {items.map((item, i) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-full rounded-t-md bar-animate"
              style={{
                height: `${Math.max(pct * 0.48, 3)}px`,
                background: item.color ?? '#00d2c4',
                animationDelay: `${i * 0.08}s`,
              }}
            />
            <span className="text-[9px] text-dim2 truncate w-full text-center leading-none">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 카테고리 범례 아이템
function CatLegend({ color, label, pct, amount }: {
  color: string; label: string; pct: number; amount: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-[12px] text-dim truncate">{label}</span>
      <span className="text-[12px] font-semibold text-body tabular-nums">{pct}%</span>
      <span className="text-[11px] text-dim2 tabular-nums w-16 text-right">{krwShort(amount)}</span>
    </div>
  );
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
  const totalFixed = g?.summary.fixed_sum ?? 0;

  // 카테고리 집계 (preview mock flows 기반 — api에서 category가 오면 실제 데이터 사용)
  // preview.ts의 GRAPH.tree에서 flows를 뽑아 category별로 집계
  // 실제 데이터에서는 summary에 category가 없으므로 tree에서 집계
  const catData = (() => {
    if (!g) return [];
    // tree에서 direct_flows + card.children을 탐색
    const map = new Map<string, number>();
    for (const acc of (g as any).tree ?? []) {
      for (const flow of acc.direct_flows ?? []) {
        if (!flow.is_draft && flow.amount_krw) {
          const k = flow.category ?? 'OTHER';
          map.set(k, (map.get(k) ?? 0) + flow.amount_krw);
        }
      }
      for (const card of acc.cards ?? []) {
        for (const f of card.children ?? []) {
          if (!f.is_draft && f.amount_krw) {
            const k = f.category ?? 'OTHER';
            map.set(k, (map.get(k) ?? 0) + f.amount_krw);
          }
        }
      }
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => ({
        label: CAT_LABEL[cat] ?? cat,
        value: val,
        color: CAT_COLORS[cat] ?? '#94a3b8',
        pct: Math.round((val / total) * 100),
      }));
  })();

  // 계좌별 월 지출 (바 차트용)
  const accBarData = g?.tree
    .filter((a) => a.monthly_sum > 0)
    .map((a) => ({
      label: a.nickname,
      value: a.monthly_sum,
      color: '#00d2c4',
    })) ?? [];

  return (
    <div className="space-y-3 p-4 pb-24 fade-up" style={{ background: '#f8fafc', minHeight: '100%' }}>
      <DraftResumeBanner />

      {/* 헤더 인사 */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[12px] text-dim">우리 가족 금융 현황</p>
          <h1 className="text-[20px] font-bold text-body leading-tight" style={{ letterSpacing: '-0.03em' }}>
            {me?.membership?.display_name ?? '...'}님, <span style={{ color: '#00d2c4' }}>안녕하세요</span>
          </h1>
        </div>
        {/* 알림 아이콘 */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white shadow-card">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* 이번달 빠질 돈 — 메인 카드 */}
      <section className="rounded-xl bg-white border border-line shadow-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium text-dim uppercase tracking-wide">이번달 고정지출 합계</p>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className="text-[28px] font-bold tabular-nums"
                style={{ color: '#1c1f26', letterSpacing: '-0.04em' }}
              >
                {new Intl.NumberFormat('ko-KR').format(totalFixed)}
              </span>
              <span className="text-[13px] text-dim font-medium">원</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[11px] text-dim">
                활성 {g?.summary.active_count ?? 0}건
              </span>
              {g && g.summary.draft_count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: '#fef3c7', color: '#f59e0b' }}
                >
                  + 초안 {g.summary.draft_count}건
                </span>
              )}
            </div>
          </div>
          {/* 전월 대비 배지 (고정 mock) */}
          <div
            className="flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: '#f0fdf4', color: '#00d2c4' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            전월 대비 -3.2%
          </div>
        </div>

        {/* 진행 바 — 월 예산 대비 (mock: 80만원 기준) */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-dim">
            <span>월 예산 대비</span>
            <span>{Math.round((totalFixed / 800_000) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min((totalFixed / 800_000) * 100, 100)}%`,
                background: 'linear-gradient(90deg, #00d2c4, #0bbcb0)',
              }}
            />
          </div>
        </div>
      </section>

      {/* D-Day 알림 */}
      {g && g.summary.upcoming.length > 0 && (
        <section className="rounded-xl bg-white border border-line shadow-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{ background: '#fef3c7' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#f59e0b" strokeWidth="2"/>
                <path d="M12 7v5l3 3" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-[12px] font-semibold text-body">다가오는 결제</span>
          </div>
          <div className="space-y-2">
            {g.summary.upcoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                    style={{
                      background: u.diff_days === 0 ? '#fef2f2' : '#f0fdf4',
                      color: u.diff_days === 0 ? '#ef4444' : '#00d2c4',
                    }}
                  >
                    {u.diff_days === 0 ? '오늘' : `D-${u.diff_days}`}
                  </span>
                  <span className="text-[13px] text-body">{u.merchant_name}</span>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-body">
                  {krw(u.amount_krw)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 카테고리 분포 — 도넛 차트 */}
      {catData.length > 0 && (
        <section className="rounded-xl bg-white border border-line shadow-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-dim uppercase tracking-wide">카테고리 분포</p>
              <p className="text-[14px] font-bold text-body mt-0.5">지출 항목 분석</p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: '#f0fdf4', color: '#00d2c4' }}
            >
              이번달
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* 도넛 */}
            <div className="shrink-0">
              <DonutChart segments={catData} />
            </div>

            {/* 범례 */}
            <div className="flex-1 space-y-1.5">
              {catData.slice(0, 4).map((c, i) => (
                <CatLegend
                  key={i}
                  color={c.color}
                  label={c.label}
                  pct={c.pct}
                  amount={c.value}
                />
              ))}
              {catData.length > 4 && (
                <div className="text-[11px] text-dim pt-0.5">
                  + {catData.length - 4}개 항목 더보기
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 계좌별 지출 바 차트 */}
      {accBarData.length > 0 && (
        <section className="rounded-xl bg-white border border-line shadow-card p-4">
          <div className="mb-3">
            <p className="text-[11px] font-medium text-dim uppercase tracking-wide">계좌별 고정지출</p>
            <p className="text-[14px] font-bold text-body mt-0.5">이번달 출금 현황</p>
          </div>
          <MiniBarChart items={accBarData} />

          {/* 계좌 상세 */}
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            {g?.tree.map((acc) => (
              <div key={acc.nickname} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold"
                    style={{ background: '#f0fdf4', color: '#00d2c4' }}
                  >
                    {acc.institution_name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-body">{acc.nickname}</div>
                    <div className="text-[10px] text-dim">{acc.institution_name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-[13px] font-bold tabular-nums"
                    style={{ color: acc.monthly_sum > 0 ? '#1c1f26' : '#94a3b8' }}
                  >
                    {acc.monthly_sum > 0 ? krwShort(acc.monthly_sum) + '원' : '지출 없음'}
                  </div>
                  {acc.cards.length > 0 && (
                    <div className="text-[10px] text-dim">
                      카드 {acc.cards.length}장 포함
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 배우자 초대 */}
      <section className="rounded-xl bg-white border border-line shadow-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: '#f0f9ff' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-[12px] font-semibold text-body">가족 구성원 초대</span>
        </div>

        {invite ? (
          <div className="space-y-2">
            <div
              className="break-all rounded-xl p-3 font-mono text-[11px] text-body"
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
            >
              {invite.token}
            </div>
            <p className="text-[11px] text-dim">배우자에게 위 토큰을 전달하세요 (7일 유효).</p>
          </div>
        ) : (
          <button
            onClick={createInvite}
            className="w-full rounded-xl py-2.5 text-[13px] font-semibold transition-all duration-150"
            style={{ background: '#f0fdf4', color: '#00d2c4', border: '1px solid #bbf7d0' }}
          >
            초대 토큰 만들기
          </button>
        )}
      </section>

      {/* 빈 상태 */}
      {empty && (
        <section
          className="rounded-xl border border-dashed p-6 text-center text-sm"
          style={{ borderColor: '#00d2c4', background: '#f0fdf4' }}
        >
          <div className="mb-2 text-[24px]">📊</div>
          <div className="font-semibold text-body mb-1">아직 데이터가 없어요</div>
          <p className="text-[12px] text-dim">
            <a href="/list" className="underline" style={{ color: '#00d2c4' }}>목록 탭</a>에서
            계좌·카드·정기지출을 등록하면<br/>분석 차트가 채워져요.
          </p>
        </section>
      )}
    </div>
  );
}
