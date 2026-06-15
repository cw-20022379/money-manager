import { useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MiniMap, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { krwShort, krw } from '../lib/format.js';
import { useNavigate } from 'react-router-dom';
import type { Category } from '@ffn/shared';

/**
 * features/RelationshipGraph.tsx — 자금 관계도 (인터랙티브 그래프)
 *
 * @xyflow/react(react-flow)를 사용해 계좌→카드→정기지출 트리를 인터랙티브 그래프로 표시한다.
 * 번들 크기가 크므로 Flow.tsx에서 lazy import로 뷰 선택 시에만 로드한다.
 *
 * 레이아웃 전략 (buildGraph):
 *   3열 구조: 계좌(x=0) → 카드(x=320) → 정기지출(x=640)
 *   각 열은 수직으로 배치 (ROW_H=100px 간격).
 *   커서(cursorY) 방식: 계좌 아래에 카드와 직접 정기지출을 배치하며,
 *   카드 아래에 자식 정기지출을 추가로 배치. cursorY를 계속 내려가며 겹침 방지.
 *   orphan_cards(결제계좌 없는 카드): 모든 계좌 트리 아래 별도로 표시.
 *
 * 노드 클릭 → onNodeClick:
 *   entityKind에 따라 ffn:edit-account / ffn:edit-card / ffn:edit-flow 를 sessionStorage에 저장.
 *   /list로 navigate → List가 해당 항목의 편집 모달을 자동으로 열어준다.
 *   (sessionStorage 라우팅 브릿지 패턴)
 *
 * MiniMap: 노드가 8개 초과일 때만 표시. 소수의 가족에게는 불필요하므로 숨김.
 *
 * /api/graph 응답 — Flow.tsx에서 사용 중인 것과 동일 구조.
 * 트리 구조를 react-flow의 nodes/edges로 변환해 표시한다.
 */
interface FlowNode {
  id: string;
  merchant_name: string;
  category: Category;
  amount_krw: number | null;
  schedule_day: number;
  is_draft: boolean;
}
interface CardNode {
  id: string; product_name: string; issuer_name: string;
  monthly_sum: number;
  payment_due_day?: number | null;
  payment_due_month_offset?: number | null;
  children: FlowNode[];
}
interface AccountNode {
  id: string; nickname: string; institution_name: string; balance_krw: number | null;
  monthly_sum: number;
  cards: CardNode[];
  direct_flows: FlowNode[];
}
export interface GraphData {
  tree: AccountNode[];
  orphan_cards: { id: string; product_name: string; issuer_name: string }[];
  summary: { fixed_sum: number; active_count: number; draft_count: number };
}

// 그래프 레이아웃 상수. 열 X좌표와 행 높이를 변경하면 전체 레이아웃이 바뀐다.
const COL_X = { account: 0, card: 320, flow: 640 } as const;
const ROW_H = 100;   // 노드 간 수직 간격 (px)
const NODE_W = 240;  // 노드 고정 너비 (px)

interface NodeData extends Record<string, unknown> {
  label: string;
  sub?: string;
  amount?: string;
  draft?: boolean;
  entityKind: 'ACCOUNT' | 'CARD' | 'FLOW';
  entityId: string;
}

function AccountNodeView({ data }: { data: NodeData }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-card" style={{ width: NODE_W, border: '1.5px solid #00d2c4' }}>
      <Handle type="source" position={Position.Right} className="!bg-teal" />
      <div className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>계좌</div>
      <div className="text-sm font-semibold" style={{ color: '#00d2c4' }}>{data.label}</div>
      {data.sub && <div className="mt-1 text-[11px]" style={{ color: '#64748b' }}>{data.sub}</div>}
      {data.amount && <div className="text-[11px] font-medium" style={{ color: '#f59e0b' }}>매월 {data.amount} 빠짐</div>}
    </div>
  );
}

function CardNodeView({ data }: { data: NodeData }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-card" style={{ width: NODE_W, border: '1.5px solid #f59e0b' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#f59e0b' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#f59e0b' }} />
      <div className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>카드</div>
      <div className="text-sm font-semibold text-body">{data.label}</div>
      {data.amount && <div className="mt-1 text-[11px] font-medium" style={{ color: '#f59e0b' }}>매월 {data.amount}</div>}
    </div>
  );
}

