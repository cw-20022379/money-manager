"""공통 헬퍼: 두 컨텍스트(부부) 구성, 로그인, 스크린샷.

이 모듈은 실제 Supabase + 앱 서버를 대상으로 하는 E2E 테스트들
(test_a, test_b, test_realtime, test_graph, test_calendar, test_toast)이
공유하는 공통 유틸리티다.

설계 의도:
  - 부부 2인 시뮬레이션: 한 브라우저 프로세스 안에서 두 개의 독립 컨텍스트(ctx_h, ctx_w)를
    생성해 남편/아내가 서로 다른 세션으로 동시에 앱을 사용하는 상황을 재현한다.
    Supabase Realtime 채널이 "두 기기에 동시 구독된 상태"를 테스트하려면
    두 컨텍스트가 같은 Realtime 채널을 별도 WebSocket으로 구독해야 하기 때문이다.

  - notifications 권한 사전 grant: new_ctx()에서 permissions=["notifications"]를 지정하는 이유.
    브라우저가 Notification.requestPermission()을 호출할 때 팝업 UI가 뜨면 headless 환경에서
    자동화가 멈춘다. Playwright의 permissions 옵션으로 미리 'granted' 상태를 주입해 팝업 없이
    통과시킨다. 단, headless Chromium은 실제 OS 알림을 보내지 않으므로 Web Push의
    최종 알림 표시는 검증 불가 — test_b에서 서버 라운드트립으로 대체 검증한다.

  - 모바일 viewport (420×800): 이 PWA는 모바일 퍼스트 디자인이므로 데스크탑 뷰포트로
    테스트하면 레이아웃이 다르게 보일 수 있어 실사용 환경과 맞춘다.
"""
from __future__ import annotations
import os
import time
from pathlib import Path

WEB_URL = "http://127.0.0.1:5173"
API_URL = "http://127.0.0.1:3000"

# test_a / test_b / test_realtime 등에서 공유하는 테스트 계정.
# apps/api/scripts/cleanup-test-family.mjs가 이 계정의 가족 데이터를 wipe한다.
# 실제 운영 DB가 아닌 로컬 Supabase(또는 테스트 전용 프로젝트)에서만 사용할 것.
HUSBAND = {"email": "husband@test.local", "password": "test1234", "display": "남편"}
WIFE = {"email": "wife@test.local", "password": "test1234", "display": "아내"}

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)


def shot(page, name: str):
    """스크린샷을 tests/e2e/screenshots/{name}.png 로 저장한다."""
    path = SHOTS / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return path


def log(label: str, msg: str):
    """콘솔에 색상 라벨을 붙여 출력한다.
    label="H"(남편)는 청록, "W"(아내)는 보라, 그 외는 노란색.
    테스트 진행 흐름을 두 행위자 관점으로 구분해 읽기 쉽게 한다.
    """
    color = {"H": "\033[36m[남편]\033[0m", "W": "\033[35m[아내]\033[0m"}.get(
        label, "\033[33m[*]\033[0m"
    )
    print(f"{color} {msg}", flush=True)


def new_ctx(browser, label: str):
    """새 브라우저 컨텍스트를 생성한다.

    permissions=["notifications"]:
      Notification.requestPermission()이 자동으로 'granted'를 반환하도록 설정.
      headless 환경에서 알림 권한 팝업이 뜨면 자동화가 멈추므로 사전 grant 필요.
      단, 이 설정이 있어도 headless Chromium에서는 실제 OS 데스크탑 알림이 보이지 않는다.
      Web Push 발송 검증은 test_b의 서버 라운드트립 방식으로 대체한다.

    viewport 420×800:
      이 PWA의 실사용 환경(스마트폰 화면)을 재현. BottomNav, 토스트 위치 등
      모바일 레이아웃에 의존하는 시나리오가 정확히 동작하려면 모바일 뷰포트가 필요하다.

    default_timeout=15000:
      네트워크 요청이 느린 로컬 환경(Supabase 콜드 스타트 등)을 위해 15초로 여유 있게 설정.
    """
    ctx = browser.new_context(
        permissions=["notifications"],
        viewport={"width": 420, "height": 800},
    )
    ctx.set_default_timeout(15_000)
    return ctx


def sign_in(page, user: dict):
    """로그인 페이지 도달 시 로그인. 이미 세션 있으면 그대로."""
    page.goto(WEB_URL)
    page.wait_for_load_state("networkidle")
    # 로그인 폼이 보이는지
    has_login = page.locator('input[type="email"]').count() > 0
    if has_login:
        page.fill('input[type="email"]', user["email"])
        page.fill('input[type="password"]', user["password"])
        page.click('button[type="submit"]:has-text("로그인")')
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)
        # 에러 메시지 확인
        warn = page.locator("p.text-warn").first
        if warn.is_visible(timeout=300):
            txt = warn.text_content() or ""
            if "가입" not in txt and txt.strip():
                raise RuntimeError(f"Login failed for {user['email']}: {txt}")
    page.wait_for_load_state("networkidle")


def wait_for_app(page, timeout_s: float = 10):
    """BottomNav 또는 setup 페이지가 보일 때까지 대기.

    로그인 후 앱 초기화가 완료됐는지 확인하는 진입점 게이트.
    '홈' 탭이 보이면 정상 진입, '가족 만들기'가 보이면 아직 가족이 없는 상태.
    둘 다 안 보이면 아직 로딩 중이므로 polling한다.
    """
    end = time.time() + timeout_s
    while time.time() < end:
        if page.locator("text=홈").first.is_visible() or page.locator(
            "text=가족 만들기"
        ).first.is_visible():
            return
        time.sleep(0.2)
    raise RuntimeError("App did not load after sign-in")


def goto_tab(page, label: str):
    """하단 탭 클릭."""
    page.click(f'button:has-text("{label}"), a:has-text("{label}")')
    page.wait_for_load_state("networkidle")
    time.sleep(0.3)
