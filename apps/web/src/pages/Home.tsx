import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { krw } from '../lib/format.js';
import { DraftResumeBanner } from '../features/DraftResumeModal.js';

interface Me {
  authenticated: boolean;
  user_id?: string;
  email?: string;
  membership?: { family_id: string; display_name: string; role: string } | null;
}

interface GraphSummary {
  summary: {
    fixed_sum: number; active_count: number; draft_count: number;
    upcoming: Array<{ id: string; merchant_name: string; amount_krw: number | null; due_date: string; diff_days: number }>;
  };
  tree: Array<{
    id: string;
    nickname: string; institution_name: string; monthly_sum: number; balance_krw: number;
    cards: Array<{ id: string; product_name: string; issuer_name: string; monthly_sum: number }>;
  }>;
}

// iOS system colors
const CARD_GRADIENTS: [string, string][] = [
  ['#1a4fa0', '#2d6bce'],   // KB blue
  ['#3a0c6e', '#6b3fa0'],   // Kakao purple
  ['#005c2e', '#00873f'],   // Hana green
  ['#b00020', '#e0002b'],   // Woori red
  ['#1c3d7a', '#2c5ba8'],   // Shinhan blue
];

function AccountCard({
  account,
  colorIdx,
  style,
}: {
  account: GraphSummary['tree'][number];
  colorIdx: number;
  style?: React.CSSProperties;
}) {
  const gradient = CARD_GRADIENTS[colorIdx % CARD_GRADIENTS.length] ?? ['#1a4fa0', '#2d6bce'];
  const [g1, g2] = gradient;
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
        borderRadius: 22,
        padding: '20px 22px',
        color: '#fff',
        boxShadow: '0 10px 30px -8px rgba(0,0,0,0.30)',
        border: '1px solid rgba(255,255,255,0.15)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Sheen overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)',
          borderRadius: '22px 22px 0 0',
          pointerEvents: 'none',
        }}
      />

      {/* Institution chip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 3 }}>
            {account.institution_name}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {account.nickname}
          </div>
        </div>
        {/* Bank chip */}
        <div style={{
          background: 'rgba(255,255,255,0.2)',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
        }}>
          계좌
        </div>
      </div>

      {/* Balance */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 4 }}>
          Balance
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
          {krw(account.balance_krw)}
        </div>
      </div>

      {/* Cards linked */}
      {account.cards.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {account.cards.slice(0, 3).map((c) => (
            <div
              key={c.id}
              style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 500,
                backdropFilter: 'blur(8px)',
              }}
            >
              {c.issuer_name} {c.product_name}
            </div>
          ))}
        </div>
      )}

      {/* Monthly outflow */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          매월 <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{krw(account.monthly_sum)}</strong> 빠짐
        </span>
      </div>
    </div>
  );
}

