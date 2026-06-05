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
      {detail && (
        <div className="mb-3 rounded border border-line bg-[#f7f6f3] p-3 text-sm">
          {detail}
        </div>
      )}

      <p className="mb-2 text-xs text-[#787774]">어떤 변경인가요?</p>

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

      <label className="mb-1 mt-3 block text-xs text-[#787774]">한 줄 메모 (선택)</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 둘째 영어학원 추가됨"
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-[#37352f] placeholder:text-[#9b9a97] focus:border-teal focus:outline-none transition-colors"
      />

      <div className="mt-4 flex gap-2">
        {onLater && (
          <button
            type="button"
            onClick={onLater}
            className="flex-1 rounded border border-line py-2 text-sm text-[#787774] hover:bg-[#f7f6f3] transition-colors"
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
          className="flex-[2] rounded bg-[#37352f] py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-[#2f2c28] transition-colors"
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
      className={`mb-2 flex w-full items-start gap-3 rounded border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-teal bg-[#dbeafe] bg-opacity-30'
          : 'border-line bg-bg hover:bg-[#f7f6f3]'
      }`}
    >
      <div className={`text-sm mt-0.5 ${active ? 'text-teal' : 'text-[#9b9a97]'}`}>
        {active ? '●' : '○'}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-[#37352f]">
          <span>{icon}</span>
          <span>{label}</span>
          {isRecommend && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] badge-blue">추천</span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-[#787774]">{desc}</div>
      </div>
    </button>
  );
}
