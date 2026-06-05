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
    <div className="space-y-4 px-4 pt-5 pb-28">
      <header className="flex items-center justify-between animate-slide-up">
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: '#1c1c1e' }}>흐름도</h1>
        {/* iOS Segmented Control */}
        <div
          style={{
            background: 'rgba(118,118,128,0.12)',
            borderRadius: 10,
            padding: 2,
            display: 'flex',
            gap: 0,
          }}
        >
          {(['tree', 'graph', 'calendar'] as const).map((v) => {
            const labels: Record<View, string> = { tree: '트리', graph: '관계도', calendar: '달력' };
            const isActive = view === v;
            return (
              <button
                key={v}
                onClick={() => changeView(v)}
                style={{
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#1c1c1e' : '#8e8e93',
                  background: isActive ? 'rgba(255,255,255,0.90)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  boxShadow: isActive ? '0 2px 8px -2px rgba(0,0,0,0.12)' : 'none',
                  minWidth: 54,
                }}
              >
                {labels[v]}
              </button>
            );
          })}
        </div>
      </header>

      {!data && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: 14 }}>
          불러오는 중…
        </div>
      )}

      {data && view === 'graph' && <RelationshipGraph data={data} />}

      {view === 'calendar' && (
        calFlows == null
          ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e8e93', fontSize: 14 }}>캘린더 불러오는 중…</div>
          : <CashflowCalendar flows={calFlows} />
      )}

      {data && view === 'tree' && (
        <div className="space-y-3 animate-slide-up delay-50">
          {data.tree.length === 0 && data.orphan_cards.length === 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.50)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 18,
              padding: '32px 20px',
              textAlign: 'center',
              border: '1.5px dashed rgba(0,122,255,0.20)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🌊</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', marginBottom: 4 }}>아직 비어있어요</div>
              <div style={{ fontSize: 13, color: '#8e8e93', lineHeight: 1.5 }}>
                목록 탭에서 계좌·카드·정기지출을 등록하면<br />여기에 흐름이 채워집니다.
              </div>
            </div>
          )}
          <div className="space-y-3">
            {data.tree.map((acc) => <AccountTree key={acc.id} node={acc} />)}
          </div>
          {data.orphan_cards.length > 0 && (
            <section style={{
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.5)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e8e93' }}>
                연결 없는 카드
              </div>
              {data.orphan_cards.map((c, idx) => (
                <div key={c.id} style={{
                  padding: '10px 16px',
                  borderTop: idx === 0 ? '0.5px solid rgba(60,60,67,0.10)' : '0.5px solid rgba(60,60,67,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 14,
                  color: '#1c1c1e',
                }}>
                  <span style={{ fontSize: 18 }}>💳</span>
                  {c.issuer_name} {c.product_name}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function AccountTree({ node }: { node: AccountNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.5)',
      boxShadow: '0 8px 24px -8px rgba(0,0,0,0.12)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #1a4fa0 0%, #2d6bce 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}>
            🏦
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', letterSpacing: '-0.01em' }}>
              {node.institution_name}
              <span style={{ color: '#007aff', marginLeft: 6 }}>{node.nickname}</span>
            </div>
            <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
              잔액 {krw(node.balance_krw)} · 매월 {krwShort(node.monthly_sum)}원 빠짐
            </div>
          </div>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease', flexShrink: 0 }}
        >
          <path d="M2 4l4 4 4-4" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: '0.5px solid rgba(60,60,67,0.10)', paddingLeft: 16, marginLeft: 0 }}>
          {node.cards.map((card, idx) => (
            <CardTree
              key={card.id}
              node={card}
              hasBorder={idx > 0 || node.direct_flows.length > 0}
            />
          ))}
          {node.direct_flows.map((f, idx) => (
            <div key={f.id} style={{ borderTop: (idx === 0 && node.cards.length > 0) || idx > 0 ? '0.5px solid rgba(60,60,67,0.08)' : 'none' }}>
              <FlowRow flow={f} />
            </div>
          ))}
          {node.cards.length === 0 && node.direct_flows.length === 0 && (
            <div style={{ padding: '12px 16px 12px 0', fontSize: 13, color: '#8e8e93' }}>
              연결된 카드·자동이체 없음
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardTree({ node, hasBorder }: { node: CardNode; hasBorder?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: hasBorder ? '0.5px solid rgba(60,60,67,0.10)' : 'none' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px 10px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💳</span>
          <div>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1c1c1e' }}>
              {node.issuer_name}
            </span>
            <span style={{ fontSize: 14, color: '#007aff', marginLeft: 5 }}>
              {node.product_name}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#8e8e93', fontVariantNumeric: 'tabular-nums' }}>
            매월 {krwShort(node.monthly_sum)}원
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
            <path d="M2 3.5l3 3 3-3" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
      </button>
      {open && (
        <div style={{ marginLeft: 24, borderLeft: '2px solid rgba(0,122,255,0.15)', paddingLeft: 12 }}>
          {node.children.length === 0
            ? <div style={{ padding: '8px 0', fontSize: 13, color: '#8e8e93' }}>등록된 정기지출 없음</div>
            : node.children.map((f) => <FlowRow key={f.id} flow={f} />)}
        </div>
      )}
    </div>
  );
}

function FlowRow({ flow }: { flow: FlowNode }) {
  const amount = flow.amount_krw;
  const dotColor = flow.is_draft ? '#c7c7cc'
    : amount == null ? '#c7c7cc'
    : amount >= 100_000 ? '#ff3b30'
    : amount >= 50_000 ? '#ff9500'
    : amount >= 20_000 ? '#ffd60a'
    : '#34c759';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '9px 16px 9px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }} />
        <div>
          <span style={{ fontSize: 14, color: '#1c1c1e', fontWeight: 500 }}>{flow.merchant_name}</span>
          <span style={{ fontSize: 12, color: '#8e8e93', marginLeft: 6 }}>{CATEGORY_LABEL[flow.category]}</span>
          {flow.is_draft && (
            <span style={{ marginLeft: 6, background: 'rgba(255,149,0,0.12)', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600, color: '#ff9500' }}>
              초안
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#3c3c43', fontVariantNumeric: 'tabular-nums' }}>
          {krw(flow.amount_krw)}
        </div>
        <div style={{ fontSize: 11, color: '#8e8e93' }}>매월 {flow.schedule_day}일</div>
      </div>
    </div>
  );
}
