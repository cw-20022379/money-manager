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

// Amount severity color
function amountColor(amount: number | null, isDraft: boolean): string {
  if (isDraft) return '#c7c7cc';
  if (amount == null) return '#8e8e93';
  if (amount >= 100_000) return '#ff3b30';
  if (amount >= 50_000) return '#ff9500';
  if (amount >= 20_000) return '#ffd60a';
  return '#34c759';
}

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
      if (t) { setTab('flows'); setEdit({ kind: 'edit-flow', flow: t }); sessionStorage.removeItem('ffn:edit-flow'); return; }
    }
    const accountId = sessionStorage.getItem('ffn:edit-account');
    if (accountId && accounts.length > 0) {
      const t = accounts.find((a) => a.id === accountId);
      if (t) { setTab('accounts'); setEdit({ kind: 'edit-account', account: t }); sessionStorage.removeItem('ffn:edit-account'); return; }
    }
    const cardId = sessionStorage.getItem('ffn:edit-card');
    if (cardId && cards.length > 0) {
      const t = cards.find((c) => c.id === cardId);
      if (t) { setTab('cards'); setEdit({ kind: 'edit-card', card: t }); sessionStorage.removeItem('ffn:edit-card'); }
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

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'flows', label: '정기지출', count: flows.length },
    { key: 'accounts', label: '계좌', count: accounts.length },
    { key: 'cards', label: '카드', count: cards.length },
  ];

  return (
    <div className="space-y-4 px-4 pt-5 pb-28">
      {/* Header */}
      <header className="animate-slide-up">
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: '#1c1c1e' }}>목록</h1>
      </header>

      {/* iOS Segmented Control */}
      <div
        className="animate-slide-up delay-50"
        style={{
          background: 'rgba(118,118,128,0.12)',
          borderRadius: 10,
          padding: 2,
          display: 'flex',
        }}
      >
        {TABS.map(({ key, label, count }) => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                borderRadius: 8,
                padding: '7px 4px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#1c1c1e' : '#8e8e93',
                background: isActive ? 'rgba(255,255,255,0.90)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 160ms ease',
                boxShadow: isActive ? '0 2px 8px -2px rgba(0,0,0,0.12)' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
              <span style={{
                marginLeft: 5,
                background: isActive ? 'rgba(0,122,255,0.12)' : 'rgba(0,0,0,0.06)',
                borderRadius: 100,
                padding: '1px 6px',
                fontSize: 11,
                fontWeight: 600,
                color: isActive ? '#007aff' : '#8e8e93',
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'flows' && (
        <FlowList flows={flows} cards={cards} accounts={accounts}
          onTap={(f) => setEdit({ kind: 'edit-flow', flow: f })} />
      )}

      {tab === 'accounts' && (
        <div className="animate-slide-up delay-50">
          {accounts.length === 0
            ? <Empty label="계좌가 비어있어요" sub="+ 버튼으로 등록하세요." />
            : (
              <div style={{
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '0 8px 24px -8px rgba(0,0,0,0.12)',
                overflow: 'hidden',
              }}>
                {accounts.map((a, idx) => (
                  <button
                    key={a.id}
                    onClick={() => setEdit({ kind: 'edit-account', account: a })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '12px 16px',
                      background: 'none',
                      border: 'none',
                      borderTop: idx > 0 ? '0.5px solid rgba(60,60,67,0.10)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: 12,
                    }}
                  >
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #1a4fa0 0%, #2d6bce 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      flexShrink: 0,
                    }}>
                      🏦
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', letterSpacing: '-0.01em' }}>
                        {a.institution_name}
                        <span style={{ color: '#007aff', marginLeft: 6 }}>{a.nickname}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                        잔액 {krw(a.balance_krw)}
                      </div>
                    </div>
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                      <path d="M2 2l4 4-4 4" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      )}

      {tab === 'cards' && (
        <div className="animate-slide-up delay-50">
          {cards.length === 0
            ? <Empty label="카드가 비어있어요" sub="+ 버튼으로 등록하세요." />
            : (
              <div style={{
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '0 8px 24px -8px rgba(0,0,0,0.12)',
                overflow: 'hidden',
              }}>
                {cards.map((c, idx) => (
                  <button
                    key={c.id}
                    onClick={() => setEdit({ kind: 'edit-card', card: c })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      padding: '12px 16px',
                      background: 'none',
                      border: 'none',
                      borderTop: idx > 0 ? '0.5px solid rgba(60,60,67,0.10)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: 12,
                    }}
                  >
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #5856d6 0%, #7c3aed 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      flexShrink: 0,
                    }}>
                      💳
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', letterSpacing: '-0.01em' }}>
                        {c.issuer_name}
                        <span style={{ color: '#007aff', marginLeft: 6 }}>{c.product_name}</span>
                      </div>
                      {c.payment_due_day && (
                        <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 1 }}>
                          결제일 매월 {c.payment_due_day}일
                        </div>
                      )}
                    </div>
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                      <path d="M2 2l4 4-4 4" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* FAB — iOS style */}
      <button
        onClick={() => setEdit({ kind: 'new', type: tab })}
        style={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          zIndex: 30,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: '#007aff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          color: '#fff',
          fontWeight: 300,
          boxShadow: '0 8px 24px -6px rgba(0,122,255,0.50), 0 2px 8px -2px rgba(0,0,0,0.20)',
          lineHeight: 1,
        }}
        aria-label="새로 등록"
      >
        +
      </button>

      {/* Modals */}
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

function Empty({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.50)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 18,
      padding: '28px 20px',
      textAlign: 'center',
      border: '1.5px dashed rgba(0,0,0,0.10)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93' }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#c7c7cc', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function FlowList({ flows, cards, accounts, onTap }: {
  flows: Flow[]; cards: Card[]; accounts: Account[]; onTap: (f: Flow) => void;
}) {
  if (flows.length === 0)
    return <Empty label="정기지출이 비어있어요" sub="+ 버튼으로 첫 항목을 등록하세요." />;

  const sorted = [...flows].sort((a, b) => {
    if (a.is_draft !== b.is_draft) return a.is_draft ? -1 : 1;
    return (b.amount_krw ?? 0) - (a.amount_krw ?? 0);
  });

  return (
    <div
      className="animate-slide-up delay-50"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.5)',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}
    >
      {sorted.map((f, idx) => {
        const src = f.source_card_id
          ? cards.find((c) => c.id === f.source_card_id)
          : accounts.find((a) => a.id === f.source_account_id);
        const srcLabel = !src
          ? '— 연결 없음 —'
          : 'product_name' in src
            ? `${src.issuer_name} ${src.product_name}`
            : `${src.institution_name} ${src.nickname}`;
        const dotColor = amountColor(f.amount_krw, f.is_draft);

        return (
          <button
            key={f.id}
            onClick={() => onTap(f)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderTop: idx > 0 ? '0.5px solid rgba(60,60,67,0.10)' : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              gap: 12,
            }}
          >
            {/* Amount severity dot */}
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
              boxShadow: `0 0 6px 1px ${dotColor}60`,
            }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', letterSpacing: '-0.01em' }}>
                  {f.merchant_name}
                </span>
                {f.is_draft && (
                  <span style={{
                    background: 'rgba(255,149,0,0.12)',
                    borderRadius: 5,
                    padding: '1px 6px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#ff9500',
                  }}>초안</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>
                {CATEGORY_LABEL[f.category as Category]} · {srcLabel}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1c1c1e', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {f.amount_is_variable ? '변동' : krw(f.amount_krw)}
              </div>
              <div style={{ fontSize: 11, color: '#8e8e93' }}>매월 {f.schedule_day}일</div>
            </div>

            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 2l4 4-4 4" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
