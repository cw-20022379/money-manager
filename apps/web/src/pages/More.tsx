import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PushSettings } from '../features/PushSettings.js';

export function More() {
  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="pt-2">
        <h1 className="text-2xl font-bold tracking-tight text-body">더보기</h1>
      </div>

      {/* 메뉴 그룹 */}
      <div className="rounded-2xl border border-line bg-bg overflow-hidden">
        <Link
          to="/history"
          className="flex items-center justify-between px-4 py-3.5 text-sm font-medium text-body transition-colors active:bg-surface border-b border-line"
        >
          <span>📜 변경 기록</span>
          <span className="text-dim">›</span>
        </Link>
        <div className="border-b border-line">
          <PushSettings />
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 text-sm text-dim border-b border-line">
          <span>👥 가족 구성원</span>
          <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-dim">v0.2</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 text-sm text-dim">
          <span>💾 데이터 내보내기</span>
          <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-dim">v0.3</span>
        </div>
      </div>

      {/* 로그아웃 */}
      <button
        onClick={() => supabase.auth.signOut()}
        className="w-full rounded-2xl border border-bad/40 bg-bg py-3.5 text-sm font-medium text-bad transition-colors active:bg-[#fff0f1]"
      >
        🚪 로그아웃
      </button>
    </div>
  );
}
