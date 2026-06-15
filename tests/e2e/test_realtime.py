"""Realtime 토스트 단독 디버그.

이 테스트가 검증하는 것:
  test_a의 시나리오 A-7(Realtime 토스트) 부분을 독립 파일로 분리한 디버그 테스트.
  "아내가 데이터를 등록하면 남편 화면에 Realtime 토스트가 뜨는가"라는 단일 질문에 집중한다.

  이 파일이 별도로 존재하는 이유:
  - test_a는 12초 내 토스트를 기대하지만, 로컬 Supabase 환경에서는 Realtime 채널 구독 완료
    전에 이벤트가 발생하면 놓칠 수 있다.
  - 이 파일은 20초 polling + console 메시지 전량 캡처로 원인을 진단할 수 있다.
  - Realtime이 동작하지 않을 때 "채널 구독 이전에 이벤트가 발생했는지" vs
    "채널 구독 자체가 실패했는지" 구분하기 위해 console.log를 모두 캡처한다.

검증 구조:
  1. 남편·아내 로그인 후 2초 대기 → Realtime WebSocket 채널 구독 완료 보장.
  2. 아내가 계좌 등록 → lifecycle_events에 CREATED 이벤트 INSERT.
  3. Supabase Realtime이 lifecycle_events INSERT를 남편 컨텍스트로 전달.
  4. 남편 화면의 [data-testid="toast"] 출현을 20초간 polling.
  5. DB에서 lifecycle_events 실제 기록 여부 직접 조회 (토스트가 안 떴을 때 원인 파악).

console 캡처 의도:
  남편 페이지의 모든 console.log/warn/error를 캡처해
  "Realtime 채널 연결됨", "이벤트 수신" 같은 앱 로그가 찍히는지 확인.
  토스트가 안 뜰 때 "이벤트를 받긴 했는데 렌더링이 안 됐는지" vs "이벤트 자체를 못 받았는지" 판별.
"""
import subprocess, time, json
from pathlib import Path
from playwright.sync_api import sync_playwright
from lib import HUSBAND, WIFE, new_ctx, sign_in, wait_for_app, goto_tab, log

ROOT = Path(__file__).resolve().parents[2]


def main():
    subprocess.run(["node", "scripts/cleanup-test-family.mjs"], cwd=ROOT / "apps/api", check=True, capture_output=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_h = new_ctx(browser, "H")
        ctx_w = new_ctx(browser, "W")
        page_h = ctx_h.new_page()
        page_w = ctx_w.new_page()

        # 남편 콘솔 메시지 전량 캡처 — Realtime 구독 성공/실패 및 이벤트 수신 여부 진단용
        page_h.on("console", lambda m: log("H", f"console.{m.type}: {m.text[:160]}"))
        page_h.on("pageerror", lambda e: log("H", f"pageerror: {str(e)[:200]}"))

        sign_in(page_h, HUSBAND); wait_for_app(page_h)
        sign_in(page_w, WIFE); wait_for_app(page_w)
        log("*", "두 명 로그인")
        # Realtime WebSocket 채널 구독이 완료될 때까지 충분히 대기.
        # Supabase Realtime 채널은 로그인 후 비동기로 연결되므로,
        # 대기 없이 바로 이벤트를 발생시키면 구독 전 이벤트를 놓칠 수 있다.
        time.sleep(2.0)

        # 아내가 정기지출 등록 (계좌, 카드 먼저)
        goto_tab(page_w, "목록")
        page_w.click('button:has-text("계좌")'); page_w.click('button:has-text("+ 새로 등록")')
        page_w.wait_for_selector('text=🏦 계좌 등록')
        ins = page_w.locator('form input').all()
        ins[0].fill("KB국민은행"); ins[1].fill("월급")
        page_w.click('form button[type="submit"]:has-text("저장")')
        page_w.wait_for_selector('text=계좌 저장 완료')
        log("W", "계좌 등록 → 남편 토스트 기대")

        # 남편 페이지에서 20초간 토스트 polling
        # test_a의 12초보다 여유 있게 설정해 타이밍 이슈로 인한 오탐을 최소화
        end = time.time() + 20
        found = False
        while time.time() < end:
            toast_count = page_h.locator('[data-testid="toast"]').count()
            if toast_count > 0:
                txt = page_h.locator('[data-testid="toast"]').first.text_content()
                log("H", f"✅ 토스트 발견: {txt}")
                found = True
                break
            time.sleep(0.3)
        if not found:
            log("H", "❌ 20초간 토스트 안 뜸")

        # 추가 검증: DB에 lifecycle_events 들어갔는지
        # 토스트가 안 떴어도 DB에 이벤트가 있으면 "Realtime 연결 문제"임을 알 수 있고,
        # DB에도 없으면 "백엔드 lifecycle 기록 로직 문제"임을 알 수 있다.
        out = subprocess.run(
            ["node", "-e",
             "const {createClient}=require('@supabase/supabase-js');"
             "const fs=require('fs');"
             "const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\\n').filter(Boolean).filter(l=>!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));"
             "const c=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);"
             "c.from('lifecycle_events').select('id,subject_kind,event_type,notify_spouse,actor_user_id').then(r=>console.log(JSON.stringify(r.data||[])));"],
            cwd=ROOT / "apps/api", capture_output=True, text=True,
        )
        events = json.loads(out.stdout.strip().splitlines()[-1])
        log("*", f"DB lifecycle_events: {len(events)} → {events}")

        browser.close()


if __name__ == "__main__":
    main()
