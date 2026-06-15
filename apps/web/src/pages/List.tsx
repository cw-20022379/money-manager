/**
 * pages/List.tsx — 정기지출·계좌·카드 관리 목록
 *
 * 핵심 역할:
 *   1) CRUD 허브: 정기지출/계좌/카드를 조회·등록·수정·해지하는 모달 상태머신.
 *   2) sessionStorage 라우팅 브릿지: 다른 화면(관계도·캘린더·청구·홈 초안)에서
 *      ffn:edit-flow / ffn:edit-account / ffn:edit-card 에 id를 넣고 /list로 navigate하면
 *      List가 마운트 후 해당 항목의 편집 모달을 자동으로 연다.
 *      키는 매칭 직후 삭제해 새로고침 시 재오픈되지 않도록 한다.
 *   3) ffn:data-changed 이벤트 수신: 배우자가 Realtime으로 변경하면 자동 재조회.
 *
 * EditState 상태머신:
 *   null → 모달 없음
 *   { kind: 'new', type } → 신규 등록 모달
 *   { kind: 'edit-flow'|'edit-account'|'edit-card', ... } → 수정 모달
 *   { kind: 'delete', ... } → 해지 확인 모달
 *   수정 모달에서 "해지" 버튼 → kind: 'delete' 로 전환 (모달 전환, 원본 데이터 유지).
 */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { krw } from '../lib/format.js';
import { CATEGORY_LABEL, CATEGORY_COLOR, type Category } from '@ffn/shared';
import { Modal } from '../components/Modal.js';
import { AccountForm, type AccountInitial } from '../features/AccountForm.js';
import { CardForm, type CardInitial } from '../features/CardForm.js';
import { FlowForm, type FlowInitial } from '../features/FlowForm.js';
import { DeleteConfirm } from '../features/DeleteConfirm.js';
import { useToast } from '../components/Toast.js';

type Tab = 'flows' | 'accounts' | 'cards';

interface Flow extends FlowInitial {}
interface Account extends AccountInitial {}
interface Card extends CardInitial {
  payment_due_day: number | null;
}

/**
 * 모달 열림 상태를 하나의 discriminated union으로 관리.
 * 여러 boolean 플래그를 쓰는 것보다 상태 전환이 명확하고 버그가 적다.
 */
type EditState =
  | { kind: 'new'; type: Tab }
  | { kind: 'edit-flow'; flow: Flow }
  | { kind: 'edit-account'; account: Account }
  | { kind: 'edit-card'; card: Card }
  | { kind: 'delete'; endpoint: string; label: string; version: number }
  | null;


