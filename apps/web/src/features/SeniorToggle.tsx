import { useState } from 'react';
import { isSenior, setSenior } from '../lib/senior.js';
import { useToast } from '../components/Toast.js';

/** 큰 글씨 모드 토글 (시니어 모드). More 탭에서 사용. */
export function SeniorToggle() {
  const [on, setOn] = useState(isSenior());
  const toast = useToast();

  function toggle() {
    const next = !on;
    setOn(next);
    setSenior(next);
    toast.push(next ? '🔎 큰 글씨 모드를 켰어요' : '큰 글씨 모드를 껐어요');
  }

  return (
    <button onClick={toggle} className="flex w-full items-center justify-between px-4 py-3.5 text-left">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: '#f0fdf4' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M4 7V5a1 1 0 011-1h14a1 1 0 011 1v2M9 20h6M12 4v16" stroke="#00d2c4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: '#1c1f26' }}>큰 글씨 모드</div>
          <div className="mt-0.5 text-[11px] text-dim">화면 전체를 크게 — 어르신·노안 가독성</div>
        </div>
      </div>
      {/* 스위치 */}
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: on ? '#00d2c4' : '#cbd5e1' }}>
        <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: on ? 'translateX(22px)' : 'translateX(2px)' }} />
      </span>
    </button>
  );
}
