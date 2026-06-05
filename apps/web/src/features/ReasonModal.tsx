import { useState } from 'react';
import { Modal } from '../components/Modal.js';

export interface ReasonResult {
  reason: 'LIFE_EVENT' | 'CORRECTION';
  note?: string;
}

interface Props {
  title: string;
  detail?: React.ReactNode;
  recommend: 'LIFE_EVENT' | 'CORRECTION';
  onConfirm: (r: ReasonResult) => void;
  onLater?: () => void;   // P7: "나중에 - 초안으로"
  onCancel: () => void;
}

export function ReasonModal({ title, detail, recommend, onConfirm, onLater, onCancel }: Props) {
  const [reason, setReason] = useState<'LIFE_EVENT' | 'CORRECTION'>(recommend);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onCancel}>
      {detail && <div className="mb-3 rounded-md bg-panel2 p-3 text-sm">{detail}</div>}

      <p className="mb-2 text-xs text-dim">어떤 변경인가요?</p>

      <ReasonCard
        active={reason === 'LIFE_EVENT'}
        isRecommend={recommend === 'LIFE_EVENT'}
        onClick={() => setReason('LIFE_EVENT')}
        icon="📝"
        label="가족에 알림 보내기"
        desc="진짜 바뀐 내용이에요. 배우자께 알림이 갑니다."
      />
      <ReasonCard
        active={reason === 'CORRECTION'}
        isRecommend={recommend === 'CORRECTION'}
        onClick={() => setReason('CORRECTION')}
        icon="✏️"
        label="기록만 남기기"
        desc="단순 수정·오타 정정. 알림 없음."
      />

      <label className="mb-1 mt-3 block text-xs text-dim">한 줄 메모 (선택)</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 둘째 영어학원 추가됨"
        className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm"
      />

      <div className="mt-4 flex gap-2">
        {onLater && (
          <button
            type="button"
            onClick={onLater}
            className="flex-1 rounded-md border border-line py-2 text-sm text-dim"
          >
            나중에 - 초안으로
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm({ reason, note: note || undefined }); }
            finally { setBusy(false); }
          }}
          className="flex-[2] rounded-md bg-teal py-2 font-semibold text-bg disabled:opacity-50"
        >
          {busy ? '저장 중...' : '저장'}
        </button>
      </div>
    </Modal>
  );
}

function ReasonCard({
  active, isRecommend, onClick, icon, label, desc,
}: {
  active: boolean; isRecommend: boolean; onClick: () => void;
  icon: string; label: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-2 flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left ${
        active ? 'border-teal bg-teal/5' : 'border-line bg-panel2/40'
      }`}
    >
      <div className="text-base text-teal">{active ? '●' : '○'}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{icon}</span>
          <span>{label}</span>
          {isRecommend && <span className="ml-1 rounded bg-teal/20 px-1.5 text-[10px] text-teal">⭐ 추천</span>}
        </div>
        <div className="mt-1 text-xs text-dim">{desc}</div>
      </div>
    </button>
  );
}
