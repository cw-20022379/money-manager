import { supabase } from '../lib/supabase.js';

export function More() {
  return (
    <div className="space-y-4 p-4 pb-24">
      <h1 className="text-xl text-teal">⋯ 더보기</h1>
      <div className="space-y-2 text-sm">
        <div className="rounded-md border border-line bg-panel px-3 py-2">📜 변경 기록</div>
        <div className="rounded-md border border-line bg-panel px-3 py-2">👥 가족 구성원</div>
        <div className="rounded-md border border-line bg-panel px-3 py-2">🔔 알림 설정</div>
        <div className="rounded-md border border-line bg-panel px-3 py-2">💾 데이터 내보내기</div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full rounded-md border border-bad px-3 py-2 text-left text-bad"
        >
          🚪 로그아웃
        </button>
      </div>
    </div>
  );
}
