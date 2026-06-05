import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CARD_ISSUER_PRESETS, formatCardNumber } from '../lib/presets.js';
import { InstitutionSelect } from '../components/InstitutionSelect.js';

interface Account { id: string; nickname: string; institution_name: string }
interface Props { onDone: () => void }

const TYPES = [
  { v: 'CREDIT', t: '신용카드' },
  { v: 'CHECK', t: '체크카드' },
  { v: 'OTHER', t: '기타' },
] as const;

export function CardForm({ onDone }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [issuer, setIssuer] = useState('');
  const [type, setType] = useState<typeof TYPES[number]['v']>('CREDIT');
  const [product, setProduct] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [billingAccountId, setBillingAccountId] = useState<string>('');
  const [dueDay, setDueDay] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{ items: Account[] }>('/api/accounts').then((r) => setAccounts(r.items));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
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

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <Field label="카드사">
        <InstitutionSelect
          presets={CARD_ISSUER_PRESETS}
          value={issuer}
          onChange={setIssuer}
          placeholder="카드사 직접 입력"
        />
      </Field>

      <Field label="종류">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.v} type="button" onClick={() => setType(t.v)}
              className={`rounded-md border px-3 py-1.5 ${type === t.v ? 'border-teal text-teal' : 'border-line text-dim'}`}
            >{t.t}</button>
          ))}
        </div>
      </Field>

      <Field label="카드 상품명 (예: The More 카드)">
        <input
          required value={product} onChange={(e) => setProduct(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </Field>

      <Field label="카드번호 (선택, 별표(*) 사용 가능 — 4자리마다 자동 대시)">
        <input
          inputMode="text"
          value={cardNum}
          onChange={(e) => setCardNum(formatCardNumber(e.target.value))}
          placeholder="5325********1234"
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2 font-mono"
        />
      </Field>

      <Field label="대금 결제 계좌 (선택)">
        <select
          value={billingAccountId} onChange={(e) => setBillingAccountId(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        >
          <option value="">— 선택 안 함 —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.institution_name} {a.nickname}</option>
          ))}
        </select>
      </Field>

      <Field label="결제일 (선택, 매월 N일)">
        <input
          value={dueDay} onChange={(e) => setDueDay(e.target.value)}
          inputMode="numeric" placeholder="15"
          className="w-32 rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </Field>

      <button disabled={busy || !issuer} className="w-full rounded-md bg-teal py-2.5 font-semibold text-bg disabled:opacity-50">
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
