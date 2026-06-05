import { useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MiniMap, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { krwShort, krw } from '../lib/format.js';
import { useNavigate } from 'react-router-dom';
import type { Category } from '@ffn/shared';

/**
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

const COL_X = { account: 0, card: 320, flow: 640 } as const;
const ROW_H = 100;
const NODE_W = 240;

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
    <div className="rounded-2xl border border-teal/40 bg-white px-4 py-3 shadow-sm" style={{ width: NODE_W }}>
      <Handle type="source" position={Position.Right} className="!bg-teal" />
      <div className="text-xs font-medium text-dim">🏦 계좌</div>
      <div className="text-sm font-bold text-teal">{data.label}</div>
      {data.sub && <div className="mt-1 text-[11px] text-dim">{data.sub}</div>}
      {data.amount && <div className="text-[11px] font-medium text-warn">매월 {data.amount} 빠짐</div>}
    </div>
  );
}

function CardNodeView({ data }: { data: NodeData }) {
  return (
    <div className="rounded-2xl border border-warn/40 bg-white px-4 py-3 shadow-sm" style={{ width: NODE_W }}>
      <Handle type="target" position={Position.Left} className="!bg-warn" />
      <Handle type="source" position={Position.Right} className="!bg-warn" />
      <div className="text-xs font-medium text-dim">💳 카드</div>
      <div className="text-sm font-bold text-body">{data.label}</div>
      {data.amount && <div className="mt-1 text-[11px] font-medium text-warn">매월 {data.amount}</div>}
    </div>
  );
}

function FlowNodeView({ data }: { data: NodeData }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-sm ${
        data.draft ? 'border-line bg-surface' : 'border-line bg-white'
      }`}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} className="!bg-line" />
      <div className="text-xs font-medium text-dim">
        {data.draft ? '⚪ 초안' : '💸 정기지출'}
      </div>
      <div className="text-sm font-bold text-body">{data.label}</div>
      <div className="mt-1 flex justify-between text-[11px] text-dim">
        <span>{data.sub}</span>
        <span className="font-medium text-teal">{data.amount}</span>
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
        style: { stroke: '#ff9500', strokeWidth: 1.5 },
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
          style: { stroke: '#e5e8eb', strokeWidth: 1 },
        });
        flowCursor += ROW_H;
      }
      cardCursor = Math.max(cardCursor + ROW_H, flowCursor);
    }

    // 카드 없이 계좌→정기지출 직접 연결 (자동이체)
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
        style: { stroke: '#e5e8eb', strokeDasharray: '4 4', strokeWidth: 1 },
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
    const key =
      d.entityKind === 'ACCOUNT' ? 'ffn:edit-account'
        : d.entityKind === 'CARD' ? 'ffn:edit-card'
          : 'ffn:edit-flow';
    sessionStorage.setItem(key, d.entityId);
    navigate('/list');
  };

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
        <div className="mb-1 text-base font-bold text-body">그릴 게 없어요</div>
        <p className="text-sm text-dim">목록 탭에서 계좌·카드·정기지출을 등록하세요.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-220px)] min-h-[400px] overflow-hidden rounded-2xl border border-line bg-surface">
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
        <Background color="#e5e8eb" gap={20} />
        <Controls position="bottom-right" showInteractive={false} />
        {nodes.length > 8 && (
          <MiniMap
            position="top-right"
            nodeColor={(n) => {
              const k = (n.data as NodeData).entityKind;
              return k === 'ACCOUNT' ? '#3182f6' : k === 'CARD' ? '#ff9500' : '#e5e8eb';
            }}
            maskColor="rgba(249,250,251,0.7)"
          />
        )}
      </ReactFlow>
    </div>
  );
}
