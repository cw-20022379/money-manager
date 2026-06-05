import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CARD_ISSUER_PRESETS, formatCardNumber } from '../lib/presets.js';
import { InstitutionSelect } from '../components/InstitutionSelect.js';
import { ReasonModal, type ReasonResult } from './ReasonModal.js';

interface Account { id: string; nickname: string; institution_name: string }

export interface CardInitial {
  id: string;
  version: number;
  issuer_name: string;
  card_type: 'CREDIT' | 'CHECK' | 'OTHER';
  product_name: string;
  card_number_masked: string | null;
  billing_account_id: string | null;
  payment_due_day: number | null;
}

interface Props {
  initial?: CardInitial;
  onDone: () => void;
  onDelete?: () => void;
}

const TYPES = [
  { v: 'CREDIT', t: '신용카드' },
  { v: 'CHECK', t: '체크카드' },
  { v: 'OTHER', t: '기타' },
] as const;

export function CardForm({ initial, onDone, onDelete }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [issuer, setIssuer] = useState(initial?.issuer_name ?? '');
  const [type, setType] = useState<typeof TYPES[number]['v']>(initial?.card_type ?? 'CREDIT');
  const [product, setProduct] = useState(initial?.product_name ?? '');
  const [cardNum, setCardNum] = useState(initial?.card_number_masked ?? '');
  const [billingAccountId, setBillingAccountId] = useState<string>(initial?.billing_account_id ?? '');
  const [dueDay, setDueDay] = useState<string>(initial?.payment_due_day?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pendingPatch, setPendingPatch] = useState<Record<string, unknown> | null>(null);

  const isEdit = !!initial;

  useEffect(() => {
    api<{ items: Account[] }>('/api/accounts').then((r) => setAccounts(r.items));
  }, []);

  function detectChanges(): Record<string, unknown> {
    if (!initial) return {};
    const patch: Record<string, unknown> = {};
    if (issuer !== initial.issuer_name) patch.issuer_name = issuer;
    if (type !== initial.card_type) patch.card_type = type;
    if (product !== initial.product_name) patch.product_name = product;
    if (cardNum !== (initial.card_number_masked ?? '')) patch.card_number_masked = cardNum || null;
    if (billingAccountId !== (initial.billing_account_id ?? ''))
      patch.billing_account_id = billingAccountId || null;
    const newDue = dueDay ? Number(dueDay) : null;
    if (newDue !== (initial.payment_due_day ?? null)) patch.payment_due_day = newDue;
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
      await api('/api/cards', {
        method: 'POST',
        body: JSON.stringify({
          issuer_name: issuer,
          card_type: type,
          product_name: product,
          card_number_masked: cardNum || undefined,
          billing_account_id: billingAccountId || undefined,
          payment_due_day: dueDay ? Number(dueDay) : undefined,
        }),
      });
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
      await api(`/api/cards/${initial.id}`, {
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

  // 결제일·결제계좌·발급사 변경은 LIFE_EVENT, 그 외는 CORRECTION
  const recommend: 'LIFE_EVENT' | 'CORRECTION' = (() => {
    if (!initial) return 'LIFE_EVENT';
    const patch = detectChanges();
    if ('billing_account_id' in patch || 'payment_due_day' in patch || 'issuer_name' in patch) {
      return 'LIFE_EVENT';
    }
    return 'CORRECTION';
  })();

  return (
    <>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <Field label="카드사">
          <InstitutionSelect presets={CARD_ISSUER_PRESETS} value={issuer} onChange={setIssuer} placeholder="카드사 직접 입력" />
        </Field>

        <Field label="종류">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button key={t.v} type="button" onClick={() => setType(t.v)}
                className={`rounded-md border px-3 py-1.5 ${type === t.v ? 'border-teal text-teal' : 'border-line text-dim'}`}>{t.t}</button>
            ))}
          </div>
        </Field>

        <Field label="카드 상품명">
          <input required value={product} onChange={(e) => setProduct(e.target.value)}
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2" />
        </Field>

        <Field label="카드번호 (선택, 4자리마다 자동 대시)">
          <input inputMode="text" value={cardNum} onChange={(e) => setCardNum(formatCardNumber(e.target.value))}
            placeholder="5325********1234"
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2 font-mono" />
        </Field>

        <Field label="대금 결제 계좌 (선택)">
          <select value={billingAccountId} onChange={(e) => setBillingAccountId(e.target.value)}
            className="w-full rounded-md border border-line bg-panel2 px-3 py-2">
            <option value="">— 선택 안 함 —</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.institution_name} {a.nickname}</option>))}
          </select>
        </Field>

        <Field label="결제일 (매월 N일)">
          <input value={dueDay} onChange={(e) => setDueDay(e.target.value)}
            inputMode="numeric" placeholder="15"
            className="w-32 rounded-md border border-line bg-panel2 px-3 py-2" />
        </Field>

        <div className="flex gap-2">
          {isEdit && onDelete && (
            <button type="button" onClick={onDelete}
              className="rounded-md border border-bad px-3 py-2.5 text-sm text-bad">해지</button>
          )}
          <button disabled={busy || !issuer} type="submit"
            className="flex-1 rounded-md bg-teal py-2.5 font-semibold text-bg disabled:opacity-50">
            {busy ? '저장 중...' : isEdit ? '변경 사항 확인' : '저장'}
          </button>
        </div>
        {err && <p className="text-xs text-warn">{err}</p>}
      </form>

      {pendingPatch && initial && (
        <ReasonModal
          title="카드 변경 사항 확인"
          detail={<div><b className="text-teal">{initial.product_name}</b><div className="mt-1 text-xs text-dim">{Object.keys(pendingPatch).join(', ')} 변경</div></div>}
          recommend={recommend}
          onConfirm={confirmPatch}
          onCancel={() => setPendingPatch(null)}
        />
      )}
    </>
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
