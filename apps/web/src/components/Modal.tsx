import { useEffect } from 'react';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" style={{ background: 'rgba(28,31,38,0.5)' }}>
      {/* Sheet 모달 — 바텀 시트 스타일 */}
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          {/* 바텀 시트 핸들 (모바일) */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-line sm:hidden" />
          <h3 className="text-[15px] font-semibold text-body" style={{ letterSpacing: '-0.02em' }}>{title}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-dim2 hover:bg-panel2 transition-colors"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {/* 본문 */}
        <div className="px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
