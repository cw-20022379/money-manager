/**
 * components/BottomNav.tsx — 하단 내비게이션 바
 *
 * 설계 의도:
 *   - 모바일 PWA의 기본 탐색 수단. 최대 700px 폭으로 데스크탑도 지원.
 *   - active 상태: 아이콘 fill 색상 + 탭 상단 인디케이터 라인 + 텍스트 색상 변경.
 *   - paddingBottom: env(safe-area-inset-bottom) — iPhone 홈 바 영역 침범 방지 (PWA 필수).
 *   - NavLink의 isActive 콜백으로 현재 경로를 추적. History·Members·Split은
 *     탭에 직접 노출되지 않으므로 해당 경로에서는 아무 탭도 active 아님.
 */
import { NavLink } from 'react-router-dom';

const tabs = [
  {
    to: '/home',
    label: '홈',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 21V12h6v9"
          stroke={active ? '#ffffff' : '#94a3b8'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: '/flow',
    label: '흐름도',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect
          x="2" y="7" width="6" height="4" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
        <rect
          x="9" y="3" width="6" height="4" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
        <rect
          x="9" y="11" width="6" height="4" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
        <rect
          x="9" y="17" width="6" height="4" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
        <path d="M8 9h1M8 13h1M15 5h1M15 13h1M15 19h1" stroke={active ? '#94a3b8' : '#cbd5e1'} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    to: '/list',
    label: '목록',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect
          x="3" y="4" width="18" height="3.5" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
        <rect
          x="3" y="10" width="18" height="3.5" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
        <rect
          x="3" y="16" width="18" height="3.5" rx="1.5"
          fill={active ? '#00d2c4' : 'none'}
          stroke={active ? '#00d2c4' : '#94a3b8'}
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    to: '/more',
    label: '더보기',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="5" cy="12" r="2" fill={active ? '#00d2c4' : '#94a3b8'} />
        <circle cx="12" cy="12" r="2" fill={active ? '#00d2c4' : '#94a3b8'} />
        <circle cx="19" cy="12" r="2" fill={active ? '#00d2c4' : '#94a3b8'} />
      </svg>
    ),
  },
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-[700px] justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 flex-1 py-2 text-[11px] font-medium transition-colors duration-150 ${
                isActive ? 'text-teal' : 'text-dim2'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* 상단 인디케이터 라인 */}
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-b-full transition-all duration-200"
                  style={{
                    width: isActive ? '24px' : '0px',
                    background: '#00d2c4',
                  }}
                />
                {t.icon(isActive)}
                <span>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
