import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/home', icon: '🏠', label: '홈' },
  { to: '/flow', icon: '🌊', label: '흐름도' },
  { to: '/list', icon: '📋', label: '목록' },
  { to: '/more', icon: '⋯', label: '더보기' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-line bg-panel">
      <div className="mx-auto flex max-w-[700px] justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2 flex-1 text-xs ${
                isActive ? 'text-teal' : 'text-dim'
              }`
            }
          >
            <span className="text-xl leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