function FlowNodeView({ data }: { data: NodeData }) {
  return (
    <div
      className="rounded-xl bg-white px-3 py-2 shadow-card"
      style={{
        width: NODE_W,
        border: data.draft ? '1px dashed #cbd5e1' : '1px solid #e2e8f0',
        opacity: data.draft ? 0.75 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#e2e8f0' }} />
      <div className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>
        {data.draft ? '초안' : '정기지출'}
      </div>
      <div className="text-sm font-semibold text-body">{data.label}</div>
      <div className="mt-1 flex justify-between text-[11px]">
        <span style={{ color: '#64748b' }}>{data.sub}</span>
        <span style={{ color: '#00d2c4' }} className="font-medium tabular-nums">{data.amount}</span>
      </div>
    </div>
  );
}

const nodeTypes = {
  account: AccountNodeView,
  card: CardNodeView,
  flow: FlowNodeView,
};

/** tree → nodes + edges 변환 (간단 column 레이아웃). */
function buildGraph(data: GraphData): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];
  let cursorY = 0;

  for (const acc of data.tree) {
    const accY = cursorY;
    nodes.push({
      id: `account:${acc.id}`,
      type: 'account',
      position: { x: COL_X.account, y: accY },
      data: {
        label: `${acc.institution_name} · ${acc.nickname}`,
        sub: acc.balance_krw != null ? `잔액 ${krw(acc.balance_krw)}` : undefined,
        amount: acc.monthly_sum > 0 ? `${krwShort(acc.monthly_sum)}원` : undefined,
        entityKind: 'ACCOUNT',
        entityId: acc.id,
      },
    });

    let cardCursor = accY;
    for (const card of acc.cards) {
      const cardY = cardCursor;
      nodes.push({
        id: `card:${card.id}`,
        type: 'card',
        position: { x: COL_X.card, y: cardY },
        data: {
          label: `${card.issuer_name} ${card.product_name}`,
          amount: card.monthly_sum > 0 ? `${krwShort(card.monthly_sum)}원` : undefined,
          entityKind: 'CARD',
          entityId: card.id,
        },
      });
      edges.push({
        id: `e:${acc.id}->${card.id}`,
        source: `account:${acc.id}`,
        target: `card:${card.id}`,
        style: { stroke: '#f59e0b', strokeWidth: 1.5 },
        animated: false,
      });

      let flowCursor = cardY;
      for (const flow of card.children) {
        nodes.push({
          id: `flow:${flow.id}`,
          type: 'flow',
          position: { x: COL_X.flow, y: flowCursor },
          data: {
            label: flow.merchant_name,
            sub: `매월 ${flow.schedule_day}일`,
            amount: flow.amount_krw != null ? krw(flow.amount_krw) : '변동',
            draft: flow.is_draft,
            entityKind: 'FLOW',
            entityId: flow.id,
          },
        });
        edges.push({
          id: `e:${card.id}->${flow.id}`,
          source: `card:${card.id}`,
          target: `flow:${flow.id}`,
          style: { stroke: '#cbd5e1', strokeWidth: 1 },
        });
        flowCursor += ROW_H;
      }
      cardCursor = Math.max(cardCursor + ROW_H, flowCursor);
    }

    // 자동이체 정기지출: 카드를 거치지 않고 계좌에서 직접 출금.
    // 카드 트리 아래에 이어서 배치하되 겹치지 않게 Math.max로 커서 위치 결정.
    let directCursor = Math.max(cursorY, cardCursor);
    for (const flow of acc.direct_flows) {
      nodes.push({
        id: `flow:${flow.id}`,
        type: 'flow',
        position: { x: COL_X.flow, y: directCursor },
        data: {
          label: flow.merchant_name,
          sub: `매월 ${flow.schedule_day}일`,
          amount: flow.amount_krw != null ? krw(flow.amount_krw) : '변동',
          draft: flow.is_draft,
          entityKind: 'FLOW',
          entityId: flow.id,
        },
      });
      edges.push({
        id: `e:${acc.id}->${flow.id}`,
        source: `account:${acc.id}`,
        target: `flow:${flow.id}`,
        style: { stroke: '#cbd5e1', strokeDasharray: '4 4', strokeWidth: 1 },
      });
      directCursor += ROW_H;
    }

    cursorY = Math.max(cardCursor, directCursor, accY + ROW_H) + 40;
  }

  // 결제계좌 연결 없는 카드는 별도 컬럼 아래쪽
  for (const oc of data.orphan_cards) {
    nodes.push({
      id: `card:${oc.id}`,
      type: 'card',
      position: { x: COL_X.card, y: cursorY },
      data: {
        label: `${oc.issuer_name} ${oc.product_name}`,
        sub: '결제계좌 없음',
        entityKind: 'CARD',
        entityId: oc.id,
      },
    });
    cursorY += ROW_H;
  }

  return { nodes, edges };
}

interface Props {
  data: GraphData;
}

export function RelationshipGraph({ data }: Props) {
  const navigate = useNavigate();
  const { nodes, edges } = useMemo(() => buildGraph(data), [data]);

  const onNodeClick = (_: unknown, node: Node) => {
    const d = node.data as NodeData;
    // 편집 모달로 라우팅 (List 페이지의 sessionStorage 트리거 활용)
    const key =
      d.entityKind === 'ACCOUNT' ? 'ffn:edit-account'
        : d.entityKind === 'CARD' ? 'ffn:edit-card'
          : 'ffn:edit-flow';
    sessionStorage.setItem(key, d.entityId);
    navigate('/list');
  };

  if (nodes.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed p-6 text-center text-sm text-dim"
        style={{ borderColor: '#00d2c4', background: '#f0fdf4' }}
      >
        그릴 게 없어요. 목록 탭에서 계좌·카드·정기지출을 등록하세요.
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-220px)] min-h-[400px] overflow-hidden rounded-xl border border-line bg-panel">
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls
          position="bottom-right"
          className="!bg-white !border-line !text-body"
          showInteractive={false}
        />
        {nodes.length > 8 && (
          <MiniMap
            position="top-right"
            nodeColor={(n) => {
              const k = (n.data as NodeData).entityKind;
              return k === 'ACCOUNT' ? '#00d2c4' : k === 'CARD' ? '#f59e0b' : '#94a3b8';
            }}
            maskColor="rgba(248,250,252,0.7)"
            className="!bg-white !border-line"
          />
        )}
      </ReactFlow>
    </div>
  );
}
