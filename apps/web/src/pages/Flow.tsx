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
    <div className="p-4 pb-24 max-w-[700px] mx-auto">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#37352f]">🌊 흐름도</h1>
        {/* 세그먼트 컨트롤 — Notion 인라인 토글 스타일 */}
        <div className="inline-flex rounded border border-line bg-[#f7f6f3] p-0.5 text-xs gap-0.5">
          <Seg active={view === 'tree'} onClick={() => changeView('tree')}>📋 트리</Seg>
          <Seg active={view === 'graph'} onClick={() => changeView('graph')}>🕸 관계도</Seg>
          <Seg active={view === 'calendar'} onClick={() => changeView('calendar')}>📅 달력</Seg>
        </div>
      </div>

      {!data && (
        <div className="text-[13px] text-[#9b9a97] py-4">불러오는 중...</div>
      )}

      {data && view === 'graph' && <RelationshipGraph data={data} />}

      {view === 'calendar' && (
        calFlows == null
          ? <div className="text-[13px] text-[#9b9a97] py-4">캘린더 불러오는 중...</div>
          : <CashflowCalendar flows={calFlows} />
      )}

      {data && view === 'tree' && (
        <>
          {data.tree.length === 0 && data.orphan_cards.length === 0 && (
            <div className="rounded-md border border-dashed border-line p-8 text-center">
              <div className="text-3xl mb-3">🌿</div>
              <div className="text-sm font-medium text-[#37352f] mb-1">아직 비어있어요</div>
              <p className="text-[12px] text-[#787774]">
                목록 탭에서 계좌·카드·정기지출을 등록하면<br />여기에 흐름이 채워집니다.
              </p>
            </div>
          )}
          <div className="space-y-1">
            {data.tree.map((acc) => <AccountTree key={acc.id} node={acc} />)}
          </div>
          {data.orphan_cards.length > 0 && (
            <div className="mt-3 rounded-md border border-line">
              <div className="px-3 py-2 text-[11px] font-semibold text-[#787774] uppercase tracking-wide border-b border-line">
                결제계좌 연결 없는 카드
              </div>
              <div className="divide-y divide-line">
                {data.orphan_cards.map((c) => (
                  <div key={c.id} className="px-3 py-2 text-sm text-[#37352f] hover:bg-[#f7f6f3] transition-colors">
                    💳 {c.issuer_name} {c.product_name}
                  </div>
                ))}
              </div>
            </div>
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
      className={`rounded px-2.5 py-1 transition-colors ${
        active
          ? 'bg-bg text-[#37352f] shadow-notion font-medium'
          : 'text-[#787774] hover:text-[#37352f] hover:bg-bg/60'
      }`}
    >
      {children}
    </button>
  );
}

function AccountTree({ node }: { node: AccountNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-line mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[#f7f6f3] transition-colors rounded-md"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#9b9a97] w-3">{open ? '▾' : '▸'}</span>
          <div>
            <div className="text-sm font-medium text-[#37352f]">
              🏦 {node.institution_name}
              <span className="text-[#787774] font-normal ml-1">{node.nickname}</span>
            </div>
            <div className="text-[11px] text-[#9b9a97] mt-0.5">
              잔액 {krw(node.balance_krw)} · 매월 {krwShort(node.monthly_sum)}원 빠짐
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-line">
          {node.cards.map((card) => <CardTree key={card.id} node={card} />)}
          {node.direct_flows.map((f) => (
            <div key={f.id} className="pl-8">
              <FlowRow flow={f} />
            </div>
          ))}
          {node.cards.length === 0 && node.direct_flows.length === 0 && (
            <div className="px-8 py-2 text-[12px] text-[#9b9a97]">연결된 카드·자동이체 없음</div>
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
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#f7f6f3] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9b9a97] w-3 ml-4">{open ? '▾' : '▸'}</span>
          <span className="text-sm text-[#37352f]">
            💳 {node.issuer_name}
            <span className="text-[#787774] font-normal ml-1">{node.product_name}</span>
          </span>
        </div>
        <span className="text-[12px] text-[#787774]">매월 {krwShort(node.monthly_sum)}원</span>
      </button>
      {open && (
        <div className="border-t border-line border-dashed">
          {node.children.length === 0
            ? <div className="pl-12 pr-3 py-2 text-[12px] text-[#9b9a97]">등록된 정기지출 없음</div>
            : node.children.map((f) => (
              <div key={f.id} className="pl-12">
                <FlowRow flow={f} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function FlowRow({ flow }: { flow: FlowNode }) {
  return (
    <div className="flex items-center justify-between pr-3 py-1.5 hover:bg-[#f7f6f3] transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-[#9b9a97] text-[10px]">{flow.is_draft ? '○' : '•'}</span>
        <span className="text-[13px] text-[#37352f]">{flow.merchant_name}</span>
        <span className="px-1.5 py-0.5 rounded text-[10px] badge-gray">
          {CATEGORY_LABEL[flow.category]}
        </span>
      </div>
      <div className="text-right text-[12px] text-[#787774]">
        <div>{krw(flow.amount_krw)}</div>
        <div className="text-[#9b9a97]">매월 {flow.schedule_day}일</div>
      </div>
    </div>
  );
}
