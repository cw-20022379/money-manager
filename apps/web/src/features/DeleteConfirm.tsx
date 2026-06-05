import { useState } from 'react';
import { Modal } from '../components/Modal.js';
import { api } from '../lib/api.js';

interface Props {
  title: string;
  subjectLabel: string;
  endpoint: string;
  version: number;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * 해지(소프트 삭제) 확인 모달. 사유 필수 (LIFE_EVENT 디폴트).
 */
export function DeleteConfirm({ title, subjectLabel, endpoint, version, onDone, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function confirm() {
    setBusy(true);
    setErr('');
    try {
      await api(endpoint, {
        method: 'DELETE',
        reasonCode: 'LIFE_EVENT',
        version,
      });
      onDone();
    } catch (e: unknown) {
      setErr(JSON.stringify((e as { detail?: unknown }).detail ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="mb-5 rounded-2xl bg-[#fff0f1] p-4 text-sm">
        <b className="text-bad">{subjectLabel}</b>
        <div className="mt-1 text-xs text-dim">정말 해지할까요? (소프트 삭제 — 변경 기록에 보존됨)</div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-line py-3 text-sm font-medium text-sub">
          취소
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex-[2] rounded-xl bg-bad py-3 font-bold text-white disabled:opacity-40"
        >
          {busy ? '해지 중...' : '예, 해지합니다'}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Modal>
  );
}
