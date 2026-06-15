import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase.js';
import { api } from './lib/api.js';
import { subscribeLifecycle, subscribeFamilyData } from './lib/realtime.js';
import { ToastProvider, useToast } from './components/Toast.js';
import { Login } from './pages/Login.js';
import { FamilySetup } from './pages/FamilySetup.js';
import { BottomNav } from './components/BottomNav.js';
import { isPreviewMode, markPreviewMode } from './lib/preview.js';

// 라우트 단위 코드스플릿 (인증 후 화면들은 지연 로드)
const Home = lazy(() => import('./pages/Home.js').then((m) => ({ default: m.Home })));
const Flow = lazy(() => import('./pages/Flow.js').then((m) => ({ default: m.Flow })));
const List = lazy(() => import('./pages/List.js').then((m) => ({ default: m.List })));
const More = lazy(() => import('./pages/More.js').then((m) => ({ default: m.More })));
const History = lazy(() => import('./pages/History.js').then((m) => ({ default: m.History })));
const FamilyMembers = lazy(() => import('./pages/FamilyMembers.js').then((m) => ({ default: m.FamilyMembers })));
const ExpenseSplit = lazy(() => import('./pages/ExpenseSplit.js').then((m) => ({ default: m.ExpenseSplit })));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-dim">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-teal" />
    </div>
  );
}

type Stage = 'loading' | 'login' | 'setup' | 'app';

export function App() {
  if (isPreviewMode()) {
    markPreviewMode();
    return (
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/preview" element={<Navigate to="/home" replace />} />
              <Route path="/preview/home" element={<Navigate to="/home" replace />} />
              <Route path="/preview/flow" element={<Navigate to="/flow" replace />} />
              <Route path="/preview/list" element={<Navigate to="/list" replace />} />
              <Route path="/preview/more" element={<Navigate to="/more" replace />} />
              <Route path="/preview/members" element={<Navigate to="/members" replace />} />
              <Route path="/preview/split" element={<Navigate to="/split" replace />} />
              <Route path="/home" element={<Home />} />
              <Route path="/flow" element={<Flow />} />
              <Route path="/list" element={<List />} />
              <Route path="/more" element={<More />} />
              <Route path="/history" element={<History />} />
              <Route path="/members" element={<FamilyMembers />} />
              <Route path="/split" element={<ExpenseSplit />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
          <BottomNav />
        </BrowserRouter>
      </ToastProvider>
    );
  }
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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/flow" element={<Flow />} />
          <Route path="/list" element={<List />} />
          <Route path="/more" element={<More />} />
          <Route path="/history" element={<History />} />
          <Route path="/members" element={<FamilyMembers />} />
          <Route path="/split" element={<ExpenseSplit />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </BrowserRouter>
  );
}
