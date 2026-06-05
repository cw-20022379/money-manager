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

  // sessionStorage로 전달된 "특정 flow 편집" 요청 (P6 인터럽트 복귀)
  useEffect(() => {
    const draftId = sessionStorage.getItem('ffn:edit-flow');
    if (!draftId || flows.length === 0) return;
    const target = flows.find((f) => f.id === draftId);
    if (target) {
      setTab('flows');
      setEdit({ kind: 'edit-flow', flow: target });
      sessionStorage.removeItem('ffn:edit-flow');
    }
  }, [flows]);

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
    <div className="space-y-3 p-4 pb-24">
      <div className="flex gap-1 rounded-lg bg-panel p-1 text-sm">
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
              className="block w-full rounded-xl border border-line bg-panel p-3 text-left hover:border-teal">
              <div className="text-sm">{a.institution_name} · <span className="text-teal">{a.nickname}</span></div>
              <div className="mt-1 text-xs text-dim">잔액 {krw(a.balance_krw)}</div>
            </button>
          ))}
        </div>
      )}
      {tab === 'cards' && (
        <div className="space-y-2">
          {cards.length === 0 && <Empty>카드가 비어있어요.</Empty>}
          {cards.map((c) => (
            <button key={c.id} onClick={() => setEdit({ kind: 'edit-card', card: c })}
              className="block w-full rounded-xl border border-line bg-panel p-3 text-left hover:border-teal">
              <div className="text-sm">{c.issuer_name} · <span className="text-teal">{c.product_name}</span></div>
              {c.payment_due_day && (
                <div className="mt-1 text-xs text-dim">결제일 매월 {c.payment_due_day}일</div>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setEdit({ kind: 'new', type: tab })}
        className="fixed bottom-20 right-6 z-30 rounded-full bg-teal px-5 py-3 text-bg shadow-lg"
      >+ 새로 등록</button>

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
      className={`flex-1 rounded-md py-2 ${active ? 'bg-bg text-teal' : 'text-dim'}`}>
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
            className="block w-full rounded-xl border border-line bg-panel p-3 text-left hover:border-teal">
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
          </button>
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
