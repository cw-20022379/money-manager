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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-line bg-bg p-6 sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold text-body">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-panel2 text-dim hover:bg-line"
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
