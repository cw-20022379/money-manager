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
    <div className="p-4 pb-24 max-w-[700px] mx-auto">
      {/* 탭 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#37352f]">📋 목록</h1>
      </div>

      {/* 탭 세그먼트 */}
      <div className="inline-flex rounded border border-line bg-[#f7f6f3] p-0.5 text-xs gap-0.5 mb-4">
        <Seg active={tab === 'flows'} onClick={() => setTab('flows')}>
          💸 정기지출 <span className="ml-1 text-[#9b9a97]">{flows.length}</span>
        </Seg>
        <Seg active={tab === 'accounts'} onClick={() => setTab('accounts')}>
          🏦 계좌 <span className="ml-1 text-[#9b9a97]">{accounts.length}</span>
        </Seg>
        <Seg active={tab === 'cards'} onClick={() => setTab('cards')}>
          💳 카드 <span className="ml-1 text-[#9b9a97]">{cards.length}</span>
        </Seg>
      </div>

      {tab === 'flows' && (
        <FlowList flows={flows} cards={cards} accounts={accounts}
          onTap={(f) => setEdit({ kind: 'edit-flow', flow: f })} />
      )}

      {tab === 'accounts' && (
        <div>
          {accounts.length === 0
            ? <Empty icon="🏦">계좌가 비어있어요.<br />+ 버튼으로 첫 계좌를 등록하세요.</Empty>
            : (
              <div className="rounded-md border border-line divide-y divide-line">
                {accounts.map((a) => (
                  <button key={a.id} onClick={() => setEdit({ kind: 'edit-account', account: a })}
                    className="block w-full px-3 py-2.5 text-left hover:bg-[#f7f6f3] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#37352f]">
                        🏦 {a.institution_name}
                        <span className="text-[#787774] ml-1">{a.nickname}</span>
                      </span>
                      <span className="text-[12px] text-[#787774]">{krw(a.balance_krw)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      )}

      {tab === 'cards' && (
        <div>
          {cards.length === 0
            ? <Empty icon="💳">카드가 비어있어요.</Empty>
            : (
              <div className="rounded-md border border-line divide-y divide-line">
                {cards.map((c) => (
                  <button key={c.id} onClick={() => setEdit({ kind: 'edit-card', card: c })}
                    className="block w-full px-3 py-2.5 text-left hover:bg-[#f7f6f3] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#37352f]">
                        💳 {c.issuer_name}
                        <span className="text-[#787774] ml-1">{c.product_name}</span>
                      </span>
                      {c.payment_due_day && (
                        <span className="text-[12px] text-[#9b9a97]">매월 {c.payment_due_day}일</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* FAB — Notion의 "+ New" 버튼 스타일 */}
      <button
        onClick={() => setEdit({ kind: 'new', type: tab })}
        className="fixed bottom-20 right-6 z-30 rounded-md border border-line bg-bg px-4 py-2.5 text-sm text-[#37352f] shadow-notion hover:bg-[#f7f6f3] transition-colors"
      >
        + 새로 등록
      </button>

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
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 transition-colors text-xs ${
        active
          ? 'bg-bg text-[#37352f] shadow-notion font-medium'
          : 'text-[#787774] hover:text-[#37352f] hover:bg-bg/60'
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line p-8 text-center">
      {icon && <div className="text-3xl mb-3">{icon}</div>}
      <p className="text-[13px] text-[#787774]">{children}</p>
    </div>
  );
}

// 카테고리별 배지 색상
function categoryBadgeClass(cat: Category): string {
  const map: Partial<Record<Category, string>> = {
    UTILITY: 'badge-blue',
    TELECOM: 'badge-blue',
    INSURANCE: 'badge-green',
    MEDIA: 'badge-yellow',
    SAAS: 'badge-yellow',
    EDUCATION: 'badge-orange',
    LOAN: 'badge-red',
    CARD_BILL: 'badge-gray',
    RENT: 'badge-orange',
    HEALTHCARE: 'badge-green',
  };
  return map[cat] ?? 'badge-gray';
}

function FlowList({ flows, cards, accounts, onTap }: {
  flows: Flow[]; cards: Card[]; accounts: Account[]; onTap: (f: Flow) => void;
}) {
  if (flows.length === 0)
    return (
      <Empty icon="💸">
        정기지출이 비어있어요.<br />+ 버튼으로 첫 항목을 등록하세요.
      </Empty>
    );

  const sorted = [...flows].sort((a, b) => {
    if (a.is_draft !== b.is_draft) return a.is_draft ? -1 : 1;
    return (b.amount_krw ?? 0) - (a.amount_krw ?? 0);
  });

  return (
    <div className="rounded-md border border-line divide-y divide-line">
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
            className="block w-full px-3 py-2.5 text-left hover:bg-[#f7f6f3] transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AmountDot amount={f.amount_krw} draft={f.is_draft} />
                <span className="text-sm font-medium text-[#37352f] truncate">{f.merchant_name}</span>
                {f.is_draft && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] badge-orange">초안</span>
                )}
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${categoryBadgeClass(f.category)}`}>
                  {CATEGORY_LABEL[f.category]}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] font-medium text-[#37352f]">
                  {f.amount_is_variable ? '변동' : krw(f.amount_krw)}
                </div>
                <div className="text-[11px] text-[#9b9a97]">매월 {f.schedule_day}일</div>
              </div>
            </div>
            <div className="mt-0.5 text-[11px] text-[#9b9a97]">{srcLabel}</div>
          </button>
        );
      })}
    </div>
  );
}

function AmountDot({ amount, draft }: { amount: number | null; draft: boolean }) {
  if (draft) return <span className="w-2 h-2 rounded-full bg-[#9b9a97] inline-block shrink-0" />;
  if (amount == null) return <span className="w-2 h-2 rounded-full bg-[#9b9a97] inline-block shrink-0" />;
  if (amount >= 100_000) return <span className="w-2 h-2 rounded-full bg-bad inline-block shrink-0" />;
  if (amount >= 50_000) return <span className="w-2 h-2 rounded-full bg-warn inline-block shrink-0" />;
  if (amount >= 20_000) return <span className="w-2 h-2 rounded-full bg-[#ffe066] inline-block shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-ok inline-block shrink-0" />;
}
