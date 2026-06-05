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
      <header className="flex items-center justify-between">
        <h1 className="text-xl text-teal">🌊 흐름도</h1>
        <div className="flex gap-1 rounded-lg bg-panel p-1 text-xs">
          <Seg active={view === 'tree'} onClick={() => changeView('tree')}>📋 트리</Seg>
          <Seg active={view === 'graph'} onClick={() => changeView('graph')}>🕸 관계도</Seg>
          <Seg active={view === 'calendar'} onClick={() => changeView('calendar')}>📅 캘린더</Seg>
        </div>
      </header>

      {!data && <div className="text-dim">불러오는 중...</div>}

      {data && view === 'graph' && <RelationshipGraph data={data} />}

      {view === 'calendar' && (
        calFlows == null
          ? <div className="text-dim">캘린더 불러오는 중...</div>
          : <CashflowCalendar flows={calFlows} />
      )}

      {data && view === 'tree' && (
        <>
          {data.tree.length === 0 && data.orphan_cards.length === 0 && (
            <div className="rounded-xl border border-dashed border-line bg-panel/40 p-6 text-center text-sm text-dim">
              아직 비어있어요. <br />목록 탭에서 계좌·카드·정기지출을 등록하면<br />여기에 흐름이 채워집니다.
            </div>
          )}
          <div className="space-y-2">
            {data.tree.map((acc) => <AccountTree key={acc.id} node={acc} />)}
          </div>
          {data.orphan_cards.length > 0 && (
            <section className="rounded-xl border border-line bg-panel p-3">
              <div className="mb-2 text-xs text-dim">결제계좌 연결 없는 카드</div>
              <div className="space-y-1 text-sm">
                {data.orphan_cards.map((c) => (
                  <div key={c.id}>💳 {c.issuer_name} {c.product_name}</div>
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
      className={`rounded-md px-2.5 py-1 ${active ? 'bg-bg text-teal' : 'text-dim'}`}>
      {children}
    </button>
  );
}

function AccountTree({ node }: { node: AccountNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-sm">🏦 <span className="text-teal">{node.institution_name}</span> {node.nickname}</div>
          <div className="text-xs text-dim">
            잔액 {krw(node.balance_krw)} · 매월 {krwShort(node.monthly_sum)}원 빠짐
          </div>
        </div>
        <span className="text-dim">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-l border-line pl-3">
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
        <div className="text-sm">💳 <span className="text-teal">{node.issuer_name}</span> {node.product_name}</div>
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
        <span>{flow.is_draft ? '⚪' : '•'}</span>
        <span>{flow.merchant_name}</span>
        <span className="text-xs text-dim">{CATEGORY_LABEL[flow.category]}</span>
      </div>
      <div className="text-right text-xs text-dim">
        <div>{krw(flow.amount_krw)}</div>
        <div>매월 {flow.schedule_day}일</div>
      </div>
    </div>
  );
}
