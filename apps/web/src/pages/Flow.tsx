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
    <div className="space-y-3 p-4 pb-24">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold tracking-tight text-body">흐름도</h1>
        {/* Toss-style segmented control */}
        <div className="flex gap-1 rounded-xl bg-panel2 p-1 text-xs">
          <Seg active={view === 'tree'} onClick={() => changeView('tree')}>트리</Seg>
          <Seg active={view === 'graph'} onClick={() => changeView('graph')}>관계도</Seg>
          <Seg active={view === 'calendar'} onClick={() => changeView('calendar')}>캘린더</Seg>
        </div>
      </header>

      {!data && <div className="text-sm text-dim">불러오는 중...</div>}

      {data && view === 'graph' && <RelationshipGraph data={data} />}

      {view === 'calendar' && (
        calFlows == null
          ? <div className="text-sm text-dim">캘린더 불러오는 중...</div>
          : <CashflowCalendar flows={calFlows} />
      )}

      {data && view === 'tree' && (
        <>
          {data.tree.length === 0 && data.orphan_cards.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <div className="mb-1 text-base font-bold text-body">아직 비어있어요</div>
              <p className="text-sm text-dim">
                목록 탭에서 계좌·카드·정기지출을 등록하면<br />여기에 흐름이 채워집니다.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {data.tree.map((acc) => <AccountTree key={acc.id} node={acc} />)}
          </div>
          {data.orphan_cards.length > 0 && (
            <section className="rounded-2xl border border-line bg-bg p-4">
              <div className="mb-2 text-xs font-medium text-dim">결제계좌 연결 없는 카드</div>
              <div className="space-y-1 text-sm">
                {data.orphan_cards.map((c) => (
                  <div key={c.id} className="text-sub">💳 {c.issuer_name} {c.product_name}</div>
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
    <button onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
        active ? 'bg-bg text-teal shadow-sm' : 'text-dim'
      }`}>
      {children}
    </button>
  );
}

function AccountTree({ node }: { node: AccountNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-line bg-bg p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-body">
            <span>🏦</span>
            <span className="text-teal">{node.institution_name}</span>
            <span>{node.nickname}</span>
          </div>
          <div className="mt-0.5 text-xs text-dim">
            잔액 {krw(node.balance_krw)} · 매월 {krwShort(node.monthly_sum)}원 빠짐
          </div>
        </div>
        <span className="text-dim text-sm">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-l-2 border-line pl-4">
          {node.cards.map((card) => <CardTree key={card.id} node={card} />)}
          {node.direct_flows.map((f) => <FlowRow key={f.id} flow={f} />)}
          {node.cards.length === 0 && node.direct_flows.length === 0 && (
            <div className="py-1 text-xs text-dim">연결된 카드·자동이체 없음</div>
          )}
        </div>
      )}
    </div>
  );
}

function CardTree({ node }: { node: CardNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-1 text-left">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span>💳</span>
          <span className="text-teal">{node.issuer_name}</span>
          <span className="text-sub">{node.product_name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-dim">
          매월 {krwShort(node.monthly_sum)}원
          <span>{open ? '▾' : '▸'}</span>
        </div>
      </button>
      {open && (
        <div className="ml-3 mt-1 space-y-1 border-l border-line pl-3">
          {node.children.length === 0
            ? <div className="text-xs text-dim">등록된 정기지출 없음</div>
            : node.children.map((f) => <FlowRow key={f.id} flow={f} />)}
        </div>
      )}
    </div>
  );
}

function FlowRow({ flow }: { flow: FlowNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <div className="flex items-center gap-2">
        <span className={flow.is_draft ? 'text-dim' : 'text-teal'}>
          {flow.is_draft ? '⚪' : '•'}
        </span>
        <span className="text-body">{flow.merchant_name}</span>
        <span className="text-xs text-dim">{CATEGORY_LABEL[flow.category]}</span>
      </div>
      <div className="text-right text-xs text-dim">
        <div className="font-semibold text-body">{krw(flow.amount_krw)}</div>
        <div>매월 {flow.schedule_day}일</div>
      </div>
    </div>
  );
}
