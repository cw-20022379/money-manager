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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-lg border border-line bg-bg p-5 sm:rounded-lg shadow-notion">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#37352f]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[#9b9a97] hover:text-[#37352f] transition-colors text-base leading-none"
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
