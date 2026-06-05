"""시나리오 — v0.2 캘린더 (현금흐름).

1. 정기지출 3개 등록 (다른 날, 다른 금액 분포로 색상 톤 차이 확인)
2. /flow → [📅 캘린더] 토글
3. 월 헤더 + 요일 행 + 그리드 + 합계 확인
4. 정기지출이 있는 날 셀 클릭 → 상세 패널 + 항목 리스트
5. 상세 항목 클릭 → /list 편집 모달 자동 오픈
6. 이전/다음 달 이동
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


def add_account_and_card(page):
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
    page.locator('form select').first.select_option(index=1)
    page.click('form button[type="submit"]:has-text("저장")')
    page.wait_for_selector('text=카드 저장 완료')


def add_flow(page, name: str, amount: str, day: str):
    page.click('button:has-text("정기지출")')
    time.sleep(0.3)
    page.click('button:has-text("+ 새로 등록")')
    page.wait_for_selector('text=💸 정기지출 등록')
    page.fill('input[required]', name)
    page.fill('input[placeholder="17000"]', amount)
    page.fill('input[inputmode="numeric"].text-center', day)
    page.locator('form select').last.select_option(value="MEDIA")
    page.click('form button[type="submit"]:has-text("저장")')
    page.wait_for_selector('text=정기지출 저장 완료')
    time.sleep(0.3)


def main():
    cleanup()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = new_ctx(browser, "H")
        page = ctx.new_page()
        page.on("pageerror", lambda e: log("H", f"pageerror: {str(e)[:200]}"))

        sign_in(page, HUSBAND); wait_for_app(page)
        log("H", "로그인 OK")

        add_account_and_card(page)
        log("H", "계좌·카드 시드")

        # 다른 톤 분포: 작은 5,000 (teal) / 중간 60,000 (warn) / 큰 130,000 (bad)
        add_flow(page, "유튜브 프리미엄", "5000", "5")
        add_flow(page, "인터넷", "60000", "15")
        add_flow(page, "대출 이자", "130000", "25")
        log("H", "정기지출 3건 시드 (5/15/25일)")

        # 흐름도 → 캘린더
        goto_tab(page, "흐름도")
        page.wait_for_selector('text=🌊 흐름도')
        page.click('button:has-text("캘린더")')
        page.wait_for_selector('text=월 합계', timeout=5000)
        shot(page, "C-01-calendar-month")
        log("H", "캘린더 진입 ✅")

        # 요일 헤더 확인
        weekday_count = page.locator('div.grid.grid-cols-7').first.locator('> div').count()
        log("H", f"요일 헤더 div: {weekday_count} (7 기대)")

        # 5일/15일/25일 셀에 금액 표시
        for day, name in [("5", "유튜브"), ("15", "인터넷"), ("25", "대출")]:
            visible = page.locator(f'button:has-text("{day}")').count() > 0
            log("H", f"{day}일 셀 표시: {'✅' if visible else '❌'}")

        # 톤 검증: 5일=teal, 15일=warn, 25일=bad — class 검사
        sample_cells = page.locator('div.grid.grid-cols-7').nth(1).locator('button').all()
        bordered = sum(1 for c in sample_cells if any(
            t in (c.get_attribute('class') or '') for t in ['border-bad', 'border-warn', 'border-teal']
        ))
        log("H", f"색상 톤 적용된 셀: {bordered}개")

        # 15일 셀 클릭 — has_text는 substring이라 inner_text가 "15"로 시작하는 것 직접 탐색
        day15 = None
        for b in page.locator('div.grid.grid-cols-7').nth(1).locator('button').all():
            text = (b.inner_text() or '').strip()
            if text.startswith('15'):
                day15 = b
                break
        if day15 is None:
            log("H", "❌ 15일 셀 미탐색")
            browser.close()
            return
        day15.click()
        page.wait_for_selector('text=일 빠질 돈', timeout=3000)
        time.sleep(0.5)
        shot(page, "C-02-day-detail")
        body = page.content()
        has_internet_anywhere = '인터넷' in body
        log("H", f"page에 '인터넷' 텍스트: {'✅' if has_internet_anywhere else '❌'}")
        section_html = page.locator('section').last.inner_html()[:500]
        log("H", f"section innerHTML 앞 300자: {section_html[:300]}")

        # 상세 항목 클릭 → /list 편집 모달
        # section의 첫 button은 "닫기 ✕"라 인터넷 텍스트가 들어간 button을 직접 선택
        page.locator('section button:has-text("인터넷")').first.click()
        time.sleep(1.0)
        on_list = '/list' in page.url
        modal = page.locator('text=💸 정기지출 수정').count() > 0
        log("H", f"항목 클릭 → /list: {'✅' if on_list else '❌'} / 편집: {'✅' if modal else '❌'}")
        shot(page, "C-03-item-click-edit")

        # 다시 캘린더로
        page.evaluate("() => document.querySelector('button[aria-label]')?.click()")  # noop
        goto_tab(page, "흐름도")
        page.wait_for_selector('text=월 합계')

        # 다음 달 이동
        next_btn = page.locator('button:has-text("›")').first
        before_label = page.locator('div.text-teal').first.text_content()
        next_btn.click()
        time.sleep(0.4)
        after_label = page.locator('div.text-teal').first.text_content()
        log("H", f"월 이동: {before_label} → {after_label} ({'✅' if before_label != after_label else '❌'})")
        shot(page, "C-04-next-month")

        # "오늘" 버튼 → 이번 달 복귀
        page.click('button:has-text("오늘")')
        time.sleep(0.3)
        restored = page.locator('div.text-teal').first.text_content() == before_label
        log("H", f"오늘 버튼 복귀: {'✅' if restored else '❌'}")
        shot(page, "C-05-today-back")

        log("*", "캘린더 시나리오 종료")
        browser.close()


if __name__ == "__main__":
    main()
