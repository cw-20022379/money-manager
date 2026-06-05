"""시나리오 B: Web Push (headless 한계 내).

Headless chromium은 Notification.permission이 default로 'denied'라 enablePush()의 권한 요청에서 막힌다.
그래서 검증을 둘로 나눈다:

  (1) UI 표면 — More 화면에 PushSettings가 노출되고 '켜기' 버튼이 보임.
  (2) 서버 라운드트립 — 페이지 컨텍스트의 fetch로 직접 vapid-key 조회/구독 등록/삭제를 검증.
      DB의 push_subscriptions row가 늘었다 줄어드는지 확인.

(3) lifecycle 이벤트 INSERT 시 push 발송 시도가 일어나는지 — 잘못된 endpoint 사용 시
    `web-push`가 410/404를 받아 자동 정리되므로 잠시 후 row가 다시 0인지 확인.
"""
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from lib import HUSBAND, WIFE, new_ctx, sign_in, wait_for_app, goto_tab, shot, log, API_URL

ROOT = Path(__file__).resolve().parents[2]


def db_query(table_select: str):
    """service_role로 단순 셀렉트."""
    snippet = (
        "const {createClient}=require('@supabase/supabase-js');"
        "const fs=require('fs');"
        "const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\\n').filter(Boolean).filter(l=>!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));"
        "const c=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);"
        f"{table_select}.then(r=>console.log(JSON.stringify(r.data||[])));"
    )
    out = subprocess.run(
        ["node", "-e", snippet],
        cwd=ROOT / "apps/api", capture_output=True, text=True, timeout=15,
    )
    if out.returncode != 0:
        raise RuntimeError(f"db_query failed: {out.stderr}")
    return json.loads(out.stdout.strip().splitlines()[-1])


def db_count_subs():
    return db_query("c.from('push_subscriptions').select('user_id,endpoint')")


def wipe_all():
    subprocess.run(
        ["node", "scripts/cleanup-test-family.mjs"],
        cwd=ROOT / "apps/api", check=True, capture_output=True,
    )
    subprocess.run(
        ["node", "-e",
         "const {createClient}=require('@supabase/supabase-js');"
         "const fs=require('fs');"
         "const env=Object.fromEntries(fs.readFileSync('.env','utf8').split('\\n').filter(Boolean).filter(l=>!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));"
         "const c=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);"
         "c.from('push_subscriptions').delete().neq('endpoint','').then(()=>console.log('cleared'));"],
        cwd=ROOT / "apps/api", capture_output=True, text=True,
    )


