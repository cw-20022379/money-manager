import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORY_LABEL, type Category } from '@ffn/shared';
import { ReasonModal, type ReasonResult } from './ReasonModal.js';

interface Account { id: string; nickname: string; institution_name: string }
interface Card { id: string; product_name: string; issuer_name: string }

export interface FlowInitial {
  id: string;
  version: number;
  merchant_name: string;
  amount_krw: number | null;
  amount_is_variable: boolean;
  schedule_day: number;
  source_account_id: string | null;
  source_card_id: string | null;
  category: Category;
  notes: string | null;
  is_draft: boolean;
}

interface Props {
  initial?: FlowInitial;
  onDone: () => void;
  onDelete?: () => void;
  /** P7: "나중에 - 초안으로" 핸들러 (편집 시) */
  onSaveDraft?: () => void;
}

const CATS: Category[] = [
  'UTILITY','TELECOM','INSURANCE','MEDIA','SAAS',
  'EDUCATION','LOAN','CARD_BILL','RENT','HEALTHCARE','OTHER',
];

const DEFAULT_THRESHOLD = 50_000;

export function FlowForm({ initial, onDone, onDelete }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [merchant, setMerchant] = useState(initial?.merchant_name ?? '');
  const [amount, setAmount] = useState(initial?.amount_krw?.toString() ?? '');
  const [isVariable, setIsVariable] = useState(initial?.amount_is_variable ?? false);
  const [day, setDay] = useState(initial?.schedule_day?.toString() ?? '15');
  const [via, setVia] = useState<'card' | 'account'>(initial?.source_account_id ? 'account' : 'card');
  const [cardId, setCardId] = useState<string>(initial?.source_card_id ?? '');
  const [accountId, setAccountId] = useState<string>(initial?.source_account_id ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'MEDIA');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [isDraft, setIsDraft] = useState(initial?.is_draft ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [similar, setSimilar] = useState<unknown[]>([]);
  const [pendingPatch, setPendingPatch] = useState<Record<string, unknown> | null>(null);

  const isEdit = !!initial;

  useEffect(() => {
    api<{ items: Account[] }>('/api/accounts').then((r) => {
      setAccounts(r.items);
      if (!isEdit && r.items[0] && !accountId) setAccountId(r.items[0].id);
    });
    api<{ items: Card[] }>('/api/cards').then((r) => {
      setCards(r.items);
      if (!isEdit && r.items[0] && !cardId) setCardId(r.items[0].id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEdit || !merchant || !day) { setSimilar([]); return; }
    const p = new URLSearchParams({ merchant: merchant.trim(), schedule_day: day });
    if (via === 'card' && cardId) p.set('source_card_id', cardId);
    if (via === 'account' && accountId) p.set('source_account_id', accountId);
    const t = setTimeout(() => {
      api<{ items: unknown[] }>(`/api/flows/similar?${p}`)
        .then((r) => setSimilar(r.items))
        .catch(() => setSimilar([]));
    }, 350);
    return () => clearTimeout(t);
  }, [merchant, day, via, cardId, accountId, isEdit]);

  function detectChanges(): Record<string, unknown> {
    if (!initial) return {};
    const patch: Record<string, unknown> = {};
    if (merchant !== initial.merchant_name) patch.merchant_name = merchant;
    if (Number(day) !== initial.schedule_day) patch.schedule_day = Number(day);
    if (isVariable !== initial.amount_is_variable) patch.amount_is_variable = isVariable;
    const newAmount = !isVariable && amount ? Number(amount.replace(/[^\d]/g, '')) : null;
    if (newAmount !== (initial.amount_krw ?? null)) patch.amount_krw = newAmount;
    if (category !== initial.category) patch.category = category;
    if ((notes || null) !== initial.notes) patch.notes = notes || null;
    if (isDraft !== initial.is_draft) patch.is_draft = isDraft;
    const newViaIsCard = via === 'card';
    const wasViaIsCard = !!initial.source_card_id;
    if (newViaIsCard !== wasViaIsCard ||
        (newViaIsCard && cardId !== initial.source_card_id) ||
        (!newViaIsCard && accountId !== initial.source_account_id)) {
      if (newViaIsCard) {
        patch.source_card_id = cardId;
        patch.source_account_id = null;
        patch.flow_kind = 'CARD_RECURRING';
      } else {
        patch.source_account_id = accountId;
        patch.source_card_id = null;
        patch.flow_kind = 'BANK_AUTO_TRANSFER';
      }
    }
    return patch;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (isEdit) {
      const patch = detectChanges();
      if (Object.keys(patch).length === 0) { onDone(); return; }
      setPendingPatch(patch);
      return;
    }
    setBusy(true);
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

  async function confirmPatch(r: ReasonResult) {
    if (!initial || !pendingPatch) return;
    setBusy(true);
    try {
      await api(`/api/flows/${initial.id}`, {
        method: 'PATCH',
        body: JSON.stringify(pendingPatch),
        reasonCode: r.reason,
        version: initial.version,
      });
      onDone();
    } catch (e: unknown) {
      setErr(JSON.stringify((e as { detail?: unknown }).detail ?? e));
      setPendingPatch(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsDraft() {
    if (!initial) return;
    const patch = detectChanges();
    if (Object.keys(patch).length === 0) { onDone(); return; }
    patch.is_draft = true;
    setBusy(true);
    try {
      await api(`/api/flows/${initial.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
        reasonCode: 'CORRECTION',
        version: initial.version,
      });
      setPendingPatch(null);
      onDone();
    } catch (e: unknown) {
      setErr(JSON.stringify((e as { detail?: unknown }).detail ?? e));
    } finally {
      setBusy(false);
    }
  }

  const recommend: 'LIFE_EVENT' | 'CORRECTION' = (() => {
    if (!initial) return 'LIFE_EVENT';
    const patch = detectChanges();
    if ('source_card_id' in patch || 'source_account_id' in patch || 'schedule_day' in patch) {
      return 'LIFE_EVENT';
    }
    if ('amount_krw' in patch && typeof patch.amount_krw === 'number' && initial.amount_krw != null) {
      const diff = Math.abs(patch.amount_krw - initial.amount_krw);
      return diff >= DEFAULT_THRESHOLD ? 'LIFE_EVENT' : 'CORRECTION';
    }
    return 'CORRECTION';
  })();

  const noSource = (via === 'card' && !cardId) || (via === 'account' && !accountId);

  return (
    <>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <Field label="어디로 나가는 돈인가요?">
          <input required value={merchant} onChange={(e) => setMerchant(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-body outline-none focus:border-teal" />
        </Field>

        {similar.length > 0 && (
          <div className="rounded-xl border border-warn/30 bg-[#fff9f0] p-3 text-xs text-warn">
            비슷한 항목이 이미 {similar.length}건 있어요. 같은 거라면 기존 항목을 수정하세요.
          </div>
        )}

        <Field label="얼마?">
          <div className="flex items-center gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)}
              disabled={isVariable} inputMode="numeric" placeholder="17000"
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-right text-body outline-none focus:border-teal disabled:opacity-40" />
            <span className="text-dim">원</span>
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-dim">
            <input type="checkbox" checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} />
            매달 달라요 (변동 금액)
          </label>
        </Field>

        <Field label="언제? (매달 N일)">
          <input required value={day} onChange={(e) => setDay(e.target.value)}
            inputMode="numeric"
            className="w-24 rounded-xl border border-line bg-surface px-4 py-3 text-center text-body outline-none focus:border-teal" />
        </Field>

        <Field label="어디서 빠져요?">
          <div className="mb-2 flex gap-2">
            <button type="button" onClick={() => setVia('card')}
              className={`flex-1 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                via === 'card' ? 'border-teal bg-teal/5 text-teal' : 'border-line text-dim'
              }`}>💳 카드로</button>
            <button type="button" onClick={() => setVia('account')}
              className={`flex-1 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                via === 'account' ? 'border-teal bg-teal/5 text-teal' : 'border-line text-dim'
              }`}>🏦 자동이체</button>
          </div>
          {via === 'card' ? (
            <select value={cardId} onChange={(e) => setCardId(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-body outline-none focus:border-teal">
              <option value="">— 카드 선택 —</option>
              {cards.map((c) => (<option key={c.id} value={c.id}>{c.issuer_name} {c.product_name}</option>))}
            </select>
          ) : (
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-body outline-none focus:border-teal">
              <option value="">— 계좌 선택 —</option>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.institution_name} {a.nickname}</option>))}
            </select>
          )}
          {noSource && (
            <p className="mt-1 text-xs text-bad">먼저 {via === 'card' ? '카드' : '계좌'}를 등록해야 합니다.</p>
          )}
        </Field>

        <Field label="분류">
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-body outline-none focus:border-teal">
            {CATS.map((c) => (<option key={c} value={c}>{CATEGORY_LABEL[c]}</option>))}
          </select>
        </Field>

        <Field label="메모 (선택)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-body outline-none focus:border-teal" />
        </Field>

        <label className="flex items-center gap-2 text-xs text-dim">
          <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />
          ⚪ 정확한 금액 모름 (초안)
        </label>

        <div className="flex gap-2 pt-1">
          {isEdit && onDelete && (
            <button type="button" onClick={onDelete}
              className="rounded-xl border border-bad/40 px-4 py-3 text-sm font-medium text-bad">해지</button>
          )}
          <button disabled={busy || noSource} type="submit"
            className="flex-1 rounded-xl bg-teal py-3 font-bold text-white disabled:opacity-40">
            {busy ? '저장 중...' : isEdit ? '변경 사항 확인' : '저장'}
          </button>
        </div>
        {err && <p className="text-xs text-bad">{err}</p>}
      </form>

      {pendingPatch && initial && (
        <ReasonModal
          title="정기지출 변경 사항 확인"
          detail={
            <div>
              <b className="text-teal">{initial.merchant_name}</b>
              {'amount_krw' in pendingPatch && initial.amount_krw != null && typeof pendingPatch.amount_krw === 'number' && (
                <div className="mt-1">
                  {initial.amount_krw.toLocaleString()} → {pendingPatch.amount_krw.toLocaleString()}원
                </div>
              )}
              <div className="mt-1 text-xs text-dim">
                {Object.keys(pendingPatch).join(', ')} 변경
              </div>
            </div>
          }
          recommend={recommend}
          onConfirm={confirmPatch}
          onLater={saveAsDraft}
          onCancel={() => setPendingPatch(null)}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-dim">{label}</label>
      {children}
    </div>
  );
}
