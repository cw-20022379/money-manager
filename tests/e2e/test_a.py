"""시나리오 A: 등록 → 편집(Reason) → 실시간 토스트 → 변경기록 Diff → 되돌리기 → 초안 → DraftResumeModal."""
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

from lib import HUSBAND, WIFE, new_ctx, sign_in, wait_for_app, goto_tab, shot, log

ROOT = Path(__file__).resolve().parents[2]


def cleanup():
    subprocess.run(
        ["node", "scripts/cleanup-test-family.mjs"],
        cwd=ROOT / "apps/api",
        check=True,
        capture_output=True,
    )
    log("*", "박씨네 데이터 wipe")


def main():
    cleanup()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_h = new_ctx(browser, "H")
        ctx_w = new_ctx(browser, "W")
        page_h = ctx_h.new_page()
        page_w = ctx_w.new_page()

        # 1) 두 명 로그인
        sign_in(page_h, HUSBAND); wait_for_app(page_h)
        sign_in(page_w, WIFE); wait_for_app(page_w)
        log("*", "두 명 로그인 완료")
        shot(page_h, "A-01-husband-home")

        # 2) 남편: 계좌 1개 등록 (자동이체용)
        # 한글 placeholder 매칭이 까다로워 form input 인덱스로 채움
        goto_tab(page_h, "목록")
        page_h.click('button:has-text("계좌")')
        page_h.click('button:has-text("+ 새로 등록")')
        page_h.wait_for_selector('text=🏦 계좌 등록', timeout=5000)
        # AccountForm 인풋 순서:
        # 0: 은행(custom input, required), 1: 별명(required), 2: 계좌번호, 3: 잔액
        inputs = page_h.locator('form input').all()
        inputs[0].fill("KB국민은행")
        inputs[1].fill("월급")
        inputs[2].fill("11011223344")
        inputs[3].fill("5000000")
        page_h.click('form button[type="submit"]:has-text("저장")')
        page_h.wait_for_selector('text=계좌 저장 완료', timeout=8000)
        log("H", "계좌 등록 OK")
        shot(page_h, "A-02-account-created")

        # 3) 남편: 카드 1개 등록 (정기지출용)
        page_h.click('button:has-text("카드")')
        time.sleep(0.3)
        page_h.click('button:has-text("+ 새로 등록")')
        page_h.wait_for_selector('text=💳 카드 등록', timeout=5000)
        # CardForm 인풋도 비슷한 순서로
        cinputs = page_h.locator('form input').all()
        cinputs[0].fill("현대카드")  # issuer (custom mode)
        cinputs[1].fill("M카드")     # product_name
        page_h.click('form button[type="submit"]:has-text("저장")')
        page_h.wait_for_selector('text=카드 저장 완료', timeout=8000)
        log("H", "카드 등록 OK")
        shot(page_h, "A-03-card-created")

        # 4) 남편: 정기지출 등록 (넷플릭스 17,000원)
        page_h.click('button:has-text("정기지출")')
        time.sleep(0.3)
        page_h.click('button:has-text("+ 새로 등록")')
        page_h.wait_for_selector('text=💸 정기지출 등록', timeout=5000)
        page_h.fill('input[required]', "넷플릭스")  # 첫 required = 대상
        page_h.fill('input[placeholder="17000"]', "17000")
        page_h.fill('input[inputmode="numeric"].text-center', "15")
        # 분류
        page_h.locator('form select').last.select_option(value="MEDIA")
        page_h.click('form button[type="submit"]:has-text("저장")')
        page_h.wait_for_selector('text=정기지출 저장 완료', timeout=8000)
        log("H", "정기지출 등록 OK (17,000원)")
        shot(page_h, "A-04-flow-created")

        # 5) 아내: 데이터 동기화 대기 + 목록 진입 → 정기지출 확인
        time.sleep(1.2)
        goto_tab(page_w, "목록")
        page_w.wait_for_selector('text=넷플릭스', timeout=8000)
        log("W", "넷플릭스 항목 목록에 표시됨")
        shot(page_w, "A-05-wife-sees-flow")

        # 6) 아내: 정기지출 카드 탭 → 편집 모달 → 금액 50,000으로 변경
        page_w.click('button:has-text("넷플릭스")')
        page_w.wait_for_selector('text=💸 정기지출 수정', timeout=5000)
        amount_input = page_w.locator('input[placeholder="17000"]')
        amount_input.fill("50000")
        shot(page_w, "A-06-wife-editing")
        page_w.click('form button[type="submit"]:has-text("변경 사항 확인")')
        page_w.wait_for_selector('text=정기지출 변경 사항 확인', timeout=5000)
        # ReasonModal에서 "가족에 알림 보내기" (LIFE_EVENT) 카드 명시적 클릭
        # (diff 33,000원이라 추천은 CORRECTION이지만, 시나리오는 LIFE_EVENT 선택)
        page_w.click('button:has-text("가족에 알림 보내기")')
        shot(page_w, "A-07-reason-modal")
        page_w.locator('button:has-text("저장")').last.click()
        page_w.wait_for_selector('text=정기지출 저장 완료', timeout=10_000)
        log("W", "ReasonModal LIFE_EVENT로 저장 (17,000 → 50,000)")

        # 7) 남편 화면에 Realtime 토스트 등장 확인 (toast container를 polling)
        end = time.time() + 12
        toast_seen = False
        while time.time() < end:
            if page_h.locator('[data-testid="toast"]').count() > 0:
                txt = page_h.locator('[data-testid="toast"]').first.text_content()
                log("H", f"✅ Realtime 토스트: {txt}")
                toast_seen = True
                shot(page_h, "A-08-husband-realtime-toast")
                break
            time.sleep(0.25)
        if not toast_seen:
            log("H", "❌ Realtime 토스트 12초 내 안 뜸")
            shot(page_h, "A-08-husband-realtime-toast")

        # 8) 아내: 더보기 → 변경 기록 → Diff 확인
        goto_tab(page_w, "더보기")
        page_w.click('a:has-text("변경 기록")')
        page_w.wait_for_selector('text=📜 변경 기록', timeout=5000)
        time.sleep(0.4)
        # diff에 17,000 → 50,000 보이는지 (krw 포맷: "₩17,000", "₩50,000")
        diff_ok = False
        for token in ["17,000", "50,000"]:
            if page_w.locator(f'text={token}').first.is_visible(timeout=2000):
                diff_ok = True
                break
        log("W", f"변경기록 Diff: {'✅ 보임' if diff_ok else '❌ 안 보임'}")
        shot(page_w, "A-09-history-diff")

        # 9) 아내: "↩️ 되돌리기" 클릭
        page_w.click('button:has-text("되돌리기")')
        page_w.wait_for_selector('text=되돌림 완료', timeout=8000)
        log("W", "되돌리기 완료 토스트 OK")
        shot(page_w, "A-10-revert-done")

        # 10) 남편: 목록에서 금액이 원래(17,000)로 돌아왔는지
        time.sleep(1.5)
        goto_tab(page_h, "목록")
        page_h.click('button:has-text("정기지출")')
        time.sleep(0.5)
        flow_card = page_h.locator('button:has-text("넷플릭스")').first
        flow_text = flow_card.text_content() or ""
        reverted_ok = "17,000" in flow_text
        log("H", f"되돌림 반영: {'✅ 17,000' if reverted_ok else f'❌ ({flow_text[:80]})'}")
        shot(page_h, "A-11-husband-reverted")

        # 11) 남편: 초안 정기지출 등록 (학원비 - 변동/초안)
        page_h.click('button:has-text("+ 새로 등록")')
        page_h.wait_for_selector('text=💸 정기지출 등록', timeout=5000)
        page_h.fill('input[required]', "둘째 영어학원")
        page_h.locator('input[type="checkbox"]').first.check()  # "매달 달라요"
        page_h.fill('input[inputmode="numeric"].text-center', "20")
        # 초안 체크 (마지막 체크박스)
        page_h.locator('input[type="checkbox"]').last.check()
        page_h.click('form button[type="submit"]:has-text("저장")')
        page_h.wait_for_selector('text=정기지출 저장 완료', timeout=8000)
        log("H", "초안 정기지출 저장 OK")
        shot(page_h, "A-12-draft-created")

        # 12) 남편: /home 이동 → DraftResumeModal 등장
        goto_tab(page_h, "홈")
        time.sleep(1.0)
        try:
            page_h.wait_for_selector('text=작성 중이던 항목이 있어요', timeout=5000)
            draft_modal_ok = True
        except Exception:
            draft_modal_ok = False
        log("H", f"DraftResumeModal: {'✅ 등장' if draft_modal_ok else '❌ 안 보임'}")
        shot(page_h, "A-13-draft-resume-modal")

        # 13) "이어서 작성" → /list 자동 이동 + 편집 모달 자동 오픈
        if draft_modal_ok:
            page_h.click('button:has-text("이어서 작성")')
            try:
                page_h.wait_for_selector('text=💸 정기지출 수정', timeout=5000)
                log("H", "✅ 편집 모달 자동 오픈")
                shot(page_h, "A-14-draft-resumed")
            except Exception:
                log("H", "❌ 편집 모달 자동 오픈 실패")

        log("*", "시나리오 A 종료")
        browser.close()


if __name__ == "__main__":
    main()