def main():
    wipe_all()
    log("*", "family + push_subscriptions wipe")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = new_ctx(browser, "H")
        page = ctx.new_page()
        page.on("pageerror", lambda e: log("H", f"pageerror: {e}"))

        sign_in(page, HUSBAND); wait_for_app(page)
        log("H", "로그인 OK")

        # === (1) UI 표면 검증 ===
        goto_tab(page, "더보기")
        page.wait_for_selector('text=🔔 푸시 알림', timeout=5000)
        log("H", "PushSettings UI 노출됨 ✅")
        shot(page, "B-01-more-push-ui")

        perm = page.evaluate("() => Notification.permission")
        log("H", f"Notification.permission = {perm} (headless 기본)")

        sw_supported = page.evaluate(
            "() => 'serviceWorker' in navigator && 'PushManager' in window"
        )
        log("H", f"SW + PushManager: {sw_supported}")

        # 버튼이 표시되는지 (default/granted면 '켜기', denied면 '권한 거부됨')
        btn_on = page.locator('button:has-text("켜기")').count() > 0
        denied = page.locator('text=권한 거부됨').count() > 0
        log("H", f"버튼 상태: {'켜기 활성' if btn_on else ('권한 거부 표시' if denied else '?')}")

        # === (2) 서버 라운드트립: vapid-key 조회 ===
        vapid = page.evaluate(
            """async () => {
                const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'));
                const raw = k ? localStorage.getItem(k) : null;
                const token = raw ? JSON.parse(raw).access_token : null;
                const r = await fetch('http://127.0.0.1:3000/api/notifications/push/vapid-key', {
                    headers: { Authorization: 'Bearer ' + token },
                });
                return { status: r.status, body: await r.json() };
            }"""
        )
        log("H", f"GET /vapid-key → {vapid['status']}, publicKey: {'있음 ✅' if vapid['body'].get('publicKey') else '없음 ❌'}")

        # === (3) 가짜 구독 등록 ===
        fake_endpoint = "https://fcm.googleapis.com/fcm/send/FAKE_FOR_TEST_" + str(int(time.time()))
        sub_resp = page.evaluate(
            """async (endpoint) => {
                const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'));
                const token = k ? JSON.parse(localStorage.getItem(k)).access_token : null;
                const r = await fetch('http://127.0.0.1:3000/api/notifications/push/subscribe', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
                    body: JSON.stringify({
                        endpoint,
                        keys: { p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa40HI3kBJpw2_TestStubKeyForLocalE2E_AAAAAAAAAAAAAAAA', auth: 'TestAuthSecret123456==' },
                    }),
                });
                return { status: r.status, body: await r.text() };
            }""",
            fake_endpoint,
        )
        log("H", f"POST /subscribe → {sub_resp['status']} {sub_resp['body'][:80]}")
        subs_after_post = db_count_subs()
        log("*", f"DB push_subscriptions: {len(subs_after_post)}")
        post_ok = sub_resp['status'] == 200 and any(s['endpoint'] == fake_endpoint for s in subs_after_post)
        log("H", f"구독 등록(서버 라운드트립): {'✅' if post_ok else '❌'}")

        # === (4) 가짜 endpoint로 lifecycle event 발생 → push 발송 시도 → 410으로 자동 정리 ===
        # 정기지출을 등록하면 insertLifecycleEvent가 호출되고, 가짜 endpoint로 web-push 발송 시도가 일어남.
        # 단, owner가 본인이라 notify_spouse가 false일 수 있음. 다른 사용자가 등록하면 알림이 감.
        # 여기서는 두번째 브라우저(아내)로 정기지출 등록 → 남편 endpoint에 발송 시도 → 410 → 자동 cleanup.
        ctx_w = new_ctx(browser, "W")
        page_w = ctx_w.new_page()
        sign_in(page_w, WIFE); wait_for_app(page_w)
        goto_tab(page_w, "목록")
        # 계좌가 없으면 등록 페이지가 노출됨. 새 계좌 빠르게.
        page_w.click('button:has-text("계좌")')
        page_w.click('button:has-text("+ 새로 등록")')
        page_w.wait_for_selector('text=🏦 계좌 등록', timeout=5000)
        ins = page_w.locator('form input').all()
        ins[0].fill("우리은행"); ins[1].fill("주거래")
        page_w.click('form button[type="submit"]:has-text("저장")')
        page_w.wait_for_selector('text=계좌 저장 완료', timeout=8000)
        log("W", "계좌 등록 (lifecycle 이벤트 1건)")

        # 잠시 대기 — web-push가 가짜 endpoint로 발송 시도 → 410/404 → row 자동 삭제
        time.sleep(3.0)
        subs_after_push = db_count_subs()
        cleanup_ok = not any(s['endpoint'] == fake_endpoint for s in subs_after_push)
        log("*", f"발송 시도 후 DB: {len(subs_after_push)} (가짜 endpoint {'삭제됨 ✅' if cleanup_ok else '아직 있음'})")

        # === (5) 명시적 DELETE (남은 row 있으면 정리) ===
        del_resp = page.evaluate(
            """async (endpoint) => {
                const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token'));
                const token = k ? JSON.parse(localStorage.getItem(k)).access_token : null;
                const r = await fetch('http://127.0.0.1:3000/api/notifications/push/subscribe', {
                    method: 'DELETE',
                    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
                    body: JSON.stringify({ endpoint }),
                });
                return r.status;
            }""",
            fake_endpoint,
        )
        log("H", f"DELETE /subscribe → {del_resp}")
        final = db_count_subs()
        log("*", f"최종 DB: {len(final)}")

        shot(page, "B-99-end")
        log("*", "시나리오 B 종료")
        browser.close()


if __name__ == "__main__":
    main()
