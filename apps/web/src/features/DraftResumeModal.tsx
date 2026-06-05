import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal.js';
import { api } from '../lib/api.js';
import { useNavigate } from 'react-router-dom';

interface DraftFlow {
  id: string;
  merchant_name: string;
  created_at: string;
}

/**
 * P6: 홈 진입 시 초안(is_draft=true) 1건 이상이면 "이어서 작성?" 모달.
 * 클릭 시 sessionStorage에 id 저장 + /list 이동 → List가 자동으로 편집 모달 오픈.
 */
export function DraftResumeBanner() {
  const [drafts, setDrafts] = useState<DraftFlow[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ items: DraftFlow[] }>('/api/flows?is_draft=true&limit=5')
      .then((r) => setDrafts(r.items))
      .catch(() => setDrafts([]));
  }, []);

  if (dismissed || !drafts || drafts.length === 0) return null;
  const first = drafts[0]!;
  const ago = friendlyAgo(first.created_at);

  return (
    <Modal title="↪️ 작성 중이던 항목이 있어요" onClose={() => setDismissed(true)}>
      <div className="rounded-md bg-panel2 p-3 text-sm">
        <div><b className="text-teal">{first.merchant_name}</b> <span className="text-dim">· 시작: {ago}</span></div>
        {drafts.length > 1 && (
          <div className="mt-1 text-xs text-dim">외 {drafts.length - 1}건의 초안</div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => setDismissed(true)}
          className="flex-1 rounded-md border border-line py-2 text-sm">
          나중에
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem('ffn:edit-flow', first.id);
            navigate('/list');
          }}
          className="flex-[2] rounded-md bg-teal py-2 font-semibold text-bg">
          이어서 작성
        </button>
      </div>
    </Modal>
  );
}

function friendlyAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const h = diffMs / 3600_000;
  if (h < 1) return `${Math.floor(diffMs / 60_000)}분 전`;
  if (h < 24) return `${Math.floor(h)}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return iso.slice(0, 10);
}
