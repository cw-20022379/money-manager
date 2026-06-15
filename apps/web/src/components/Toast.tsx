/**
 * components/Toast.tsx — 토스트 알림 + 스택 효과
 *
 * 디자인 의도:
 *   - BankSalad 스타일의 다크 pill 토스트 (#1c1f26 배경 + #00d2c4 텍스트).
 *   - 토스트가 쌓이면 아래쪽이 최신, 위쪽이 오래된 순으로 스택 효과를 준다.
 *     (배열을 reverse해 마지막 항목이 최전면에 오게 함)
 *   - 최대 VISIBLE개(4)만 표시. 그 뒤는 렌더링 안 함.
 *   - 각 항목은 5초 후 자동 제거.
 *
 * 스택 시각 효과:
 *   idx=0: 최신(앞). idx 증가할수록 뒤로 밀리며 작아지고 흐려짐.
 *   translateY(-idx * STEP_Y), scale(1 - idx * STEP_SCALE), opacity 감소.
 *   zIndex를 100-idx로 줘서 앞이 위에 그려지도록 한다.
 *
 * __pushToast: 개발 중 브라우저 콘솔에서 window.__pushToast('메시지') 로 테스트 가능.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ToastItem { id: number; text: string; tone?: 'info' | 'warn' }

interface Ctx {
  push: (text: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = createContext<Ctx | null>(null);

// 스택 효과 파라미터
const VISIBLE = 4;       // 최대 표시 개수
const STEP_Y = 8;        // 뒤로 밀릴수록 올라가는 Y 간격 (px)
const STEP_SCALE = 0.04; // 뒤로 갈수록 축소 비율
const STEP_OPACITY = 0.22; // 뒤로 갈수록 불투명도 감소량

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // idRef: 렌더링을 유발하지 않는 고유 ID 카운터.
  // 같은 텍스트가 여러 번 오더라도 개별 제거가 가능하다.
  const idRef = useRef(0);

  const push = useCallback((text: string, tone?: ToastItem['tone']) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, text, tone }]);
    // 5초 후 해당 id의 항목만 제거 (다른 항목에 영향 없음).
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  useEffect(() => {
    // 개발 환경에서만 콘솔 디버그용 전역 함수를 노출한다.
    // 프로덕션 번들에는 포함되지 않는다 (Vite의 DEV 트리셰이킹).
    if (import.meta.env.DEV) {
      (window as unknown as { __pushToast?: typeof push }).__pushToast = push;
    }
  }, [push]);

  // 배열을 뒤집어서 가장 최신 토스트(배열 끝)가 idx=0(최전면)에 오게 한다.
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

/**
 * 현재 탭이 사용자에게 보이는지 여부를 추적한다.
 * 탭이 백그라운드로 가면 Realtime 구독을 잠시 멈추거나
 * 불필요한 폴링을 줄이는 데 활용할 수 있다. (현재는 구독에 사용되지 않으나 확장 예정)
 */
export function useDocumentVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
