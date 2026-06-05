import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PushSettings } from '../features/PushSettings.js';

export function More() {
  return (
    <div className="p-4 pb-24 max-w-[700px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold text-[#37352f]">⋯ 더보기</h1>
        <p className="text-[13px] text-[#787774] mt-0.5">설정 및 기타 기능</p>
      </div>

      {/* 섹션: 기록 */}
      <div className="mb-4">
        <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-1 px-1">
          기록
        </div>
        <div className="rounded-md border border-line divide-y divide-line">
          <Link
            to="/history"
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#37352f] hover:bg-[#f7f6f3] transition-colors"
          >
            <span>📜</span>
            <span>변경 기록</span>
          </Link>
        </div>
      </div>

      {/* 섹션: 알림 */}
      <div className="mb-4">
        <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-1 px-1">
          알림
        </div>
        <div className="rounded-md border border-line">
          <PushSettings />
        </div>
      </div>

      {/* 섹션: 예정 기능 */}
      <div className="mb-4">
        <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-1 px-1">
          예정 기능
        </div>
        <div className="rounded-md border border-line divide-y divide-line">
          <div className="flex items-center justify-between px-3 py-2.5 text-sm text-[#9b9a97]">
            <div className="flex items-center gap-2">
              <span>👥</span>
              <span>가족 구성원</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] badge-gray">v0.2</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 text-sm text-[#9b9a97]">
            <div className="flex items-center gap-2">
              <span>💾</span>
              <span>데이터 내보내기</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] badge-gray">v0.3</span>
          </div>
        </div>
      </div>

      {/* 섹션: 계정 */}
      <div className="mb-4">
        <div className="text-[11px] font-semibold text-[#787774] uppercase tracking-wide mb-1 px-1">
          계정
        </div>
        <div className="rounded-md border border-line">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left text-bad hover:bg-[#fde8e8] transition-colors rounded-md"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </div>
  );
}
