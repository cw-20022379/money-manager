"""v0.2 신규 기능 스모크 (preview mock 기반 — supabase/API 불필요).

프리셋 자동완성 / 카드 청구 사이클 / 가족 구성원 / 부부 분담을
정적 /preview 라우트에서 검증한다. 실제 데이터가 아니라 mock이므로
백엔드 없이 dev 서버만 있으면 돈다.

실행:
  PREVIEW_BASE=http://127.0.0.1:5185 python tests/e2e/test_features.py
  (dev 서버: cd apps/web && npm run dev -- --port 5185 --strictPort)
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("PREVIEW_BASE", "http://127.0.0.1:5173")
FAB = 'button[style*="linear-gradient"]'  # BankSalad FAB(+ 등록)


def check(cond: bool, msg: str, fails: list):
    mark = "✅" if cond else "❌"
    print(f"  {mark} {msg}", flush=True)
    if not cond:
        fails.append(msg)


def test_preset(page, fails):
    print("[프리셋 자동완성]", flush=True)
    page.goto(f"{BASE}/preview/list", wait_until="networkidle")
    page.wait_for_timeout(400)
    page.locator(FAB).click()
    page.wait_for_selector("text=정기지출 등록", timeout=5000)
    page.wait_for_timeout(300)
    inp = page.locator('input[placeholder="넷플릭스, 통신비, 학원비…"]')
    inp.fill("넷")
    page.wait_for_timeout(300)
    n = page.locator("ul li button").count()
    check(n >= 1, f"'넷' 입력 → 후보 {n}건", fails)
    page.locator('ul li button:has-text("넷플릭스")').first.click()
    page.wait_for_timeout(300)
    amt = page.locator('input[placeholder="17000"]').input_value()
    check(amt != "", f"넷플릭스 적용 → 금액 자동 채움({amt})", fails)


def test_billing(page, fails):
    print("[카드 청구 사이클]", flush=True)
    page.goto(f"{BASE}/preview/flow", wait_until="networkidle")
    page.wait_for_timeout(400)
    page.click('button:has-text("청구")')
    page.wait_for_timeout(500)
    check(page.locator("text=이번달 카드로 빠질 돈").count() >= 1, "청구 합계 표시", fails)
    check(page.locator("text=현대카드 M카드").count() >= 1, "카드별 청구 카드 표시", fails)
    body = page.inner_text("body")
    check("결제" in body, "결제일 정보 표시", fails)


def test_members(page, fails):
    print("[가족 구성원]", flush=True)
    page.goto(f"{BASE}/preview/members", wait_until="networkidle")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("소유자" in body, "소유자 역할 배지", fails)
    check("구성원" in body, "구성원 역할 배지", fails)
    check(page.locator('button:has-text("내보내기")').count() >= 1, "내보내기 버튼(소유자 권한)", fails)


def test_split(page, fails):
    print("[부부 분담]", flush=True)
    page.goto(f"{BASE}/preview/split", wait_until="networkidle")
    page.wait_for_timeout(500)
    check(page.locator("text=이번달 고정지출 합계").count() >= 1, "분담 합계 표시", fails)
    body = page.inner_text("body")
    check("공동" in body, "공동 부담 태그", fails)
    check("%" in body, "분담 비율(%) 표시", fails)


def main():
    fails: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 420, "height": 800}).new_page()
        errs: list[str] = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        test_preset(page, fails)
        test_billing(page, fails)
        test_members(page, fails)
        test_split(page, fails)
        check(len(errs) == 0, f"pageerror 없음 ({errs})", fails)
        browser.close()

    if fails:
        print(f"\n❌ {len(fails)}건 실패: {fails}", flush=True)
        sys.exit(1)
    print("\n✅ 신규 기능 스모크 전체 통과", flush=True)


if __name__ == "__main__":
    main()
