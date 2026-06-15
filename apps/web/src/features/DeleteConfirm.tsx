/**
 * features/DeleteConfirm.tsx — 해지 확인 모달
 *
 * 정기지출·계좌·카드의 소프트 삭제(해지)를 확인하는 공용 모달.
 * 소프트 삭제: DB에서 실제로 지우지 않고 deleted_at 타임스탬프를 기록.
 *   → 변경 기록(History)에서 "해지 직전" 상태를 볼 수 있다.
 *   → 실수 해지 시 백엔드에서 복구 가능.
 *
 * reasonCode는 항상 LIFE_EVENT로 고정한다.
 *   해지는 중요한 가족 변경이므로 배우자에게 항상 알림이 간다.
 *   CORRECTION으로 조용히 삭제하는 경우는 상정하지 않는다.
 *
 * version: 낙관적 잠금. 수정 모달에서 해지 모달로 전환할 때 원본 버전을 전달받는다.
 *   List.tsx의 EditState: 'delete' 에서 version을 관리한다.
 */
import { useState } from 'react';
import { Modal } from '../components/Modal.js';
import { api } from '../lib/api.js';

interface Props {
  title: string;
  subjectLabel: string;
  endpoint: string;        // 예: /api/flows/<uuid>
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
      <div className="mb-4 rounded-md bg-panel2 p-3 text-sm">
        <b className="text-bad">{subjectLabel}</b>
        <div className="mt-1 text-xs text-dim">정말 해지할까요? (소프트 삭제 — 변경 기록에 보존됨)</div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-md border border-line py-2 text-sm">
          취소
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex-[2] rounded-md bg-bad py-2 font-semibold text-bg disabled:opacity-50"
        >
          {busy ? '해지 중...' : '예, 해지합니다'}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-warn">{err}</p>}
    </Modal>
  );
}
