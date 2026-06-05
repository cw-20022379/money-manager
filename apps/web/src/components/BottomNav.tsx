import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/home', icon: '🏠', label: '홈' },
  { to: '/flow', icon: '🌊', label: '흐름도' },
  { to: '/list', icon: '📋', label: '목록' },
  { to: '/more', icon: '⋯', label: '더보기' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-line bg-panel shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-[700px] justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-3 flex-1 text-xs transition-colors ${
                isActive ? 'text-kakao-dark' : 'text-dim'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative flex flex-col items-center">
                  <span className="text-xl leading-none">{t.icon}</span>
                  {isActive && (
                    <span
                      className="mt-0.5 h-1 w-1 rounded-full bg-kakao"
                      style={{ display: 'block' }}
                    />
                  )}
                </span>
                <span className={`font-medium ${isActive ? 'font-bold' : ''}`}>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
