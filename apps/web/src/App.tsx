/**
 * App.tsx — 앱 최상위 컴포넌트
 *
 * 두 가지 모드를 하나의 컴포넌트에서 분기한다.
 *
 * 1) Preview 모드 (/preview/* 경로 또는 sessionStorage 플래그)
 *    - Supabase 인증·Realtime 전혀 없음. 박씨네 mock 데이터만 사용.
 *    - /preview/* → 일반 경로로 리다이렉트 후 그대로 앱을 표시.
 *    - 디자인 컨셉 비교 스크린샷, E2E 스모크(백엔드 없이)에 쓴다.
 *
 * 2) 일반 모드 (AppInner)
 *    - Supabase 세션 → /api/me → Stage 상태머신: loading → login | setup | app
 *    - 인증 상태 변경 시 onAuthStateChange 콜백으로 재검사.
 *    - app 단계에서 Realtime 구독 2종 활성화:
 *      a) subscribeLifecycle: 배우자 변경 이벤트 → 토스트 알림
 *      b) subscribeFamilyData: 테이블 변경 → ffn:data-changed 커스텀 이벤트 발행
 *
 * 코드스플릿 전략:
 *  - Login·FamilySetup는 인증 전이므로 즉시 로드(import 위치).
 *  - 나머지 페이지는 React.lazy로 지연 로드 → 초기 번들 최소화.
 */
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
// named export를 default로 래핑하는 이유: React.lazy는 default export만 인식하기 때문.
const Home = lazy(() => import('./pages/Home.js').then((m) => ({ default: m.Home })));
const Flow = lazy(() => import('./pages/Flow.js').then((m) => ({ default: m.Flow })));
const List = lazy(() => import('./pages/List.js').then((m) => ({ default: m.List })));
const More = lazy(() => import('./pages/More.js').then((m) => ({ default: m.More })));
const History = lazy(() => import('./pages/History.js').then((m) => ({ default: m.History })));
const FamilyMembers = lazy(() => import('./pages/FamilyMembers.js').then((m) => ({ default: m.FamilyMembers })));
const ExpenseSplit = lazy(() => import('./pages/ExpenseSplit.js').then((m) => ({ default: m.ExpenseSplit })));

/** 라우트 컴포넌트가 로드 중일 때 표시하는 스피너. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-dim">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-teal" />
    </div>
  );
}

/**
 * 인증 흐름을 표현하는 상태머신.
 * loading: 세션/멤버십 조회 중
 * login: 미인증 → Login 화면
 * setup: 인증됐지만 가족 미설정 → FamilySetup 화면
 * app: 인증 + 가족 완비 → 일반 앱 화면
 */
type Stage = 'loading' | 'login' | 'setup' | 'app';

export function App() {
  // Preview 모드 분기: /preview/* 경로로 진입하면 markPreviewMode()로 sessionStorage에 플래그를 박고
  // /preview/XXX → /XXX 로 리다이렉트. 이후 일반 경로 이동에도 mock이 유지됨.
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
  // 일반 모드: ToastProvider를 최상위에 두어 모든 페이지에서 useToast() 사용 가능.
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const [stage, setStage] = useState<Stage>('loading');
  // ctx: 인증 완료 후 Realtime 구독에서 familyId·userId를 쓰기 위해 상태로 보관.
  // prop drilling 없이 App 레벨에서만 필요하므로 전역 스토어 대신 로컬 state 사용.
  const [ctx, setCtx] = useState<{ familyId: string; userId: string; displayName: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    // cancelled 플래그: StrictMode 이중 실행 또는 cleanup 후 setStage 호출 방지.
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) { setStage('login'); setCtx(null); }
        return;
      }
      try {
        // /api/me: 세션이 있어도 가족 membership이 없을 수 있음 (신규 가입 직후).
        // membership 없으면 setup, 있으면 app 단계로 전환.
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
        // /api/me 실패 시 setup으로 폴백 (가족 미설정 상태로 가정).
        if (!cancelled) setStage('setup');
      }
    }
    check();
    // 로그인/로그아웃 시 상태머신 재실행.
    const sub = supabase.auth.onAuthStateChange(() => check());
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  // Realtime 구독: 배우자 변경 → 토스트 + 데이터 변경 → 페이지 리프레시 이벤트
  // stage가 'app'이고 ctx가 있을 때만 구독 (가족 ID 필요).
  // 두 채널로 나눈 이유:
  //   - subscribeLifecycle: notify_spouse=true 이벤트만 필터 → 배우자 알림 전용
  //   - subscribeFamilyData: 테이블 변경 전부 → ffn:data-changed 발행 (UI 자동 갱신)
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
      // ffn:data-changed 커스텀 이벤트를 발행해 각 페이지(List·Home·Flow 등)가
      // 독립적으로 refetch하도록 한다. prop drilling·전역 store 없이
      // 느슨하게 여러 페이지를 동기화하는 패턴.
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
  // FamilySetup 완료 후 location.reload()로 전체 앱을 재부팅하는 이유:
  // onDone 시점에 ctx·stage를 재계산해야 하는데, check()를 재호출하면 되지만
  // 신규 가족 생성 직후 서버가 membership을 반환하는 타이밍 보장이 어려움.
  // 단순 reload가 가장 안전하고 예측 가능한 방법.
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
