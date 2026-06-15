"""시나리오 — v0.2 관계도 그래프.

이 테스트가 검증하는 것:
  "계좌 → 카드 → 정기지출" 트리 구조를 react-flow 그래프로 시각화하는 기능을 검증한다.
  이 관계도는 "우리 집 돈이 어디서 나와서 어디로 흐르는가"를 한눈에 보여주는 핵심 UI다.

  검증 항목:
  1. 기본 트리뷰: /flow 진입 시 트리 뷰가 기본으로 렌더링되는지.
  2. react-flow 렌더링: [관계도] 토글 클릭 후 .react-flow 컨테이너가 DOM에 있는지.
  3. 노드 3종 확인: 계좌·카드·정기지출 노드가 각각 1개 이상 렌더링되는지.
     (cards.billing_account_id FK가 계좌와 카드를 연결하고,
      payment_flows.source_card_id가 카드와 정기지출을 연결한다)
  4. sessionStorage 상태 보존: 관계도 토글 상태가 sessionStorage에 저장되는지.
  5. 노드 클릭 내비게이션: 정기지출 노드 클릭 시 /list로 이동 + 편집 모달 자동 오픈.
  6. 새로고침 후 복원: 페이지 새로고침해도 sessionStorage 기반으로 관계도 뷰가 유지되는지.

데이터 시드:
  test_a와 동일한 "계좌 1 + 카드 1(계좌에 연결) + 정기지출 1(카드에 연결)" 세트를 등록.
  카드 등록 시 billing_account_id를 설정해야 계좌→카드 엣지가 그래프에 나타난다.

1. test_a 데이터(계좌 1 + 카드 1 + 정기지출 1) 다시 시드
2. /flow 진입 → 트리뷰 보임
3. [관계도] 토글 → react-flow 캔버스 + 노드 3종(계좌·카드·정기지출) 렌더링
4. 노드 클릭 → /list 로 이동 + 편집 모달 자동 오픈
5. 스크린샷 (G-01 ~ G-05)
"""
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

from lib import HUSBAND, new_ctx, sign_in, wait_for_app, goto_tab, shot, log

ROOT = Path(__file__).resolve().parents[2]


def cleanup():
    subprocess.run(
        ["node", "scripts/cleanup-test-family.mjs"],
        cwd=ROOT / "apps/api", check=True, capture_output=True,
    )


def seed_data(page):
    """남편으로 로그인된 상태에서 계좌·카드·정기지출 1세트 등록."""
    goto_tab(page, "목록")
    page.click('button:has-text("계좌")')
    page.click('button:has-text("+ 새로 등록")')
    page.wait_for_selector('text=🏦 계좌 등록')
    ins = page.locator('form input').all()
    ins[0].fill("KB국민은행"); ins[1].fill("월급"); ins[2].fill("11011223344"); ins[3].fill("5000000")
    page.click('form button[type="submit"]:has-text("저장")')
    page.wait_for_selector('text=계좌 저장 완료')

    page.click('button:has-text("카드")')
    time.sleep(0.3)
    page.click('button:has-text("+ 새로 등록")')
    page.wait_for_selector('text=💳 카드 등록')
    cins = page.locator('form input').all()
    cins[0].fill("현대카드"); cins[1].fill("M카드")
    # 결제계좌 셀렉트 — 첫 옵션(KB 월급) 선택해야 카드가 트리에 연결됨
    page.locator('form select').first.select_option(index=1)
    page.click('form button[type="submit"]:has-text("저장")')
    page.wait_for_selector('text=카드 저장 완료')

    page.click('button:has-text("정기지출")')
    time.sleep(0.3)
    page.click('button:has-text("+ 새로 등록")')
    page.wait_for_selector('text=💸 정기지출 등록')
    page.fill('input[required]', "넷플릭스")
    page.fill('input[placeholder="17000"]', "17000")
    page.fill('input[inputmode="numeric"].text-center', "15")
    page.locator('form select').last.select_option(value="MEDIA")
    page.click('form button[type="submit"]:has-text("저장")')
    page.wait_for_selector('text=정기지출 저장 완료')


def main():
    cleanup()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = new_ctx(browser, "H")
        page = ctx.new_page()
        page.on("pageerror", lambda e: log("H", f"pageerror: {str(e)[:200]}"))

        sign_in(page, HUSBAND); wait_for_app(page)
        log("H", "로그인 OK")
        seed_data(page)
        log("H", "시드 데이터 등록 완료")

        # 1) /flow 진입 → 기본 트리뷰
        goto_tab(page, "흐름도")
        page.wait_for_selector('text=🌊 흐름도')
        page.wait_for_selector('text=KB국민은행')
        shot(page, "G-01-tree-default")
        log("H", "트리뷰 기본 렌더 ✅")

        # 2) [관계도] 토글
        page.click('button:has-text("관계도")')
        time.sleep(1.0)  # react-flow fitView 애니메이션
        rf_count = page.locator('.react-flow').count()
        log("H", f".react-flow 컨테이너: {rf_count}")
        if rf_count == 0:
            log("H", "❌ react-flow 미렌더")
            shot(page, "G-02-graph-fail")
            browser.close()
            return

        # 노드 3종 확인
        node_account = page.locator('text=🏦 계좌').count()
        node_card = page.locator('text=💳 카드').count()
        node_flow = page.locator('text=💸 정기지출').count()
        log("H", f"노드: 계좌 {node_account} · 카드 {node_card} · 정기지출 {node_flow}")
        nodes_ok = node_account >= 1 and node_card >= 1 and node_flow >= 1
        shot(page, "G-02-graph-rendered")

        # 3) 토글 상태가 sessionStorage에 저장됐는지
        stored = page.evaluate("() => sessionStorage.getItem('ffn:flow-view')")
        log("H", f"sessionStorage flow-view = {stored}")

        # 4) 미니맵·컨트롤 확인
        has_controls = page.locator('.react-flow__controls').count() > 0
        log("H", f"컨트롤(zoom): {'✅' if has_controls else '❌'}")

        # 5) 정기지출 노드 클릭 → /list로 이동 + 편집 모달
        # react-flow는 노드 클릭 시 onNodeClick 호출. 노드 div 자체를 클릭.
        # 노드는 .react-flow__node 안에 있음
        flow_node = page.locator('.react-flow__node:has-text("넷플릭스")').first
        if flow_node.is_visible():
            flow_node.click()
            time.sleep(1.0)
            on_list = '/list' in page.url
            modal_open = page.locator('text=💸 정기지출 수정').count() > 0
            log("H", f"노드 클릭 → /list: {'✅' if on_list else '❌'} / 편집 모달: {'✅' if modal_open else '❌'}")
            shot(page, "G-03-node-click-edit")
        else:
            log("H", "❌ 넷플릭스 노드 미발견")

        # 6) 빈 상태 — 정기지출 해지 후 관계도 다시
        # (생략 - 본 PR 스코프 밖)

        # 7) 새로고침 후 토글 상태 복원
        page.goto("http://127.0.0.1:5173/flow")
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)
        restored = page.locator('.react-flow').count() > 0
        log("H", f"새로고침 후 관계도 복원: {'✅' if restored else '❌ (트리로 갔음)'}")
        shot(page, "G-04-graph-after-reload")

        log("*", f"종합: {'✅ OK' if nodes_ok else '⚠️ 일부 미흡'}")
        browser.close()


if __name__ == "__main__":
    main()
