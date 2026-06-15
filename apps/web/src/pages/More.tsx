import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PushSettings } from '../features/PushSettings.js';

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  badge?: string;
  disabled?: boolean;
  danger?: boolean;
  href?: string;
  onClick?: () => void;
}

function MenuRow({ item }: { item: MenuItem }) {
  const inner = (
    <div
      className={`flex items-center gap-3 w-full rounded-xl px-4 py-3.5 text-left transition-all duration-150 ${
        item.disabled
          ? 'opacity-50 cursor-not-allowed'
          : item.danger
          ? 'hover:bg-red-50'
          : 'hover:bg-panel'
      }`}
      style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
    >
      {/* 아이콘 */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: item.danger ? '#fef2f2' : '#f0fdf4',
        }}
      >
        {item.icon}
      </div>

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] font-semibold"
          style={{ color: item.danger ? '#ef4444' : '#1c1f26' }}
        >
          {item.label}
        </div>
        {item.sub && (
          <div className="text-[11px] text-dim mt-0.5">{item.sub}</div>
        )}
      </div>

      {/* 배지 또는 화살표 */}
      {item.badge ? (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: '#f1f5f9', color: '#94a3b8' }}
        >
          {item.badge}
        </span>
      ) : !item.danger && !item.disabled ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : null}
    </div>
  );

  if (item.href) {
    return <Link to={item.href} className="block">{inner}</Link>;
  }
  if (item.onClick) {
    return <button className="block w-full" onClick={item.onClick}>{inner}</button>;
  }
  return <div>{inner}</div>;
}

export function More() {
  return (
    <div className="space-y-4 p-4 pb-24 fade-up" style={{ background: '#f8fafc', minHeight: '100%' }}>
      {/* 헤더 */}
      <div className="pt-1">
        <p className="text-[11px] font-medium text-dim uppercase tracking-wide">설정</p>
        <h1
          className="text-[20px] font-bold text-body leading-tight"
          style={{ letterSpacing: '-0.03em' }}
        >
          더보기
        </h1>
      </div>

      {/* 프로필 카드 */}
      <div
        className="rounded-xl px-4 py-4 flex items-center gap-3"
        style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          border: '1px solid #bbf7d0',
        }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-[16px] font-bold"
          style={{ background: '#00d2c4', color: '#ffffff' }}
        >
          가
        </div>
        <div>
          <div className="text-[15px] font-bold text-body">우리 가족</div>
          <div className="text-[12px] text-dim mt-0.5">금융 내비게이터</div>
        </div>
        <div className="ml-auto">
          <div
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: '#ffffff', color: '#00d2c4', border: '1px solid #bbf7d0' }}
          >
            활성
          </div>
        </div>
      </div>

      {/* 섹션: 데이터 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-dim uppercase tracking-wide px-1">데이터</p>
        <MenuRow item={{
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="#00d2c4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ),
          label: '변경 기록',
          sub: '등록·수정·해지 이력',
          href: '/history',
        }} />
        <MenuRow item={{
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="#94a3b8" strokeWidth="1.8"/>
              <path d="M8 12h8M8 8h8M8 16h4" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          ),
          label: '데이터 내보내기',
          sub: 'CSV / JSON 내보내기',
          badge: 'v0.3',
          disabled: true,
        }} />
      </div>

      {/* 섹션: 알림 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-dim uppercase tracking-wide px-1">알림</p>
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #e2e8f0', background: '#ffffff' }}
        >
          <PushSettings />
        </div>
      </div>

      {/* 섹션: 가족 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-dim uppercase tracking-wide px-1">가족</p>
        <MenuRow item={{
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="9" cy="7" r="4" stroke="#94a3b8" strokeWidth="1.8"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ),
          label: '가족 구성원',
          sub: '멤버 관리 및 초대',
          href: '/members',
        }} />
        <MenuRow item={{
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v20M2 12h20" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="12" cy="12" r="9" stroke="#94a3b8" strokeWidth="1.8"/>
            </svg>
          ),
          label: '지출 분담',
          sub: '남편·아내·공동 부담 집계',
          href: '/split',
        }} />
      </div>

      {/* 로그아웃 */}
      <div className="space-y-1.5">
        <MenuRow item={{
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ),
          label: '로그아웃',
          danger: true,
          onClick: () => supabase.auth.signOut(),
        }} />
      </div>

      {/* 버전 */}
      <div className="text-center text-[10px] text-dim2 pb-2">
        우리 가족 금융 내비게이터 v0.1.1
      </div>
    </div>
  );
}
