import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PushSettings } from '../features/PushSettings.js';

export function More() {
  return (
    <div className="min-h-screen bg-bg">
      {/* 헤더 */}
      <header className="bg-panel px-5 pt-6 pb-4 shadow-[0_1px_0_#ececec]">
        <h1 className="text-xl font-bold text-kakao-dark">더보기</h1>
        <p className="text-xs text-dim mt-0.5">설정 및 기타 기능</p>
      </header>

      <div className="space-y-3 p-4 pb-24">
        {/* 메뉴 그룹 */}
        <div className="kb-card space-y-1 divide-y divide-line">
          <Link to="/history"
            className="flex items-center gap-3 py-3 transition-colors active:bg-bg">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-kakao text-lg">📜</div>
            <div>
              <div className="text-sm font-semibold text-kakao-dark">변경 기록</div>
              <div className="text-xs text-dim">내역 조회</div>
            </div>
            <span className="ml-auto text-dim">›</span>
          </Link>

          <div className="py-2">
            <PushSettings />
          </div>
        </div>

        {/* 준비 중 기능 */}
        <div className="kb-card space-y-1 divide-y divide-line opacity-60">
          <div className="flex items-center gap-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-panel2 text-lg">👥</div>
            <div>
              <div className="text-sm font-semibold text-kakao-dark">가족 구성원</div>
              <div className="text-xs text-dim">v0.2에서 만날 수 있어요</div>
            </div>
            <span className="ml-auto rounded-full bg-line px-2.5 py-0.5 text-xs text-dim">준비 중</span>
          </div>
          <div className="flex items-center gap-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-panel2 text-lg">💾</div>
            <div>
              <div className="text-sm font-semibold text-kakao-dark">데이터 내보내기</div>
              <div className="text-xs text-dim">v0.3에서 만날 수 있어요</div>
            </div>
            <span className="ml-auto rounded-full bg-line px-2.5 py-0.5 text-xs text-dim">준비 중</span>
          </div>
        </div>

        {/* 로그아웃 */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="kb-btn-danger w-full flex items-center justify-center gap-2"
        >
          <span>🚪</span> 로그아웃
        </button>

        <p className="text-center text-xs text-dim pt-2">우리 가족 금융 내비게이터 · KakaoBank Style</p>
      </div>
    </div>
  );
}
