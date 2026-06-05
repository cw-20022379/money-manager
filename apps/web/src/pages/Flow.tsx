import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { krw, krwShort } from '../lib/format.js';
import { CATEGORY_LABEL } from '@ffn/shared';
import { RelationshipGraph, type GraphData } from '../features/RelationshipGraph.js';
import { CashflowCalendar, type CalFlow } from '../features/CashflowCalendar.js';

type FlowNode = GraphData['tree'][number]['cards'][number]['children'][number];
type CardNode = GraphData['tree'][number]['cards'][number];
type AccountNode = GraphData['tree'][number];

type View = 'tree' | 'graph' | 'calendar';
const ALLOWED: readonly View[] = ['tree', 'graph', 'calendar'];

export function Flow() {
  const [data, setData] = useState<GraphData | null>(null);
  const [calFlows, setCalFlows] = useState<CalFlow[] | null>(null);
  const [view, setView] = useState<View>(() => {
    const stored = sessionStorage.getItem('ffn:flow-view') as View | null;
    return stored && ALLOWED.includes(stored) ? stored : 'tree';
  });

  useEffect(() => {
    const load = () => api<GraphData>('/api/graph').then(setData).catch(console.error);
    load();
    window.addEventListener('ffn:data-changed', load);
    return () => window.removeEventListener('ffn:data-changed', load);
  }, []);

  useEffect(() => {
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
    sessionStorage.setItem('ffn:flow-view', v);
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* 헤더 */}
      <header className="bg-panel px-5 pt-6 pb-4 shadow-[0_1px_0_#ececec]">
        <h1 className="text-xl font-bold text-kakao-dark">🌊 흐름도</h1>
        <p className="text-xs text-dim mt-0.5">내 돈이 어디로 흘러가는지 한눈에</p>
      </header>

      <div className="space-y-3 p-4 pb-24">
        {/* 뷰 선택 세그먼트 */}
        <div className="kb-seg-bar">
          <Seg active={view === 'tree'} onClick={() => changeView('tree')}>📋 트리</Seg>
          <Seg active={view === 'graph'} onClick={() => changeView('graph')}>🕸 관계도</Seg>
          <Seg active={view === 'calendar'} onClick={() => changeView('calendar')}>📅 캘린더</Seg>
        </div>

        {!data && (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="animate-pulse">불러오는 중...</span>
          </div>
        )}

        {data && view === 'graph' && <RelationshipGraph data={data} />}

        {view === 'calendar' && (
          calFlows == null
            ? <div className="flex items-center justify-center py-10 text-dim text-sm"><span className="animate-pulse">캘린더 불러오는 중...</span></div>
            : <CashflowCalendar flows={calFlows} />
        )}

        {data && view === 'tree' && (
          <>
            {data.tree.length === 0 && data.orphan_cards.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-line bg-panel p-8 text-center">
                <div className="text-3xl mb-3">🌊</div>
                <div className="text-sm font-bold text-kakao-dark">아직 비어있어요</div>
                <p className="mt-1.5 text-xs text-dim">목록 탭에서 계좌·카드·정기지출을 등록하면<br />여기에 흐름이 채워집니다.</p>
              </div>
            )}
            <div className="space-y-3">
              {data.tree.map((acc) => <AccountTree key={acc.id} node={acc} />)}
            </div>
            {data.orphan_cards.length > 0 && (
              <section className="kb-card">
                <div className="mb-2 text-xs font-semibold text-dim">결제계좌 연결 없는 카드</div>
                <div className="space-y-1 text-sm">
                  {data.orphan_cards.map((c) => (
                    <div key={c.id} className="rounded-2xl bg-bg px-4 py-2.5 text-sm text-kakao-dark">💳 {c.issuer_name} {c.product_name}</div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={active ? 'kb-seg-active' : 'kb-seg-inactive'}>
      {children}
    </button>
  );
}

function AccountTree({ node }: { node: AccountNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="kb-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-kakao text-lg shadow-sm">🏦</div>
          <div>
            <div className="text-sm font-bold text-kakao-dark">{node.institution_name} <span className="font-medium text-navy">{node.nickname}</span></div>
            <div className="text-xs text-dim">
              잔액 {krw(node.balance_krw)} · 매월 {krwShort(node.monthly_sum)}원 빠짐
            </div>
          </div>
        </div>
        <span className="text-dim text-lg">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-l-2 border-kakao pl-4">
          {node.cards.map((card) => <CardTree key={card.id} node={card} />)}
          {node.direct_flows.map((f) => <FlowRow key={f.id} flow={f} />)}
          {node.cards.length === 0 && node.direct_flows.length === 0 && (
            <div className="rounded-2xl bg-bg px-4 py-3 text-xs text-dim">연결된 카드·자동이체 없음</div>
          )}
        </div>
      )}
    </div>
  );
}

function CardTree({ node }: { node: CardNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-bg">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="text-base">💳</span>
          <div>
            <div className="text-sm font-semibold text-kakao-dark">{node.issuer_name} {node.product_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          <span className="font-medium text-navy">매월 {krwShort(node.monthly_sum)}원</span>
          <span>{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-line mx-3 pt-2 pb-2 space-y-1">
          {node.children.length === 0
            ? <div className="text-xs text-dim py-1">등록된 정기지출 없음</div>
            : node.children.map((f) => <FlowRow key={f.id} flow={f} />)}
        </div>
      )}
    </div>
  );
}

function FlowRow({ flow }: { flow: FlowNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${flow.is_draft ? 'bg-line' : 'bg-ok'}`} />
        <div>
          <span className="font-medium text-kakao-dark">{flow.merchant_name}</span>
          {flow.is_draft && <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">초안</span>}
          <div className="text-[11px] text-dim">{CATEGORY_LABEL[flow.category]}</div>
        </div>
      </div>
      <div className="text-right text-xs">
        <div className="font-semibold text-kakao-dark">{krw(flow.amount_krw)}</div>
        <div className="text-dim">매월 {flow.schedule_day}일</div>
      </div>
    </div>
  );
}
