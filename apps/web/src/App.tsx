import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase.js';
import { api } from './lib/api.js';
import { subscribeLifecycle, subscribeFamilyData } from './lib/realtime.js';
import { ToastProvider, useToast } from './components/Toast.js';
import { Login } from './pages/Login.js';
import { FamilySetup } from './pages/FamilySetup.js';
import { Home } from './pages/Home.js';
import { Flow } from './pages/Flow.js';
import { List } from './pages/List.js';
import { More } from './pages/More.js';
import { History } from './pages/History.js';
import { BottomNav } from './components/BottomNav.js';

type Stage = 'loading' | 'login' | 'setup' | 'app';

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const [stage, setStage] = useState<Stage>('loading');
  const [ctx, setCtx] = useState<{ familyId: string; userId: string; displayName: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) { setStage('login'); setCtx(null); }
        return;
      }
      try {
        const me = await api<{ membership: { family_id: string; display_name: string } | null }>(
          '/api/me',
        );
        if (cancelled) return;
        if (me.membership) {
          setCtx({
            familyId: me.membership.family_id,
            userId: data.session.user.id,
            displayName: me.membership.display_name,
          });
          setStage('app');
        } else {
          setCtx(null);
          setStage('setup');
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setStage('setup');
      }
    }
    check();
    const sub = supabase.auth.onAuthStateChange(() => check());
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  // Realtime 구독: 배우자 변경 → 토스트 + 데이터 변경 → 페이지 리프레시 이벤트
  useEffect(() => {
    if (stage !== 'app' || !ctx) return;
    const unsubLifecycle = subscribeLifecycle(ctx.familyId, ctx.userId, (ev) => {
      const subject =
        ev.subject_kind === 'ACCOUNT' ? '계좌'
          : ev.subject_kind === 'CARD' ? '카드'
            : '정기지출';
      const verb =
        ev.event_type === 'CREATED' ? '등록했어요'
          : ev.event_type === 'TERMINATED' ? '해지했어요'
            : ev.event_type === 'REVERTED' ? '되돌렸어요'
              : '변경했어요';
      toast.push(`🔔 배우자가 ${subject}을(를) ${verb}`);
    });
    const unsubData = subscribeFamilyData(ctx.familyId, () => {
      // 페이지에서 자체적으로 다시 fetch하도록 글로벌 이벤트
      window.dispatchEvent(new CustomEvent('ffn:data-changed'));
    });
    return () => {
      unsubLifecycle();
      unsubData();
    };
  }, [stage, ctx, toast]);

  if (stage === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-dim">
        잠깐만요...
      </div>
    );
  }
  if (stage === 'login') return <Login />;
  if (stage === 'setup') return <FamilySetup onDone={() => location.reload()} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/flow" element={<Flow />} />
        <Route path="/list" element={<List />} />
        <Route path="/more" element={<More />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <BottomNav />
    </BrowserRouter>
  );
}
