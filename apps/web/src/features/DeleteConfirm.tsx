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
      <div className="mb-4 rounded border border-[#fde8e8] bg-[#fde8e8] bg-opacity-40 p-3 text-sm">
        <b className="text-bad">{subjectLabel}</b>
        <div className="mt-1 text-xs text-[#787774]">
          정말 해지할까요? (소프트 삭제 — 변경 기록에 보존됨)
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded border border-line py-2 text-sm text-[#787774] hover:bg-[#f7f6f3] transition-colors"
        >
          취소
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex-[2] rounded bg-bad py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-[#c82020] transition-colors"
        >
          {busy ? '해지 중...' : '예, 해지합니다'}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Modal>
  );
}
