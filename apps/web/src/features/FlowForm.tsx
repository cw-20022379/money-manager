import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORY_LABEL, type Category } from '@ffn/shared';

interface Account { id: string; nickname: string; institution_name: string }
interface Card { id: string; product_name: string; issuer_name: string }
interface Props { onDone: () => void; defaultIsDraft?: boolean }

const CATS: Category[] = [
  'UTILITY','TELECOM','INSURANCE','MEDIA','SAAS',
  'EDUCATION','LOAN','CARD_BILL','RENT','HEALTHCARE','OTHER',
];

export function FlowForm({ onDone, defaultIsDraft }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [isVariable, setIsVariable] = useState(false);
  const [day, setDay] = useState('15');
  const [via, setVia] = useState<'card' | 'account'>('card');
  const [cardId, setCardId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [category, setCategory] = useState<Category>('MEDIA');
  const [notes, setNotes] = useState('');
  const [isDraft, setIsDraft] = useState(defaultIsDraft ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [similar, setSimilar] = useState<unknown[]>([]);

  useEffect(() => {
    api<{ items: Account[] }>('/api/accounts').then((r) => {
      setAccounts(r.items);
      if (r.items[0] && !accountId) setAccountId(r.items[0].id);
    });
    api<{ items: Card[] }>('/api/cards').then((r) => {
      setCards(r.items);
      if (r.items[0] && !cardId) setCardId(r.items[0].id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 비슷한 항목 가드 (P3): 입력값이 변하면 휴리스틱 조회
  useEffect(() => {
    if (!merchant || !day) {
      setSimilar([]);
      return;
    }
    const p = new URLSearchParams({ merchant: merchant.trim(), schedule_day: day });
    if (via === 'card' && cardId) p.set('source_card_id', cardId);
    if (via === 'account' && accountId) p.set('source_account_id', accountId);
    const t = setTimeout(() => {
      api<{ items: unknown[] }>(`/api/flows/similar?${p}`)
        .then((r) => setSimilar(r.items))
        .catch(() => setSimilar([]));
    }, 350);
    return () => clearTimeout(t);
  }, [merchant, day, via, cardId, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {
        merchant_name: merchant,
        category,
        flow_kind: via === 'card' ? 'CARD_RECURRING' : 'BANK_AUTO_TRANSFER',
        schedule_day: Number(day),
        amount_is_variable: isVariable,
        amount_krw: !isVariable && amount ? Number(amount.replace(/[^\d]/g, '')) : undefined,
        is_draft: isDraft,
        notes: notes || undefined,
      };
      if (via === 'card') body.source_card_id = cardId;
      else body.source_account_id = accountId;
      await api('/api/flows', { method: 'POST', body: JSON.stringify(body) });
      onDone();
    } catch (e: unknown) {
      setErr(JSON.stringify((e as { detail?: unknown }).detail ?? e));
    } finally {
      setBusy(false);
    }
  }

  const noSource = (via === 'card' && !cardId) || (via === 'account' && !accountId);

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <Field label="어디로 나가는 돈인가요? (예: 넷플릭스, 한전, ○○학원)">
        <input
          required value={merchant} onChange={(e) => setMerchant(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </Field>

      {similar.length > 0 && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
          💡 비슷한 항목이 이미 {similar.length}건 있어요. 같은 거라면 새로 등록 대신 기존 항목을 수정하세요.
        </div>
      )}

      <Field label="얼마?">
        <div className="flex items-center gap-2">
          <input
            value={amount} onChange={(e) => setAmount(e.target.value)}
            disabled={isVariable}
            inputMode="numeric" placeholder="17000"
            className="flex-1 rounded-md border border-line bg-panel2 px-3 py-2 text-right disabled:opacity-40"
          />
          <span className="text-dim">원</span>
        </div>
        <label className="mt-1 flex items-center gap-1 text-xs text-dim">
          <input type="checkbox" checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} />
          매달 달라요 (변동 금액)
        </label>
      </Field>

      <Field label="언제? (매달 N일)">
        <input
          required value={day} onChange={(e) => setDay(e.target.value)}
          inputMode="numeric"
          className="w-24 rounded-md border border-line bg-panel2 px-3 py-2 text-center"
        />
      </Field>

      <Field label="어디서 빠져요?">
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setVia('card')}
            className={`flex-1 rounded-md border py-2 ${via === 'card' ? 'border-teal text-teal' : 'border-line text-dim'}`}
          >💳 카드로</button>
          <button
            type="button"
            onClick={() => setVia('account')}
            className={`flex-1 rounded-md border py-2 ${via === 'account' ? 'border-teal text-teal' : 'border-line text-dim'}`}
          >🏦 자동이체</button>
        </div>
        {via === 'card' ? (
          <select
            value={cardId} onChange={(e) => setCardId(e.target.value)}
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
          >
            <option value="">— 카드 선택 —</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.issuer_name} {c.product_name}</option>
            ))}
          </select>
        ) : (
          <select
            value={accountId} onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
          >
            <option value="">— 계좌 선택 —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.institution_name} {a.nickname}</option>
            ))}
          </select>
        )}
        {noSource && (
          <p className="mt-1 text-xs text-warn">
            먼저 {via === 'card' ? '카드' : '계좌'}를 등록해야 합니다.
          </p>
        )}
      </Field>

      <Field label="분류">
        <select
          value={category} onChange={(e) => setCategory(e.target.value as Category)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        >
          {CATS.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </Field>

      <Field label="메모 (선택)">
        <input
          value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </Field>

      <label className="flex items-center gap-2 text-xs text-dim">
        <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />
        ⚪ 정확한 금액 모름 (초안)
      </label>

      <button
        disabled={busy || noSource} type="submit"
        className="w-full rounded-md bg-teal py-2.5 font-semibold text-bg disabled:opacity-50"
      >
        {busy ? '저장 중...' : '저장'}
      </button>
      {err && <p className="text-xs text-warn">{err}</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-dim">{label}</label>
      {children}
    </div>
  );
}
