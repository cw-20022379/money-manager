"""로그인 + Home 진입 smoke."""
from playwright.sync_api import sync_playwright
from lib import HUSBAND, WIFE, new_ctx, sign_in, wait_for_app, shot, log

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx_h = new_ctx(browser, "H")
    ctx_w = new_ctx(browser, "W")
    page_h = ctx_h.new_page()
    page_w = ctx_w.new_page()

    sign_in(page_h, HUSBAND); log("H", "로그인 OK")
    wait_for_app(page_h); log("H", "App 진입 OK")
    shot(page_h, "00-husband-home")

    sign_in(page_w, WIFE); log("W", "로그인 OK")
    wait_for_app(page_w); log("W", "App 진입 OK")
    shot(page_w, "00-wife-home")

    print("smoke OK")
    browser.close()
