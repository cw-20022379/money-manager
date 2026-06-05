import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ToastItem { id: number; text: string; tone?: 'info' | 'warn' }

interface Ctx {
  push: (text: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<Ctx | null>(null);

const VISIBLE = 4;
const STEP_Y = 6;
const STEP_SCALE = 0.035;
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
      {/* iOS HUD-style toast — glass capsule above BottomNav */}
      <div className="pointer-events-none fixed bottom-24 left-0 right-0 z-50 flex justify-center">
        <div className="relative h-0 w-[min(380px,calc(100vw-3rem))]">
          {stack.map((t, idx) => {
            if (idx >= VISIBLE) return null;
            const opacity = idx === 0 ? 1 : Math.max(1 - idx * STEP_OPACITY, 0.25);
            const isWarn = t.tone === 'warn';
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
                  transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease',
                }}
                className={`pointer-events-auto flex justify-center ${idx === 0 ? 'animate-toast' : ''}`}
              >
                <div
                  style={{
                    background: isWarn
                      ? 'rgba(30, 22, 5, 0.86)'
                      : 'rgba(20, 20, 22, 0.86)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    borderRadius: 100,
                    border: `1px solid ${isWarn ? 'rgba(255,149,0,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    boxShadow: '0 8px 32px -4px rgba(0,0,0,0.4)',
                    padding: '9px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    maxWidth: '100%',
                  }}
                >
                  {/* Status dot */}
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: isWarn ? '#ff9500' : '#34c759',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.text}
                  </span>
                </div>
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
