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
  // ESC 키만 유지. 바깥 클릭으로 닫히지 않음 (작성 중 실수 방지).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-4xl bg-panel p-6 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] sm:rounded-4xl">
        {/* 드래그 핸들 (모바일 바텀 시트 느낌) */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-kakao-dark">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-panel2 text-dim hover:bg-line transition-colors"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
