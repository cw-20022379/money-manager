import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { krw } from '../lib/format.js';
import { CATEGORY_LABEL, type Category } from '@ffn/shared';
import { Modal } from '../components/Modal.js';
import { AccountForm } from '../features/AccountForm.js';
import { CardForm } from '../features/CardForm.js';
import { FlowForm } from '../features/FlowForm.js';
import { useToast } from '../components/Toast.js';

type Tab = 'flows' | 'accounts' | 'cards';
type ModalType = null | 'flow' | 'account' | 'card';

interface Flow {
  id: string; merchant_name: string; amount_krw: number | null; schedule_day: number;
  category: Category; is_draft: boolean; amount_is_variable: boolean;
  source_card_id: string | null; source_account_id: string | null;
}
interface Account { id: string; institution_name: string; nickname: string; balance_krw: number | null }
interface Card { id: string; issuer_name: string; product_name: string; payment_due_day: number | null }

export function List() {
  const [tab, setTab] = useState<Tab>('flows');
  const [modal, setModal] = useState<ModalType>(null);
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

  function onSaved(kind: '계좌' | '카드' | '정기지출') {
    setModal(null);
    toast.push(`${kind}을(를) 저장했어요`);
    refresh();
  }

  return (
    <div className="space-y-3 p-4 pb-24">
      <div className="flex gap-1 rounded-lg bg-panel p-1 text-sm">
        <Seg active={tab === 'flows'} onClick={() => setTab('flows')}>정기지출 {flows.length}</Seg>
        <Seg active={tab === 'accounts'} onClick={() => setTab('accounts')}>계좌 {accounts.length}</Seg>
        <Seg active={tab === 'cards'} onClick={() => setTab('cards')}>카드 {cards.length}</Seg>
      </div>

      {tab === 'flows' && (
        <FlowList flows={flows} cards={cards} accounts={accounts} />
      )}
      {tab === 'accounts' && (
        <div className="space-y-2">
          {accounts.length === 0 && <Empty>계좌가 비어있어요. + 버튼으로 등록하세요.</Empty>}
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-line bg-panel p-3">
              <div className="text-sm">{a.institution_name} · <span className="text-teal">{a.nickname}</span></div>
              <div className="mt-1 text-xs text-dim">잔액 {krw(a.balance_krw)}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'cards' && (
        <div className="space-y-2">
          {cards.length === 0 && <Empty>카드가 비어있어요.</Empty>}
          {cards.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-panel p-3">
              <div className="text-sm">{c.issuer_name} · <span className="text-teal">{c.product_name}</span></div>
              {c.payment_due_day && (
                <div className="mt-1 text-xs text-dim">결제일 매월 {c.payment_due_day}일</div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          if (tab === 'flows') setModal('flow');
          if (tab === 'accounts') setModal('account');
          if (tab === 'cards') setModal('card');
        }}
        className="fixed bottom-20 right-6 z-30 rounded-full bg-teal px-5 py-3 text-bg shadow-lg"
      >+ 새로 등록</button>

      {modal === 'account' && (
        <Modal title="🏦 계좌 등록" onClose={() => setModal(null)}>
          <AccountForm onDone={() => onSaved('계좌')} />
        </Modal>
      )}
      {modal === 'card' && (
        <Modal title="💳 카드 등록" onClose={() => setModal(null)}>
          <CardForm onDone={() => onSaved('카드')} />
        </Modal>
      )}
      {modal === 'flow' && (
        <Modal title="💸 정기지출 등록" onClose={() => setModal(null)}>
          <FlowForm onDone={() => onSaved('정기지출')} />
        </Modal>
      )}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md py-2 ${active ? 'bg-bg text-teal' : 'text-dim'}`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-panel/40 p-4 text-center text-sm text-dim">
      {children}
    </div>
  );
}

function FlowList({ flows, cards, accounts }: { flows: Flow[]; cards: Card[]; accounts: Account[] }) {
  if (flows.length === 0)
    return <Empty>정기지출이 비어있어요. + 버튼으로 첫 항목을 등록하세요.</Empty>;

  // 초안 먼저, 그 다음 amount 내림차순
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
          <div key={f.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Severity amount={f.amount_krw} draft={f.is_draft} />
                <span className="font-semibold">{f.merchant_name}</span>
                {f.is_draft && <span className="rounded bg-warn/20 px-1.5 text-[10px] text-warn">초안</span>}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">
                  {f.amount_is_variable ? '변동' : krw(f.amount_krw)}
                </div>
                <div className="text-xs text-dim">매월 {f.schedule_day}일</div>
              </div>
            </div>
            <div className="mt-1 text-xs text-dim">{CATEGORY_LABEL[f.category]} · {srcLabel}</div>
          </div>
        );
      })}
    </div>
  );
}

function Severity({ amount, draft }: { amount: number | null; draft: boolean }) {
  if (draft) return <span className="text-dim">⚪</span>;
  if (amount == null) return <span className="text-dim">⚫</span>;
  if (amount >= 100_000) return <span className="text-bad">🔴</span>;
  if (amount >= 50_000) return <span className="text-warn">🟠</span>;
  if (amount >= 20_000) return <span className="text-warn">🟡</span>;
  return <span className="text-ok">🟢</span>;
}
