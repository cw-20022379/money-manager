"""Realtime 토스트 단독 디버그.

남편 페이지에 console 메시지를 모두 캡쳐하고, 아내가 정기지출 등록 시점부터
20초 대기하며 토스트 DOM이 생기는지 polling.
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

        page_h.on("console", lambda m: log("H", f"console.{m.type}: {m.text[:160]}"))
        page_h.on("pageerror", lambda e: log("H", f"pageerror: {str(e)[:200]}"))

        sign_in(page_h, HUSBAND); wait_for_app(page_h)
        sign_in(page_w, WIFE); wait_for_app(page_w)
        log("*", "두 명 로그인")
        time.sleep(2.0)  # Realtime 채널 구독 완료 대기

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
