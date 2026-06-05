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
  onLater?: () => void;
  onCancel: () => void;
}

export function ReasonModal({ title, detail, recommend, onConfirm, onLater, onCancel }: Props) {
  const [reason, setReason] = useState<'LIFE_EVENT' | 'CORRECTION'>(recommend);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onCancel}>
      {detail && <div className="mb-4 rounded-2xl bg-surface p-3 text-sm">{detail}</div>}

      <p className="mb-3 text-xs font-medium text-dim">어떤 변경인가요?</p>

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

      <label className="mb-1.5 mt-4 block text-xs font-medium text-dim">한 줄 메모 (선택)</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 둘째 영어학원 추가됨"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-body outline-none focus:border-teal"
      />

      <div className="mt-5 flex gap-2">
        {onLater && (
          <button
            type="button"
            onClick={onLater}
            className="flex-1 rounded-xl border border-line py-3 text-sm font-medium text-sub"
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
          className="flex-[2] rounded-xl bg-teal py-3 font-bold text-white disabled:opacity-40"
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
      className={`mb-2 flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        active ? 'border-teal bg-teal/5' : 'border-line bg-surface'
      }`}
    >
      <div className="mt-0.5 text-base text-teal">{active ? '●' : '○'}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-bold text-body">
          <span>{icon}</span>
          <span>{label}</span>
          {isRecommend && (
            <span className="ml-1 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">추천</span>
          )}
        </div>
        <div className="mt-1 text-xs text-dim">{desc}</div>
      </div>
    </button>
  );
}
