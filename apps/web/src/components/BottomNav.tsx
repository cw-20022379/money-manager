import { NavLink } from 'react-router-dom';

const tabs = [
  {
    to: '/home',
    label: '홈',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
          fill={active ? '#007aff' : 'none'}
          stroke={active ? '#007aff' : '#8e8e93'}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: '/flow',
    label: '흐름도',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="5" cy="12" r="2.5" fill={active ? '#007aff' : '#8e8e93'} />
        <circle cx="12" cy="6" r="2.5" fill={active ? '#007aff' : '#8e8e93'} />
        <circle cx="19" cy="12" r="2.5" fill={active ? '#007aff' : '#8e8e93'} />
        <circle cx="12" cy="18" r="2.5" fill={active ? '#007aff' : '#8e8e93'} />
        <path
          d="M7.5 12h3M13.5 12h3M12 8.5v3M12 13.5v3"
          stroke={active ? '#007aff' : '#8e8e93'}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/list',
    label: '목록',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect
          x="3" y="4" width="18" height="16" rx="3"
          stroke={active ? '#007aff' : '#8e8e93'}
          fill={active ? 'rgba(0,122,255,0.1)' : 'none'}
          strokeWidth="1.5"
        />
        <path
          d="M7 9h10M7 13h7"
          stroke={active ? '#007aff' : '#8e8e93'}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/more',
    label: '더보기',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="5" cy="12" r="2" fill={active ? '#007aff' : '#8e8e93'} />
        <circle cx="12" cy="12" r="2" fill={active ? '#007aff' : '#8e8e93'} />
        <circle cx="19" cy="12" r="2" fill={active ? '#007aff' : '#8e8e93'} />
      </svg>
    ),
  },
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: 'rgba(242,242,247,0.78)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '0.5px solid rgba(0,0,0,0.12)',
        boxShadow: '0 -4px 16px -4px rgba(0,0,0,0.06)',
      }}
    >
      <div className="mx-auto flex max-w-[700px] justify-around pb-safe">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-[3px] px-2 py-2.5 flex-1 transition-all duration-150 ${
                isActive ? 'opacity-100' : 'opacity-70'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="leading-none">{t.icon(isActive)}</span>
                <span
                  className="text-[10px] font-medium tracking-tight"
                  style={{ color: isActive ? '#007aff' : '#8e8e93' }}
                >
                  {t.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
