"""공통 헬퍼: 두 컨텍스트(부부) 구성, 로그인, 스크린샷."""
from __future__ import annotations
import os
import time
from pathlib import Path

WEB_URL = "http://127.0.0.1:5173"
API_URL = "http://127.0.0.1:3000"

HUSBAND = {"email": "husband@test.local", "password": "test1234", "display": "남편"}
WIFE = {"email": "wife@test.local", "password": "test1234", "display": "아내"}

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT / "screenshots"
SHOTS.mkdir(exist_ok=True)


def shot(page, name: str):
    path = SHOTS / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return path


def log(label: str, msg: str):
    color = {"H": "\033[36m[남편]\033[0m", "W": "\033[35m[아내]\033[0m"}.get(
        label, "\033[33m[*]\033[0m"
    )
    print(f"{color} {msg}", flush=True)


def new_ctx(browser, label: str):
    """notifications 권한 자동 grant. 작은 모바일 viewport."""
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
    """BottomNav 또는 setup 페이지가 보일 때까지."""
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
