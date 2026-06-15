/**
 * pages/Flow.tsx — 자금 흐름도 (4가지 뷰)
 *
 * 뷰 종류:
 *   tree: 계좌 → 카드 → 정기지출 계층 구조. 가장 가볍고 기본 뷰.
 *   graph: react-flow 기반 인터랙티브 관계도. @xyflow/react가 무거우므로 지연 로드.
 *   calendar: 월 캘린더 그리드. /api/flows 추가 호출 필요. 선택 시에만 로드.
 *   billing: 카드별 결제일 기준 청구 묶음. 선택 시에만 로드.
 *
 * 뷰 퍼시스턴스:
 *   ffn:flow-view sessionStorage 키로 선택한 뷰를 기억.
 *   페이지 이동 후 돌아와도 같은 뷰 유지.
 *   ALLOWED 화이트리스트로 잘못된 값(직접 수정, 구버전 잔류 등) 방어.
 *
 * 데이터 로드:
 *   - /api/graph: tree·graph·billing 뷰의 공통 데이터. 항상 로드.
 *   - /api/flows: calendar 뷰 전용. calendar로 전환 시에만 fetch.
 *   - ffn:data-changed 이벤트 수신 시 양쪽 모두 재로드.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { krw, krwShort } from '../lib/format.js';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@ffn/shared';
import { type GraphData } from '../features/RelationshipGraph.js';
import { type CalFlow } from '../features/CashflowCalendar.js';

// @xyflow/react가 무거워 관계도 뷰는 선택 시에만 로드 (초기 번들에서 분리)
const RelationshipGraph = lazy(() =>
  import('../features/RelationshipGraph.js').then((m) => ({ default: m.RelationshipGraph })));
const CashflowCalendar = lazy(() =>
  import('../features/CashflowCalendar.js').then((m) => ({ default: m.CashflowCalendar })));
const BillingCycle = lazy(() =>
  import('../features/BillingCycle.js').then((m) => ({ default: m.BillingCycle })));

function ViewLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-[13px] text-dim">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-teal" />
      {label}
    </div>
  );
}

// GraphData 구조에서 개별 노드 타입을 추출. RelationshipGraph와 동일 타입을 재사용.
type FlowNode = GraphData['tree'][number]['cards'][number]['children'][number];
type CardNode = GraphData['tree'][number]['cards'][number];
type AccountNode = GraphData['tree'][number];

type View = 'tree' | 'graph' | 'calendar' | 'billing';
// sessionStorage에서 읽은 값을 신뢰하지 않고 화이트리스트로 검증한다.
// 이전 버전에서 저장된 값, 브라우저 개발자 도구로 수정한 값 등을 방어.
const ALLOWED: readonly View[] = ['tree', 'graph', 'calendar', 'billing'];

// 미니 인라인 바 (카드/계좌 지출 비율 표시)
function InlineBar({ value, max, color = '#00d2c4' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color, transition: 'width 0.5s ease' }}
      />
    </div>
  );
}

export function Flow() {
  const [data, setData] = useState<GraphData | null>(null);
  const [calFlows, setCalFlows] = useState<CalFlow[] | null>(null);
  // 초기 뷰: sessionStorage에서 복원. 없거나 유효하지 않으면 'tree'(기본).
  const [view, setView] = useState<View>(() => {
    const stored = sessionStorage.getItem('ffn:flow-view') as View | null;
    return stored && ALLOWED.includes(stored) ? stored : 'tree';
  });

  useEffect(() => {
    // /api/graph는 tree·graph·billing이 공통으로 사용하므로 항상 로드한다.
    const load = () => api<GraphData>('/api/graph').then(setData).catch(console.error);
    load();
    window.addEventListener('ffn:data-changed', load);
    return () => window.removeEventListener('ffn:data-changed', load);
  }, []);

  useEffect(() => {
    // calendar 뷰는 /api/flows 별도 호출이 필요하다 (모든 날짜별 스케줄 정보 필요).
    // 다른 뷰에서는 불필요하므로 calendar로 전환 시에만 fetch.
    if (view !== 'calendar') return;
    const load = () =>
      api<{ items: CalFlow[] }>('/api/flows?status=ACTIVE')
        .then((r) => setCalFlows(r.items))
        .catch(console.error);
    load();
    window.addEventListener('ffn:data-changed', load);
    return () => window.removeEventListener('ffn:data-changed', load);
  }, [view]);

  function changeView(v: View) {
    setView(v);
    // 뷰 선택을 sessionStorage에 저장해 페이지 이동 후 돌아와도 같은 뷰를 유지한다.
    sessionStorage.setItem('ffn:flow-view', v);
  }

  // InlineBar 최댓값 계산용: 전체 월 지출 합계 기준으로 각 계좌의 비율을 표시한다.
  const totalMonthly = data?.tree.reduce((s, a) => s + a.monthly_sum, 0) ?? 0;

  return (
    <div className="space-y-3 p-4 pb-24 fade-up" style={{ background: '#f8fafc', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[11px] font-medium text-dim uppercase tracking-wide">지출 흐름</p>
          <h1
            className="text-[20px] font-bold text-body leading-tight"
            style={{ letterSpacing: '-0.03em', color: '#1c1f26' }}
          >
            자금 흐름도
          </h1>
        </div>
        {/* 월 합계 칩 */}
        {data && totalMonthly > 0 && (
          <div
            className="rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums"
            style={{ background: '#f0fdf4', color: '#00d2c4', border: '1px solid #bbf7d0' }}
          >
            월 {krwShort(totalMonthly)}원
          </div>
        )}
      </div>

      {/* 뷰 전환 세그먼트 */}
      <div className="seg-bar">
        <Seg active={view === 'tree'} onClick={() => changeView('tree')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="inline mr-1">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          트리
        </Seg>
        <Seg active={view === 'graph'} onClick={() => changeView('graph')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="inline mr-1">
            <circle cx="5" cy="12" r="2" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.8"/>
            <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M7 11l10-5M7 13l10 5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          관계도
        </Seg>
        <Seg active={view === 'calendar'} onClick={() => changeView('calendar')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="inline mr-1">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          캘린더
        </Seg>
        <Seg active={view === 'billing'} onClick={() => changeView('billing')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="inline mr-1">
            <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
          청구
        </Seg>
      </div>

      {!data && (
        <div className="flex items-center gap-2 py-4 text-dim text-[13px]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-teal" />
          불러오는 중...
        </div>
      )}

      {data && view === 'graph' && (
        <Suspense fallback={<ViewLoading label="관계도 불러오는 중..." />}>
          <RelationshipGraph data={data} />
        </Suspense>
      )}

      {data && view === 'billing' && (
        <Suspense fallback={<ViewLoading label="청구 불러오는 중..." />}>
          <BillingCycle data={data} />
        </Suspense>
      )}

      {view === 'calendar' && (
        calFlows == null
          ? <ViewLoading label="캘린더 불러오는 중..." />
          : (
            <Suspense fallback={<ViewLoading label="캘린더 불러오는 중..." />}>
              <CashflowCalendar flows={calFlows} />
            </Suspense>
          )
      )}

      {data && view === 'tree' && (
        <>
          {data.tree.length === 0 && data.orphan_cards.length === 0 && (
            <div
              className="rounded-xl border border-dashed p-6 text-center text-sm"
              style={{ borderColor: '#00d2c4', background: '#f0fdf4' }}
            >
              <div className="mb-2 text-[24px]">🏦</div>
              <div className="font-semibold text-body mb-1">아직 비어있어요</div>
              <p className="text-[12px] text-dim">목록 탭에서 계좌·카드·정기지출을 등록하면<br/>여기에 흐름이 채워집니다.</p>
            </div>
          )}

          {/* 전체 지출 요약 바 */}
          {data.tree.length > 0 && (
            <section className="rounded-xl bg-white border border-line shadow-card p-4">
              <p className="text-[11px] font-medium text-dim uppercase tracking-wide mb-2">전체 월 지출 구성</p>
              <div className="space-y-2">
                {data.tree.filter(a => a.monthly_sum > 0).map((acc) => (
                  <div key={acc.id}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-body font-medium">{acc.institution_name} · {acc.nickname}</span>
                      <span className="text-[12px] font-bold tabular-nums" style={{ color: '#00d2c4' }}>
                        {krwShort(acc.monthly_sum)}원
                      </span>
                    </div>
                    <InlineBar value={acc.monthly_sum} max={totalMonthly} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-2">
            {data.tree.map((acc) => <AccountTree key={acc.id} node={acc} totalMonthly={totalMonthly} />)}
          </div>

          {data.orphan_cards.length > 0 && (
            <section className="rounded-xl bg-white border border-line shadow-card p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: '#fef3c7', color: '#f59e0b' }}
                >
                  미연결
                </span>
                <span className="text-[12px] font-medium text-dim">결제계좌 연결 없는 카드</span>
              </div>
              <div className="space-y-1.5">
                {data.orphan_cards.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-[13px]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="5" width="20" height="14" rx="2" stroke="#94a3b8" strokeWidth="1.8"/>
                      <path d="M2 10h20" stroke="#94a3b8" strokeWidth="1.8"/>
                    </svg>
                    <span className="text-body">{c.issuer_name}</span>
                    <span className="text-dim">{c.product_name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`seg-item ${active ? 'seg-item-active' : 'seg-item-inactive'}`}
    >
      {children}
    </button>
  );
}

function AccountTree({ node, totalMonthly }: { node: AccountNode; totalMonthly: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl bg-white border border-line shadow-card overflow-hidden">
      {/* 계좌 헤더 */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3.5 text-left hover:bg-panel transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {/* 은행 아이콘 */}
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold"
            style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', color: '#00d2c4' }}
          >
            {node.institution_name.slice(0, 2)}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-body">{node.institution_name}</div>
            <div className="text-[11px] text-dim">{node.nickname}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[13px] font-bold tabular-nums" style={{ color: '#1c1f26' }}>
              {node.monthly_sum > 0 ? krwShort(node.monthly_sum) + '원' : '—'}
            </div>
            <div className="text-[10px] text-dim">월 지출</div>
          </div>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path d="M6 9l6 6 6-6" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* 잔액 진행 바 */}
      {node.monthly_sum > 0 && (
        <div className="px-3.5 pb-1">
          <InlineBar value={node.monthly_sum} max={totalMonthly} />
        </div>
      )}

      {open && (
        <div className="border-t border-line">
          {node.cards.map((card) => <CardTree key={card.id} node={card} />)}
          {node.direct_flows.map((f) => (
            <FlowRow key={f.id} flow={f} isLast={false} />
          ))}
          {node.cards.length === 0 && node.direct_flows.length === 0 && (
            <div className="py-3 text-center text-[11px] text-dim">연결된 카드·자동이체 없음</div>
          )}
        </div>
      )}
    </div>
  );
}

// 카드 노드는 기본으로 접힌 상태(open=false). 계좌와 달리 세부 항목이 많을 수 있어
// 한 번에 펼치면 스크롤이 길어지므로 클릭 시에만 자식(정기지출)을 보여준다.
function CardTree({ node }: { node: CardNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-panel transition-colors"
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: '#fef3c7' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="#f59e0b" strokeWidth="1.8"/>
              <path d="M2 10h20" stroke="#f59e0b" strokeWidth="1.8"/>
            </svg>
          </div>
          <div>
            <div className="text-[12px] font-medium text-body">{node.issuer_name}</div>
            <div className="text-[10px] text-dim">{node.product_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {node.monthly_sum > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
              style={{ background: '#fef3c7', color: '#f59e0b' }}
            >
              월 {krwShort(node.monthly_sum)}원
            </span>
          )}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <path d="M6 9l6 6 6-6" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      {open && (
        <div className="bg-panel/50 border-t border-line/60">
          {node.children.length === 0
            ? <div className="py-2 text-center text-[11px] text-dim">등록된 정기지출 없음</div>
            : node.children.map((f, i) => (
              <FlowRow key={f.id} flow={f} isLast={i === node.children.length - 1} indent />
            ))
          }
        </div>
      )}
    </div>
  );
}

function FlowRow({ flow, isLast, indent }: {
  flow: FlowNode; isLast: boolean; indent?: boolean;
}) {
  const catColor = CATEGORY_COLOR[flow.category] ?? '#94a3b8';
  return (
    <div
      className={`flex items-center justify-between px-3.5 py-2 text-sm ${!isLast ? 'border-b border-line/40' : ''} ${indent ? 'pl-12' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {flow.is_draft ? (
          <div className="h-2 w-2 shrink-0 rounded-full border border-dim2" />
        ) : (
          <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: catColor }} />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-body truncate">{flow.merchant_name}</span>
            {flow.is_draft && (
              <span
                className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                style={{ background: '#fef3c7', color: '#f59e0b' }}
              >
                초안
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{ background: catColor + '22', color: catColor }}
            >
              {CATEGORY_LABEL[flow.category]}
            </span>
            <span className="text-[10px] text-dim2">매월 {flow.schedule_day}일</span>
          </div>
        </div>
      </div>
      <div className="text-right ml-2 shrink-0">
        <div
          className="text-[12px] font-bold tabular-nums"
          style={{ color: flow.amount_krw ? '#1c1f26' : '#94a3b8' }}
        >
          {flow.amount_krw != null ? krw(flow.amount_krw) : '변동'}
        </div>
      </div>
    </div>
  );
}

