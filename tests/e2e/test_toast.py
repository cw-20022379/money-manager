"""토스트 stack + bottom 위치 검증.

- 토스트 3개 빠르게 발생 → stack 형태로 뒤로 중첩 표시
- depth=0(최신)은 scale 1.0, opacity 1.0
- depth>0은 scale 작아지고 위로 약간 밀려나며 opacity 떨어짐
- BottomNav(fixed bottom-0)보다 위에 위치
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


def main():
    cleanup()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = new_ctx(browser, "H")
        page = ctx.new_page()
        page.on("pageerror", lambda e: log("H", f"pageerror: {str(e)[:200]}"))

        sign_in(page, HUSBAND); wait_for_app(page)
        log("H", "로그인 OK")

        # dev 환경에 노출된 window.__pushToast로 즉시 3개 push
        page.evaluate(
            """() => {
                const p = window.__pushToast;
                p('계좌 저장 완료');
                p('카드 저장 완료');
                p('정기지출 저장 완료');
            }"""
        )
        log("H", "토스트 3건 push")

        # 즉시 토스트 stack 캡쳐 (5초 자동 소멸 전)
        time.sleep(0.3)
        toasts = page.locator('[data-testid="toast"]').all()
        log("H", f"표시중인 토스트: {len(toasts)}")

        # 위치 검증: BottomNav 위에 있는지 (BottomNav top ≒ viewport_height - ~60)
        viewport = page.viewport_size
        nav_box = page.locator('nav').first.bounding_box()
        toast_boxes = [t.bounding_box() for t in toasts]

        log("H", f"viewport h={viewport['height']}, BottomNav top={nav_box['y']:.0f}")
        for i, b in enumerate(toast_boxes):
            depth = toasts[i].get_attribute('data-toast-depth')
            log("H", f"  toast depth={depth}: y={b['y']:.0f}, h={b['height']:.0f}, w={b['width']:.0f}")

        # 모든 토스트가 BottomNav 위에 있는지
        all_above_nav = all(b['y'] + b['height'] <= nav_box['y'] for b in toast_boxes)
        log("H", f"모든 토스트가 하단 메뉴 위: {'✅' if all_above_nav else '❌'}")

        # depth=0이 가장 아래(=화면 하단), depth가 올라갈수록 y가 작아짐(위로)
        if len(toast_boxes) >= 2:
            y0 = toast_boxes[0]['y']
            y1 = toast_boxes[1]['y']
            stacked = y1 < y0  # 인덱스 1이 위로 밀려있음
            log("H", f"stack 방향(뒤가 위로): {'✅' if stacked else '❌'} (y0={y0:.0f}, y1={y1:.0f})")

            # 스케일 차이: depth 1은 width가 더 작아야 함
            scale_ok = toast_boxes[1]['width'] < toast_boxes[0]['width']
            log("H", f"scale 감소: {'✅' if scale_ok else '❌'} (w0={toast_boxes[0]['width']:.0f}, w1={toast_boxes[1]['width']:.0f})")

        shot(page, "T-01-stack-bottom")

        # opacity 확인 (computed style)
        if len(toasts) >= 2:
            op0 = page.evaluate("(el) => getComputedStyle(el).opacity", toasts[0].element_handle())
            op1 = page.evaluate("(el) => getComputedStyle(el).opacity", toasts[1].element_handle())
            log("H", f"opacity depth=0:{op0} / depth=1:{op1} ({'✅' if float(op1) < float(op0) else '❌'})")

        log("*", "토스트 시나리오 종료")
        browser.close()


if __name__ == "__main__":
    main()