function WalletCardStack({ accounts }: { accounts: GraphSummary['tree'] }) {
  const [expanded, setExpanded] = useState(false);

  if (accounts.length === 0) return null;

  if (accounts.length === 1 || expanded) {
    return (
      <div className="space-y-3">
        {accounts.map((acc, i) => (
          <div key={acc.id} className="animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
            <AccountCard account={acc} colorIdx={i} />
          </div>
        ))}
        {accounts.length > 1 && (
          <button
            onClick={() => setExpanded(false)}
            style={{ width: '100%', textAlign: 'center', fontSize: 13, color: '#007aff', fontWeight: 500, padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            접기
          </button>
        )}
      </div>
    );
  }

  // Stacked cards view
  const topCard = accounts[0]!;
  const stackCount = Math.min(accounts.length - 1, 2);

  return (
    <button
      onClick={() => setExpanded(true)}
      className="w-full text-left"
      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <div className="card-stack-container" style={{ paddingBottom: stackCount === 2 ? 22 : 12 }}>
        {/* Behind cards */}
        {stackCount >= 2 && <div className="card-stack-bg-2" />}
        {stackCount >= 1 && <div className="card-stack-bg-1" />}
        {/* Top card */}
        <div className="card-stack-top animate-slide-up">
          <AccountCard account={topCard} colorIdx={0} />
          {/* Peek indicator */}
          <div style={{
            textAlign: 'center',
            marginTop: 6,
            fontSize: 12,
            color: '#007aff',
            fontWeight: 500,
          }}>
            +{accounts.length - 1}개 더보기 탭하여 펼치기
          </div>
        </div>
      </div>
    </button>
  );
}

export function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [g, setG] = useState<GraphSummary | null>(null);
  const [invite, setInvite] = useState<{ token: string } | null>(null);

  async function refresh() {
    try {
      const meRes = await api<Me>('/api/me');
      setMe(meRes);
      const gRes = await api<GraphSummary>('/api/graph');
      setG(gRes);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('ffn:data-changed', handler);
    return () => window.removeEventListener('ffn:data-changed', handler);
  }, []);

  async function createInvite() {
    const res = await api<{ token: string; expires_in_days: number }>(
      '/api/families/invite', { method: 'POST', body: '{}' });
    setInvite(res);
  }

  const empty = !g || (g.tree.length === 0 && g.summary.active_count === 0);

  return (
    <div className="space-y-4 px-4 pt-5 pb-28">
      <DraftResumeBanner />

      {/* Header */}
      <header className="animate-slide-up">
        <div style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93', marginBottom: 2 }}>우리 가족 금융 내비게이터</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: '#1c1c1e' }}>
          {me?.membership?.display_name ?? '···'}님
        </h1>
      </header>

      {/* 이번달 빠질 돈 — Hero card */}
      <section
        className="animate-slide-up delay-50"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 22,
          padding: '20px 22px',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e8e93', marginBottom: 8 }}>
          This Month
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
          <div style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            color: '#1c1c1e',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}>
            {krw(g?.summary.fixed_sum ?? 0)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            background: 'rgba(0,122,255,0.10)',
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            color: '#007aff',
          }}>
            {g?.summary.active_count ?? 0}건 확정
          </div>
          {g && g.summary.draft_count > 0 && (
            <div style={{
              background: 'rgba(255,149,0,0.10)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: '#ff9500',
            }}>
              초안 {g.summary.draft_count}건
            </div>
          )}
        </div>
      </section>

      {/* 다음 3일 안에 */}
      {g && g.summary.upcoming.length > 0 && (
        <section
          className="animate-slide-up delay-100"
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '0 8px 24px -8px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '12px 16px 8px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#8e8e93',
          }}>
            Upcoming
          </div>
          {g.summary.upcoming.map((u, idx) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderTop: idx === 0 ? 'none' : '0.5px solid rgba(60,60,67,0.10)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: u.diff_days === 0 ? 'rgba(255,59,48,0.12)' : 'rgba(255,149,0,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: u.diff_days === 0 ? '#ff3b30' : '#ff9500',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {u.diff_days === 0 ? 'D-0' : `D-${u.diff_days}`}
                </div>
                <span style={{ fontSize: 15, fontWeight: 500, color: '#1c1c1e' }}>{u.merchant_name}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#3c3c43', fontVariantNumeric: 'tabular-nums' }}>
                {krw(u.amount_krw)}
              </span>
            </div>
          ))}
        </section>
      )}

      {/* 계좌·카드 스택 */}
      {g && g.tree.length > 0 && (
        <div className="animate-slide-up delay-150">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e8e93', marginBottom: 10, paddingLeft: 2 }}>
            Accounts
          </div>
          <WalletCardStack accounts={g.tree} />
        </div>
      )}

      {/* 배우자 초대 */}
      <section
        className="animate-slide-up delay-200"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 18,
          padding: '16px 18px',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.10)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e8e93', marginBottom: 12 }}>
          Family
        </div>
        {invite ? (
          <div>
            <div style={{
              background: 'rgba(0,0,0,0.04)',
              borderRadius: 10,
              padding: '10px 12px',
              fontFamily: 'SF Mono, Menlo, Monaco, monospace',
              fontSize: 12,
              color: '#3c3c43',
              wordBreak: 'break-all',
              letterSpacing: '-0.01em',
              marginBottom: 8,
            }}>
              {invite.token}
            </div>
            <div style={{ fontSize: 12, color: '#8e8e93' }}>배우자에게 위 토큰을 전달하세요 (7일 유효)</div>
          </div>
        ) : (
          <button
            onClick={createInvite}
            style={{
              background: '#007aff',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            배우자 초대 토큰 만들기
          </button>
        )}
      </section>

      {empty && (
        <section
          className="animate-slide-up delay-250"
          style={{
            background: 'rgba(255,255,255,0.50)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 18,
            padding: '20px',
            border: '1.5px dashed rgba(0,122,255,0.25)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', marginBottom: 4 }}>아직 비어있어요</div>
          <p style={{ fontSize: 13, color: '#8e8e93', lineHeight: 1.5 }}>
            <a href="/list" style={{ color: '#007aff', fontWeight: 500 }}>목록 탭</a>에서
            계좌·카드·정기지출을 등록하면 흐름도가 채워져요.
          </p>
        </section>
      )}
    </div>
  );
}