export function List() {
  const [tab, setTab] = useState<Tab>('flows');
  const [edit, setEdit] = useState<EditState>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const toast = useToast();

  const refresh = useCallback(async () => {
    const [f, a, c] = await Promise.all([
      api<{ items: Flow[] }>('/api/flows?status=ACTIVE'),
      api<{ items: Account[] }>('/api/accounts'),
      api<{ items: Card[] }>('/api/cards'),
    ]);
    setFlows(f.items);
    setAccounts(a.items);
    setCards(c.items);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('ffn:data-changed', handler);
    return () => window.removeEventListener('ffn:data-changed', handler);
  }, [refresh]);

  // sessionStorage 라우팅 브릿지.
  // RelationshipGraph·BillingCycle·CashflowCalendar·DraftResumeModal 등이
  // ffn:edit-flow / ffn:edit-account / ffn:edit-card 에 id를 넣고 /list로 navigate한다.
  // flows/accounts/cards 데이터가 로드된 후(deps에 포함)에만 실행해 항목을 찾을 수 있게 한다.
  // 우선순위: flow → account → card (순서대로 확인, 첫 번째 매칭에서 중단).
  useEffect(() => {
    const flowId = sessionStorage.getItem('ffn:edit-flow');
    if (flowId && flows.length > 0) {
      const t = flows.find((f) => f.id === flowId);
      if (t) {
        setTab('flows');
        setEdit({ kind: 'edit-flow', flow: t });
        // 즉시 삭제: 새로고침 또는 /list 재진입 시 모달이 다시 열리지 않게 한다.
        sessionStorage.removeItem('ffn:edit-flow');
        return;
      }
    }
    const accountId = sessionStorage.getItem('ffn:edit-account');
    if (accountId && accounts.length > 0) {
      const t = accounts.find((a) => a.id === accountId);
      if (t) {
        setTab('accounts');
        setEdit({ kind: 'edit-account', account: t });
        sessionStorage.removeItem('ffn:edit-account');
        return;
      }
    }
    const cardId = sessionStorage.getItem('ffn:edit-card');
    if (cardId && cards.length > 0) {
      const t = cards.find((c) => c.id === cardId);
      if (t) {
        setTab('cards');
        setEdit({ kind: 'edit-card', card: t });
        sessionStorage.removeItem('ffn:edit-card');
      }
    }
  }, [flows, accounts, cards]);

  function onSaved(kind: string) {
    setEdit(null);
    toast.push(`${kind} 저장 완료`);
    refresh();
  }
  function onDeleted() {
    setEdit(null);
    toast.push(`해지 완료`);
    refresh();
  }

  // 탭별 카운트
  const tabCounts = {
    flows: flows.length,
    accounts: accounts.length,
    cards: cards.length,
  };

  return (
    <div className="space-y-3 p-4 pb-24 fade-up" style={{ background: '#f8fafc', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="pt-1">
        <p className="text-[11px] font-medium text-dim uppercase tracking-wide">관리</p>
        <h1
          className="text-[20px] font-bold text-body leading-tight"
          style={{ letterSpacing: '-0.03em' }}
        >
          지출 목록
        </h1>
      </div>

      {/* 탭 세그먼트 */}
      <div className="seg-bar">
        <Seg active={tab === 'flows'} onClick={() => setTab('flows')}>
          정기지출
          {tabCounts.flows > 0 && (
            <span
              className="ml-1 rounded-full px-1.5 text-[10px] font-bold"
              style={{
                background: tab === 'flows' ? '#00d2c4' : '#e2e8f0',
                color: tab === 'flows' ? '#ffffff' : '#94a3b8',
              }}
            >
              {tabCounts.flows}
            </span>
          )}
        </Seg>
        <Seg active={tab === 'accounts'} onClick={() => setTab('accounts')}>
          계좌
          {tabCounts.accounts > 0 && (
            <span
              className="ml-1 rounded-full px-1.5 text-[10px] font-bold"
              style={{
                background: tab === 'accounts' ? '#00d2c4' : '#e2e8f0',
                color: tab === 'accounts' ? '#ffffff' : '#94a3b8',
              }}
            >
              {tabCounts.accounts}
            </span>
          )}
        </Seg>
        <Seg active={tab === 'cards'} onClick={() => setTab('cards')}>
          카드
          {tabCounts.cards > 0 && (
            <span
              className="ml-1 rounded-full px-1.5 text-[10px] font-bold"
              style={{
                background: tab === 'cards' ? '#00d2c4' : '#e2e8f0',
                color: tab === 'cards' ? '#ffffff' : '#94a3b8',
              }}
            >
              {tabCounts.cards}
            </span>
          )}
        </Seg>
      </div>

      {tab === 'flows' && (
        <FlowList flows={flows} cards={cards} accounts={accounts}
          onTap={(f) => setEdit({ kind: 'edit-flow', flow: f })} />
      )}

      {tab === 'accounts' && (
        <div className="space-y-2">
          {accounts.length === 0 && <Empty>계좌가 비어있어요. + 버튼으로 등록하세요.</Empty>}
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setEdit({ kind: 'edit-account', account: a })}
              className="list-row"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-[12px] font-bold"
                  style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', color: '#00d2c4' }}
                >
                  {a.institution_name.slice(0, 2)}
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-body">{a.institution_name}</div>
                  <div className="text-[11px] text-dim mt-0.5">{a.nickname}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-bold tabular-nums text-body">{krw(a.balance_krw)}</div>
                <div className="text-[10px] text-dim mt-0.5">잔액</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === 'cards' && (
        <div className="space-y-2">
          {cards.length === 0 && <Empty>카드가 비어있어요.</Empty>}
          {cards.map((c) => (
            <button
              key={c.id}
              onClick={() => setEdit({ kind: 'edit-card', card: c })}
              className="list-row"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: '#fef3c7' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="5" width="20" height="14" rx="2" stroke="#f59e0b" strokeWidth="1.8"/>
                    <path d="M2 10h20" stroke="#f59e0b" strokeWidth="1.8"/>
                  </svg>
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-body">{c.issuer_name}</div>
                  <div className="text-[11px] text-dim mt-0.5">{c.product_name}</div>
                </div>
              </div>
              {c.payment_due_day && (
                <div className="text-right">
                  <div
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: '#fef3c7', color: '#f59e0b' }}
                  >
                    매월 {c.payment_due_day}일
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setEdit({ kind: 'new', type: tab })}
        className="fixed bottom-20 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
        style={{ background: 'linear-gradient(135deg, #00d2c4, #0bbcb0)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      {edit?.kind === 'new' && edit.type === 'accounts' && (
        <Modal title="계좌 등록" onClose={() => setEdit(null)}>
          <AccountForm onDone={() => onSaved('계좌')} />
        </Modal>
      )}
      {edit?.kind === 'new' && edit.type === 'cards' && (
        <Modal title="카드 등록" onClose={() => setEdit(null)}>
          <CardForm onDone={() => onSaved('카드')} />
        </Modal>
      )}
      {edit?.kind === 'new' && edit.type === 'flows' && (
        <Modal title="정기지출 등록" onClose={() => setEdit(null)}>
          <FlowForm onDone={() => onSaved('정기지출')} />
        </Modal>
      )}
      {edit?.kind === 'edit-account' && (
        <Modal title="계좌 수정" onClose={() => setEdit(null)}>
          <AccountForm initial={edit.account}
            onDone={() => onSaved('계좌')}
            onDelete={() => setEdit({
              kind: 'delete',
              endpoint: `/api/accounts/${edit.account.id}`,
              label: `${edit.account.institution_name} ${edit.account.nickname}`,
              version: edit.account.version,
            })}
          />
        </Modal>
      )}
      {edit?.kind === 'edit-card' && (
        <Modal title="카드 수정" onClose={() => setEdit(null)}>
          <CardForm initial={edit.card}
            onDone={() => onSaved('카드')}
            onDelete={() => setEdit({
              kind: 'delete',
              endpoint: `/api/cards/${edit.card.id}`,
              label: `${edit.card.issuer_name} ${edit.card.product_name}`,
              version: edit.card.version,
            })}
          />
        </Modal>
      )}
      {edit?.kind === 'edit-flow' && (
        <Modal title="정기지출 수정" onClose={() => setEdit(null)}>
          <FlowForm initial={edit.flow}
            onDone={() => onSaved('정기지출')}
            onDelete={() => setEdit({
              kind: 'delete',
              endpoint: `/api/flows/${edit.flow.id}`,
              label: edit.flow.merchant_name,
              version: edit.flow.version,
            })}
          />
        </Modal>
      )}
      {edit?.kind === 'delete' && (
        <DeleteConfirm
          title="해지 확인"
          subjectLabel={edit.label}
          endpoint={edit.endpoint}
          version={edit.version}
          onDone={onDeleted}
          onCancel={() => setEdit(null)}
        />
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border border-dashed p-6 text-center text-[13px]"
      style={{ borderColor: '#cbd5e1', color: '#94a3b8', background: '#ffffff' }}
    >
      {children}
    </div>
  );
}

function FlowList({ flows, cards, accounts, onTap }: {
  flows: Flow[]; cards: Card[]; accounts: Account[]; onTap: (f: Flow) => void;
}) {
  if (flows.length === 0)
    return <Empty>정기지출이 비어있어요. + 버튼으로 첫 항목을 등록하세요.</Empty>;

  // 정렬: 초안(is_draft=true)을 먼저 노출해 미완성 항목을 빠르게 처리하도록 유도.
  // 같은 그룹 내에서는 금액 큰 순으로 정렬 (상위 지출부터 파악).
  const sorted = [...flows].sort((a, b) => {
    if (a.is_draft !== b.is_draft) return a.is_draft ? -1 : 1;
    return (b.amount_krw ?? 0) - (a.amount_krw ?? 0);
  });

  // 총합: 초안과 변동 금액(null)은 집계에서 제외. 확정된 고정지출만 합산.
  const total = sorted.filter(f => !f.is_draft && f.amount_krw).reduce((s, f) => s + (f.amount_krw ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* 요약 헤더 */}
      {total > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
        >
          <span className="text-[12px] font-medium text-dim">월 고정지출 합계</span>
          <span
            className="text-[16px] font-bold tabular-nums"
            style={{ color: '#00d2c4', letterSpacing: '-0.02em' }}
          >
            {krw(total)}
          </span>
        </div>
      )}

      {sorted.map((f) => {
        // 결제 출처: 카드 또는 계좌 중 하나. source_card_id 우선 확인.
        const src = f.source_card_id
          ? cards.find((c) => c.id === f.source_card_id)
          : accounts.find((a) => a.id === f.source_account_id);
        const isCard = f.source_card_id != null;
        // 카드와 계좌가 다른 구조 → 'product_name' in src 로 타입 구분.
        const srcLabel = !src
          ? '— 연결 없음 —'
          : 'product_name' in src
            ? `${src.issuer_name} ${src.product_name}`
            : `${src.institution_name} ${src.nickname}`;

        const catColor = CATEGORY_COLOR[f.category] ?? '#94a3b8';

        return (
          <button
            key={f.id}
            onClick={() => onTap(f)}
            className="list-row"
          >
            {/* 왼쪽: 카테고리 컬러 도트 + 정보 */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: catColor + '18' }}
              >
                <AmountDot amount={f.amount_krw} draft={f.is_draft} color={catColor} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-body truncate">{f.merchant_name}</span>
                  {f.is_draft && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ background: '#fef3c7', color: '#f59e0b' }}
                    >
                      초안
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{ background: catColor + '18', color: catColor }}
                  >
                    {CATEGORY_LABEL[f.category]}
                  </span>
                  <span className="text-[10px] text-dim2">·</span>
                  <span className="text-[10px] text-dim truncate">
                    {isCard ? '💳 ' : '🏦 '}{srcLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* 오른쪽: 금액 + 날짜 */}
            <div className="text-right ml-2 shrink-0">
              <div
                className="text-[13px] font-bold tabular-nums"
                style={{ color: '#1c1f26' }}
              >
                {f.amount_is_variable ? '변동' : krw(f.amount_krw)}
              </div>
              <div className="text-[10px] text-dim mt-0.5">매월 {f.schedule_day}일</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AmountDot({ amount, draft, color }: { amount: number | null; draft: boolean; color: string }) {
  if (draft) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 2"/>
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="5" fill={color} opacity="0.8" />
    </svg>
  );
}
