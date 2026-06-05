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
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      {/* Backdrop tap area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md sm:rounded-[22px] animate-scale-in"
        style={{
          background: 'rgba(242,242,247,0.95)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.6)',
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 24px 64px -12px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.8)',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(60,60,67,0.18)',
            }}
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pb-3"
          style={{ borderBottom: '0.5px solid rgba(60,60,67,0.15)' }}
        >
          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: '#1c1c1e',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(118,118,128,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8e8e93',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
