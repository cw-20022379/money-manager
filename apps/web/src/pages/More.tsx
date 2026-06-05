import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PushSettings } from '../features/PushSettings.js';

export function More() {
  return (
    <div className="space-y-4 p-4 pb-24">
      <h1 className="text-xl text-teal">⋯ 더보기</h1>
      <div className="space-y-2 text-sm">
        <Link to="/history" className="block rounded-md border border-line bg-panel px-3 py-2 hover:border-teal">
          📜 변경 기록
        </Link>
        <PushSettings />
        <div className="rounded-md border border-line bg-panel px-3 py-2 text-dim">👥 가족 구성원 <span className="text-xs">(v0.2)</span></div>
        <div className="rounded-md border border-line bg-panel px-3 py-2 text-dim">💾 데이터 내보내기 <span className="text-xs">(v0.3)</span></div>
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
