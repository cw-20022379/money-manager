"""토스트 stack + bottom 위치 검증.

이 테스트가 검증하는 것:
  토스트 UI 컴포넌트의 시각적 동작을 픽셀 단위로 검증한다.
  Realtime/API 연동과 무관하게 토스트 시스템 자체의 레이아웃이 올바른지 확인.

  검증 항목:
  1. Stack 효과: 토스트 3개가 동시에 있을 때 "카드 더미처럼 뒤로 쌓이는" 시각적 처리.
     - depth=0(최신): scale 1.0, opacity 1.0, 화면 가장 아래(BottomNav 바로 위)
     - depth=1(이전): scale 작아짐(width 감소), 위로 약간 밀려남(y 감소), opacity 떨어짐
     - depth=2(더 이전): 더 작고 더 위로

  2. BottomNav 위 배치: 모든 토스트의 하단(y + height)이 BottomNav의 상단(y) 이하인지.
     fixed bottom-0인 BottomNav와 토스트가 겹치면 안 된다.

  3. Scale 감소: depth가 증가할수록 width가 작아져야 한다 (CSS scale transform 검증).

  4. Opacity 감소: depth가 증가할수록 computed opacity가 낮아야 한다.

window.__pushToast 사용 이유:
  Realtime 이벤트를 기다리지 않고 dev 환경에서만 노출되는
  window.__pushToast 전역 함수로 토스트를 즉시 주입한다.
  이렇게 하면 Supabase 연동 없이 토스트 컴포넌트 자체의 레이아웃·애니메이션만 격리 검증 가능.
  (프로덕션 빌드에서는 이 전역 함수가 없으므로 자동으로 비활성화됨)

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
        # Supabase Realtime 대기 없이 토스트 레이아웃만 격리 검증
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
        # toasts 배열의 인덱스 0이 depth=0(최신), 인덱스 1이 depth=1(이전 토스트)
        if len(toast_boxes) >= 2:
            y0 = toast_boxes[0]['y']
            y1 = toast_boxes[1]['y']
            stacked = y1 < y0  # 인덱스 1이 위로 밀려있음
            log("H", f"stack 방향(뒤가 위로): {'✅' if stacked else '❌'} (y0={y0:.0f}, y1={y1:.0f})")

            # 스케일 차이: depth 1은 width가 더 작아야 함 (CSS scale 적용 결과)
            scale_ok = toast_boxes[1]['width'] < toast_boxes[0]['width']
            log("H", f"scale 감소: {'✅' if scale_ok else '❌'} (w0={toast_boxes[0]['width']:.0f}, w1={toast_boxes[1]['width']:.0f})")

        shot(page, "T-01-stack-bottom")

        # opacity 확인 (computed style)
        # depth=0이 opacity:1, depth=1이 더 낮은 값이어야 한다
        if len(toasts) >= 2:
            op0 = page.evaluate("(el) => getComputedStyle(el).opacity", toasts[0].element_handle())
            op1 = page.evaluate("(el) => getComputedStyle(el).opacity", toasts[1].element_handle())
            log("H", f"opacity depth=0:{op0} / depth=1:{op1} ({'✅' if float(op1) < float(op0) else '❌'})")

        log("*", "토스트 시나리오 종료")
        browser.close()


if __name__ == "__main__":
    main()
