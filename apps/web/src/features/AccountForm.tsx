import { useState } from 'react';
import { api } from '../lib/api.js';
import { BANK_PRESETS, normalizeAccountNumber } from '../lib/presets.js';
import { InstitutionSelect } from '../components/InstitutionSelect.js';
import { ReasonModal, type ReasonResult } from './ReasonModal.js';

export interface AccountInitial {
  id: string;
  version: number;
  institution_name: string;
  account_type: 'CHECKING' | 'SAVINGS' | 'LOAN' | 'OTHER';
  nickname: string;
  account_number_masked: string | null;
  balance_krw: number | null;
}

interface Props {
  initial?: AccountInitial;
  onDone: () => void;
  onDelete?: () => void;
}

const TYPES = [
  { v: 'CHECKING', t: '입출금' },
  { v: 'SAVINGS', t: '저축·적금' },
  { v: 'LOAN', t: '대출' },
  { v: 'OTHER', t: '기타' },
] as const;

export function AccountForm({ initial, onDone, onDelete }: Props) {
  const [institution, setInstitution] = useState(initial?.institution_name ?? '');
  const [type, setType] = useState<typeof TYPES[number]['v']>(initial?.account_type ?? 'CHECKING');
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [accountNum, setAccountNum] = useState(initial?.account_number_masked ?? '');
  const [balance, setBalance] = useState(initial?.balance_krw?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pendingPatch, setPendingPatch] = useState<Record<string, unknown> | null>(null);

  const isEdit = !!initial;

  function detectChanges(): Record<string, unknown> {
    if (!initial) return {};
    const patch: Record<string, unknown> = {};
    if (institution !== initial.institution_name) patch.institution_name = institution;
    if (type !== initial.account_type) patch.account_type = type;
    if (nickname !== initial.nickname) patch.nickname = nickname;
    if (accountNum !== (initial.account_number_masked ?? ''))
      patch.account_number_masked = accountNum || null;
    const newBal = balance ? Number(balance.replace(/[^\d]/g, '')) : null;
    if (newBal !== (initial.balance_krw ?? null)) patch.balance_krw = newBal;
    return patch;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (isEdit) {
      const patch = detectChanges();
      if (Object.keys(patch).length === 0) {
        onDone();
        return;
      }
      setPendingPatch(patch);
      return;
    }
    setBusy(true);
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

  async function confirmPatch(r: ReasonResult) {
    if (!initial || !pendingPatch) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/api/accounts/${initial.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...pendingPatch, ...(r.note ? { _note: r.note } : {}) }),
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

  const recommend: 'LIFE_EVENT' | 'CORRECTION' = (() => {
    if (!initial) return 'LIFE_EVENT';
    const patch = detectChanges();
    if ('balance_krw' in patch || 'account_type' in patch) return 'LIFE_EVENT';
    return 'CORRECTION';
  })();

  return (
    <>
      <form onSubmit={submit} className="space-y-4 text-sm">
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
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  type === t.v
                    ? 'border-teal bg-teal/5 text-teal'
                    : 'border-line text-dim'
                }`}
              >{t.t}</button>
            ))}
          </div>
        </Field>

        <Field label="별명 (예: 주거래, 비상금)">
          <input
            required value={nickname} onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-body outline-none focus:border-teal"
          />
        </Field>

        <Field label="계좌번호 (선택, 대시 없이)">
          <input
            inputMode="numeric"
            value={accountNum}
            onChange={(e) => setAccountNum(normalizeAccountNumber(e.target.value))}
            placeholder="11034567890"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 font-mono text-body outline-none focus:border-teal"
          />
        </Field>

        <Field label="잔액 (선택, 원)">
          <input
            value={balance} onChange={(e) => setBalance(e.target.value)}
            inputMode="numeric" placeholder="0"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-right text-body outline-none focus:border-teal"
          />
        </Field>

        <div className="flex gap-2 pt-1">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border border-bad/40 px-4 py-3 text-sm font-medium text-bad"
            >해지</button>
          )}
          <button
            disabled={busy || !institution} type="submit"
            className="flex-1 rounded-xl bg-teal py-3 font-bold text-white disabled:opacity-40"
          >
            {busy ? '저장 중...' : isEdit ? '변경 사항 확인' : '저장'}
          </button>
        </div>
        {err && <p className="text-xs text-bad">{err}</p>}
      </form>

      {pendingPatch && initial && (
        <ReasonModal
          title="계좌 변경 사항 확인"
          detail={
            <div>
              <b className="text-teal">{initial.nickname}</b>
              <div className="mt-1 text-xs text-dim">
                {Object.keys(pendingPatch).join(', ')} 변경
              </div>
            </div>
          }
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
      <label className="mb-1.5 block text-xs font-medium text-dim">{label}</label>
      {children}
    </div>
  );
}
