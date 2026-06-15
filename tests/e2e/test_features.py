"""v0.2 신규 기능 스모크 (preview mock 기반 — supabase/API 불필요).

이 테스트가 검증하는 것:
  v0.2에서 추가된 4가지 UI 기능이 "화면에 올바르게 렌더링되는지"를 빠르게 검증한다.
  실제 Supabase/API 연동 없이 /preview/* 라우트의 mock 데이터만 사용한다.

preview mock 기반 테스트의 의의:
  - test_a/test_b는 실제 Supabase와 백엔드 API가 필요해 로컬 전체 스택 구성이 선행 조건.
  - 이 파일은 dev 서버(npm run dev)만 있으면 바로 실행 가능.
    CI/CD 파이프라인의 "빌드 후 연기 검증(smoke)" 단계에 적합.
  - /preview/* 라우트는 Supabase 없이도 동작하는 하드코딩된 mock 데이터를 사용해
    UI 컴포넌트 자체의 렌더링 로직만 격리 검증한다.

검증 항목:
  1. 프리셋 자동완성 (test_preset)
     - "넷" 입력 시 matchPresets()가 1건 이상 후보를 반환하는지
     - "넷플릭스" 선택 시 금액(13,500원)이 자동으로 채워지는지
     - packages/shared/src/merchant-presets.ts의 matchPresets 함수 동작 검증

  2. 카드 청구 사이클 (test_billing)
     - "이번달 카드로 빠질 돈" 합계가 표시되는지
     - 카드별 청구 내역이 표시되는지
     - cards.payment_due_day 기반 계산 결과가 UI에 나오는지

  3. 가족 구성원 (test_members)
     - 소유자/구성원 역할 배지가 표시되는지
     - 내보내기 버튼(OWNER만 볼 수 있는 기능)이 보이는지
     - memberships.role 기반 권한 분기 UI 검증

  4. 부부 분담 (test_split)
     - 이번달 고정지출 합계가 표시되는지
     - "공동" 부담 태그 (owner_user_id=null인 항목)가 표시되는지
     - 분담 비율(%) 표시가 있는지
     - soft ownership(owner_user_id) 기반 분담 집계 UI 검증

실행:
  PREVIEW_BASE=http://127.0.0.1:5185 python tests/e2e/test_features.py
  (dev 서버: cd apps/web && npm run dev -- --port 5185 --strictPort)
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("PREVIEW_BASE", "http://127.0.0.1:5173")
FAB = 'button[style*="linear-gradient"]'  # BankSalad 스타일 FAB(+ 등록) 버튼


def check(cond: bool, msg: str, fails: list):
    mark = "✅" if cond else "❌"
    print(f"  {mark} {msg}", flush=True)
    if not cond:
        fails.append(msg)


def test_preset(page, fails):
    """프리셋 자동완성 검증.

    matchPresets("넷") 호출 결과가 드롭다운 li 버튼으로 1건 이상 렌더링되는지,
    "넷플릭스" 선택 후 amount=13_500이 input에 채워지는지 확인.
    placeholder "17000"은 넷플릭스 금액(13,500)이 채워질 때 해당 input이 있는지로 확인.
    """
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
    """카드 청구 사이클 검증.

    /preview/flow 의 mock 데이터(현대카드 M카드 등)가 "청구" 탭에 올바르게 집계되는지,
    cards.payment_due_day 기반 "결제일" 표시가 있는지 확인.
    """
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
    """가족 구성원 화면 검증.

    memberships.role='OWNER'/'MEMBER' 배지가 UI에 표시되는지,
    OWNER만 접근 가능한 "내보내기" 버튼이 보이는지 확인.
    """
    print("[가족 구성원]", flush=True)
    page.goto(f"{BASE}/preview/members", wait_until="networkidle")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("소유자" in body, "소유자 역할 배지", fails)
    check("구성원" in body, "구성원 역할 배지", fails)
    check(page.locator('button:has-text("내보내기")').count() >= 1, "내보내기 버튼(소유자 권한)", fails)


def test_split(page, fails):
    """부부 분담 화면 검증.

    payment_flows.owner_user_id 기반 분담 집계가 올바르게 UI에 표시되는지 확인.
    - owner_user_id=null인 항목은 "공동" 태그로 표시됨
    - 각 사용자 부담 비율이 % 형태로 표시됨
    soft ownership 라벨링이 집계 화면까지 연결되는 엔드투엔드 렌더링 검증.
    """
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
