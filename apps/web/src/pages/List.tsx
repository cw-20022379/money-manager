import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { krw } from '../lib/format.js';
import { CATEGORY_LABEL, type Category } from '@ffn/shared';
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

  // sessionStorage로 전달된 "특정 항목 편집" 요청
  // (P6 인터럽트 복귀 / 관계도 노드 클릭에서 사용)
  useEffect(() => {
    const flowId = sessionStorage.getItem('ffn:edit-flow');
    if (flowId && flows.length > 0) {
      const t = flows.find((f) => f.id === flowId);
      if (t) {
        setTab('flows');
        setEdit({ kind: 'edit-flow', flow: t });
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

  return (
    <div className="min-h-screen bg-bg">
      {/* 헤더 */}
      <header className="bg-panel px-5 pt-6 pb-4 shadow-[0_1px_0_#ececec]">
        <h1 className="text-xl font-bold text-kakao-dark">📋 목록</h1>
        <p className="text-xs text-dim mt-0.5">계좌·카드·정기지출 관리</p>
      </header>

      <div className="space-y-3 p-4 pb-24">
        {/* 탭 세그먼트 */}
        <div className="kb-seg-bar">
          <Seg active={tab === 'flows'} onClick={() => setTab('flows')}>정기지출 {flows.length}</Seg>
          <Seg active={tab === 'accounts'} onClick={() => setTab('accounts')}>계좌 {accounts.length}</Seg>
          <Seg active={tab === 'cards'} onClick={() => setTab('cards')}>카드 {cards.length}</Seg>
        </div>

        {tab === 'flows' && (
          <FlowList flows={flows} cards={cards} accounts={accounts}
            onTap={(f) => setEdit({ kind: 'edit-flow', flow: f })} />
        )}
        {tab === 'accounts' && (
          <div className="space-y-2">
            {accounts.length === 0 && <Empty>계좌가 비어있어요. + 버튼으로 등록하세요.</Empty>}
            {accounts.map((a) => (
              <button key={a.id} onClick={() => setEdit({ kind: 'edit-account', account: a })}
                className="kb-card block w-full text-left transition-shadow hover:shadow-card-hover active:scale-[0.99]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-kakao text-lg">🏦</div>
                  <div>
                    <div className="text-sm font-bold text-kakao-dark">{a.institution_name}</div>
                    <div className="text-sm font-medium text-navy">{a.nickname}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl bg-bg px-3 py-2 text-xs">
                  <span className="text-dim">잔액</span>
                  <span className="ml-2 font-semibold text-kakao-dark">{krw(a.balance_krw)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {tab === 'cards' && (
          <div className="space-y-2">
            {cards.length === 0 && <Empty>카드가 비어있어요.</Empty>}
            {cards.map((c) => (
              <button key={c.id} onClick={() => setEdit({ kind: 'edit-card', card: c })}
                className="kb-card block w-full text-left transition-shadow hover:shadow-card-hover active:scale-[0.99]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-kakao text-lg">💳</div>
                  <div>
                    <div className="text-sm font-bold text-kakao-dark">{c.issuer_name}</div>
                    <div className="text-sm font-medium text-navy">{c.product_name}</div>
                  </div>
                </div>
                {c.payment_due_day && (
                  <div className="mt-3 rounded-2xl bg-bg px-3 py-2 text-xs">
                    <span className="text-dim">결제일</span>
                    <span className="ml-2 font-semibold text-kakao-dark">매월 {c.payment_due_day}일</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setEdit({ kind: 'new', type: tab })}
        className="fixed bottom-20 right-6 z-30 h-14 w-14 rounded-full bg-kakao text-2xl shadow-kakao transition-transform hover:scale-110 active:scale-95"
      >+</button>

      {edit?.kind === 'new' && edit.type === 'accounts' && (
        <Modal title="🏦 계좌 등록" onClose={() => setEdit(null)}>
          <AccountForm onDone={() => onSaved('계좌')} />
        </Modal>
      )}
      {edit?.kind === 'new' && edit.type === 'cards' && (
        <Modal title="💳 카드 등록" onClose={() => setEdit(null)}>
          <CardForm onDone={() => onSaved('카드')} />
        </Modal>
      )}
      {edit?.kind === 'new' && edit.type === 'flows' && (
        <Modal title="💸 정기지출 등록" onClose={() => setEdit(null)}>
          <FlowForm onDone={() => onSaved('정기지출')} />
        </Modal>
      )}

      {edit?.kind === 'edit-account' && (
        <Modal title="🏦 계좌 수정" onClose={() => setEdit(null)}>
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
        <Modal title="💳 카드 수정" onClose={() => setEdit(null)}>
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
        <Modal title="💸 정기지출 수정" onClose={() => setEdit(null)}>
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
    <button onClick={onClick}
      className={active ? 'kb-seg-active' : 'kb-seg-inactive'}>
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-panel p-8 text-center">
      <div className="text-3xl mb-2">💛</div>
      <p className="text-sm text-dim">{children}</p>
    </div>
  );
}

function FlowList({ flows, cards, accounts, onTap }: {
  flows: Flow[]; cards: Card[]; accounts: Account[]; onTap: (f: Flow) => void;
}) {
  if (flows.length === 0)
    return <Empty>정기지출이 비어있어요. + 버튼으로 첫 항목을 등록하세요.</Empty>;

  const sorted = [...flows].sort((a, b) => {
    if (a.is_draft !== b.is_draft) return a.is_draft ? -1 : 1;
    return (b.amount_krw ?? 0) - (a.amount_krw ?? 0);
  });

  return (
    <div className="space-y-2">
      {sorted.map((f) => {
        const src = f.source_card_id
          ? cards.find((c) => c.id === f.source_card_id)
          : accounts.find((a) => a.id === f.source_account_id);
        const srcLabel = !src
          ? '— 연결 없음 —'
          : 'product_name' in src
            ? `💳 ${src.issuer_name} ${src.product_name}`
            : `🏦 ${src.institution_name} ${src.nickname}`;
        return (
          <button key={f.id} onClick={() => onTap(f)}
            className="kb-card block w-full text-left transition-shadow hover:shadow-card-hover active:scale-[0.99]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <Severity amount={f.amount_krw} draft={f.is_draft} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-kakao-dark">{f.merchant_name}</span>
                    {f.is_draft && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">초안</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-dim">{CATEGORY_LABEL[f.category]} · {srcLabel}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-kakao-dark">
                  {f.amount_is_variable ? '변동' : krw(f.amount_krw)}
                </div>
                <div className="text-xs text-dim">매월 {f.schedule_day}일</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Severity({ amount, draft }: { amount: number | null; draft: boolean }) {
  if (draft) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-line text-sm">⚪</div>
  );
  if (amount == null) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-line text-sm">⚫</div>
  );
  if (amount >= 100_000) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-bad/10 text-sm">🔴</div>
  );
  if (amount >= 50_000) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-warn/10 text-sm">🟠</div>
  );
  if (amount >= 20_000) return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-kakao/40 text-sm">🟡</div>
  );
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ok/10 text-sm">🟢</div>
  );
}
