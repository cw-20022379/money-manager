import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PushSettings } from '../features/PushSettings.js';

interface MenuRow {
  icon: string;
  label: string;
  sub?: string;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

const menuGroups: { title: string; rows: MenuRow[] }[] = [
  {
    title: '데이터',
    rows: [
      { icon: '📜', label: '변경 기록', href: '/history' },
      { icon: '💾', label: '데이터 내보내기', sub: 'v0.3', disabled: true },
    ],
  },
  {
    title: '가족',
    rows: [
      { icon: '👥', label: '가족 구성원', sub: 'v0.2', disabled: true },
    ],
  },
];

export function More() {
  return (
    <div className="space-y-5 px-4 pt-5 pb-28">
      {/* Header */}
      <header className="animate-slide-up">
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: '#1c1c1e' }}>더보기</h1>
      </header>

      {/* Push notifications (embedded feature) */}
      <div className="animate-slide-up delay-50">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e8e93', marginBottom: 10, paddingLeft: 2 }}>
          알림
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.10)',
          overflow: 'hidden',
          padding: '12px 16px',
        }}>
          <PushSettings />
        </div>
      </div>

      {/* Menu groups */}
      {menuGroups.map((group, gi) => (
        <div key={group.title} className={`animate-slide-up`} style={{ animationDelay: `${(gi + 1) * 60 + 50}ms` }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e8e93', marginBottom: 10, paddingLeft: 2 }}>
            {group.title}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 8px 24px -8px rgba(0,0,0,0.10)',
            overflow: 'hidden',
          }}>
            {group.rows.map((row, idx) => {
              const content = (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: row.disabled ? 'rgba(118,118,128,0.12)' : 'rgba(0,122,255,0.10)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                    }}>
                      {row.icon}
                    </div>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 500, color: row.disabled ? '#8e8e93' : '#1c1c1e' }}>
                        {row.label}
                      </span>
                      {row.sub && (
                        <span style={{ fontSize: 11, color: '#c7c7cc', marginLeft: 6, fontWeight: 400 }}>{row.sub}</span>
                      )}
                    </div>
                  </div>
                  {!row.disabled && (
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                      <path d="M2 2l4 4-4 4" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </>
              );

              const sharedStyle: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                borderTop: idx > 0 ? '0.5px solid rgba(60,60,67,0.10)' : 'none',
                cursor: row.disabled ? 'default' : 'pointer',
                textAlign: 'left' as const,
                gap: 0,
                textDecoration: 'none',
              };

              if (row.href && !row.disabled) {
                return (
                  <Link key={row.label} to={row.href} style={sharedStyle}>
                    {content}
                  </Link>
                );
              }

              return (
                <div key={row.label} style={sharedStyle}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Logout — separate danger group */}
      <div className="animate-slide-up delay-200">
        <div style={{
          background: 'rgba(255,59,48,0.06)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 18,
          border: '1px solid rgba(255,59,48,0.12)',
          overflow: 'hidden',
        }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              gap: 10,
            }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,59,48,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}>
              🚪
            </div>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#ff3b30' }}>로그아웃</span>
          </button>
        </div>
      </div>

      {/* Version */}
      <div className="animate-slide-up delay-250" style={{ textAlign: 'center', fontSize: 11, color: '#c7c7cc', paddingTop: 4 }}>
        가족 금융 내비게이터 v0.1
      </div>
    </div>
  );
}
