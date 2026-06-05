import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ToastItem { id: number; text: string; tone?: 'info' | 'warn' }

interface Ctx {
  push: (text: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<Ctx | null>(null);

const VISIBLE = 4;
const STEP_Y = 8;
const STEP_SCALE = 0.04;
const STEP_OPACITY = 0.22;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((text: string, tone?: ToastItem['tone']) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __pushToast?: typeof push }).__pushToast = push;
    }
  }, [push]);

  const stack = [...items].reverse();

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-20 left-0 right-0 z-50 flex justify-center">
        <div className="relative h-0 w-[min(420px,calc(100vw-2rem))]">
          {stack.map((t, idx) => {
            if (idx >= VISIBLE) return null;
            const opacity = idx === 0 ? 1 : Math.max(1 - idx * STEP_OPACITY, 0.3);
            return (
              <div
                key={t.id}
                data-testid="toast"
                data-toast-depth={idx}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${-idx * STEP_Y}px) scale(${1 - idx * STEP_SCALE})`,
                  transformOrigin: 'bottom center',
                  opacity,
                  zIndex: 100 - idx,
                  transition: 'transform 180ms ease, opacity 180ms ease',
                }}
                className="pointer-events-auto flex justify-center"
              >
                <span
                  className={`inline-flex items-center gap-2 max-w-full truncate rounded-full px-5 py-2.5 text-sm font-medium shadow-lg ${
                    t.tone === 'warn'
                      ? 'bg-[#1c1f26] text-[#f59e0b]'
                      : 'bg-[#1c1f26] text-[#00d2c4]'
                  }`}
                  style={{ letterSpacing: '-0.01em' }}
                >
                  {/* 그린 도트 액센트 */}
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: t.tone === 'warn' ? '#f59e0b' : '#00d2c4' }}
                  />
                  {t.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider missing');
  return ctx;
}

export function useDocumentVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
