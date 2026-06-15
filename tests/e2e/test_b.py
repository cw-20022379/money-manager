"""시나리오 B: Web Push (headless 한계 내).

이 테스트가 검증하는 것:
  Web Push 알림 기능의 서버 연동 파이프라인을 검증한다.
  실제 OS 알림을 띄우는 것은 headless 환경에서 불가능하므로,
  "브라우저 권한 팝업 없이 서버 API가 정상 동작하는가"에 초점을 맞춘다.

headless Chromium Web Push 한계와 우회 전략:
  - Headless Chromium에서 Notification.permission은 기본값이 'denied'(일부 버전)이거나
    lib.py의 new_ctx()에서 permissions=["notifications"]를 줘도 실제 OS 알림은 발생하지 않는다.
  - enablePush() 함수 내부의 Notification.requestPermission() → PushManager.subscribe() 흐름은
    headless에서 완전히 실행되지 않는다.
  - 따라서 검증을 두 레이어로 분리한다:

    (1) UI 표면 검증 — PushSettings 컴포넌트가 "더보기" 화면에 렌더링되는지,
        "켜기" 버튼(또는 "권한 거부됨" 메시지)이 보이는지.
        → 컴포넌트가 마운트되고 API 연결 여부 UI를 올바르게 표시하는지 확인.

    (2) 서버 라운드트립 검증 — 브라우저 page.evaluate()로 직접 fetch API를 호출해
        vapid-key 조회 → 가짜 구독 등록(POST /subscribe) → DB row 증가 확인 →
        명시적 구독 삭제(DELETE /subscribe) → DB row 감소 확인.
        → 브라우저 Web Push 권한과 무관하게 서버-DB 파이프라인이 동작하는지 확인.

    (3) lifecycle 이벤트로 자동 cleanup 검증 — 아내가 계좌를 등록해 lifecycle_events INSERT
        → 백엔드가 가짜 endpoint로 web-push 발송 시도 → 410/404 응답 수신 →
        push_subscriptions에서 해당 row 자동 삭제 확인.
        → 만료된 기기의 구독이 자동으로 정리되는 메커니즘을 검증.
"""
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from lib import HUSBAND, WIFE, new_ctx, sign_in, wait_for_app, goto_tab, shot, log, API_URL

ROOT = Path(__file__).resolve().parents[2]


def db_query(table_select: str):
    """service_role 키로 Supabase DB를 직접 쿼리한다.

    node -e 인라인 스크립트로 실행하는 이유:
      - Python에서 Supabase JS 클라이언트를 직접 쓰려면 별도 설정이 복잡하다.
      - apps/api는 이미 node + @supabase/supabase-js 환경이므로 인라인 스크립트로 재활용.
      - service_role 키는 RLS를 bypass하므로 테스트 데이터를 직접 확인할 수 있다.
    """
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
        # PushSettings 컴포넌트가 "더보기" 탭에 마운트되는지 확인.
        # 실제 push 권한 여부와 관계없이 UI 요소 자체가 렌더링되는지를 본다.
        goto_tab(page, "더보기")
        page.wait_for_selector('text=🔔 푸시 알림', timeout=5000)
        log("H", "PushSettings UI 노출됨 ✅")
        shot(page, "B-01-more-push-ui")

        # headless 환경의 Notification.permission 상태를 기록 (디버그 정보)
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
        # 브라우저 컨텍스트 내 localStorage에서 Supabase access_token을 꺼내
        # Authorization 헤더로 API를 직접 호출한다.
        # 브라우저 권한과 무관하게 서버 API가 200을 반환하는지 검증.
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
        # 실제 브라우저 PushSubscription 대신 FCM 엔드포인트 형태의 가짜 URL을 직접 POST.
        # 이를 통해 서버가 구독 데이터를 수신·저장하는 로직을 테스트.
        # timestamp를 붙여 재실행 시 중복 endpoint UNIQUE 제약 충돌을 방지.
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
        # 아내가 계좌를 등록하면 백엔드가 insertLifecycleEvent를 호출하고,
        # 가족 중 다른 사용자의 push_subscriptions endpoint로 web-push 발송을 시도한다.
        # 가짜 endpoint에 발송하면 FCM이 410 Gone / 404 Not Found를 반환하고,
        # 백엔드의 web-push 라이브러리가 이를 감지해 push_subscriptions에서 해당 row를 자동 삭제.
        # 이 동작이 실제로 일어나는지 3초 대기 후 DB에서 확인한다.
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
        # 가짜 endpoint가 아직 있다면(네트워크 타이밍 이슈로 자동 삭제가 늦은 경우)
        # 명시적으로 DELETE 요청해 정리하고, 이 API도 동작하는지 확인한다.
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
