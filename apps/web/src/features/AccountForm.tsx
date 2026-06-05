import { useState } from 'react';
import { api } from '../lib/api.js';
import { BANK_PRESETS, normalizeAccountNumber } from '../lib/presets.js';
import { InstitutionSelect } from '../components/InstitutionSelect.js';

interface Props {
  onDone: () => void;
}

const TYPES = [
  { v: 'CHECKING', t: '입출금' },
  { v: 'SAVINGS', t: '저축·적금' },
  { v: 'LOAN', t: '대출' },
  { v: 'OTHER', t: '기타' },
] as const;

export function AccountForm({ onDone }: Props) {
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<typeof TYPES[number]['v']>('CHECKING');
  const [nickname, setNickname] = useState('');
  const [accountNum, setAccountNum] = useState('');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          institution_name: institution,
          account_type: type,
          nickname,
          account_number_masked: accountNum || undefined,
          balance_krw: balance ? Number(balance.replace(/[^\d]/g, '')) : undefined,
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
      <Field label="은행">
        <InstitutionSelect
          presets={BANK_PRESETS}
          value={institution}
          onChange={setInstitution}
          placeholder="은행 이름 직접 입력"
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

      <Field label="별명 (예: 주거래, 비상금)">
        <input
          required value={nickname} onChange={(e) => setNickname(e.target.value)}
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2"
        />
      </Field>

      <Field label="계좌번호 (선택, 일부만 적어도 됨 — 대시 없이)">
        <input
          inputMode="numeric"
          value={accountNum}
          onChange={(e) => setAccountNum(normalizeAccountNumber(e.target.value))}
          placeholder="11034567890 또는 1103***7890"
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2 font-mono"
        />
      </Field>

      <Field label="잔액 (선택, 원)">
        <input
          value={balance} onChange={(e) => setBalance(e.target.value)}
          inputMode="numeric" placeholder="0"
          className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-right"
        />
      </Field>

      <button disabled={busy || !institution} className="w-full rounded-md bg-teal py-2.5 font-semibold text-bg disabled:opacity-50">
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
