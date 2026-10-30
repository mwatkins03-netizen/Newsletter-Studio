#!/usr/bin/env python3
"""Smoke-test the studio in headless Chrome and export evidence (screenshots + PDF).
   python3 tools/check_studio.py http://localhost:8781 <evidence_dir>"""
import sys, os, json, time
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(base + "/", wait_until="networkidle")
    pg.wait_for_selector("#canvas .blk")
    n = pg.locator("#canvas .blk").count()
    words = pg.locator("#wc").inner_text()
    print("blocks on canvas:", n, "| words:", words)
    pg.screenshot(path=f"{out}/01-studio.png")
    # edit a field in place and check it persists after reload
    head = pg.locator('#canvas .blk[data-type="story"] [data-field$=".head"]').first
    head.click(); pg.keyboard.press("Meta+A"); pg.keyboard.type("Edited headline from the smoke test")
    pg.wait_for_timeout(900)
    pg.reload(wait_until="networkidle"); pg.wait_for_selector("#canvas .blk")
    kept = pg.locator('#canvas .blk[data-type="story"] [data-field$=".head"]').first.inner_text()
    print("after reload headline:", kept)
    assert "Edited headline" in kept, "edit did not persist"
    # insert each block type via the palette
    types = pg.eval_on_selector_all("#palette button", "els => els.map(e => e.dataset.type)")
    for t in types:
        pg.click(f'#palette button[data-type="{t}"]'); pg.wait_for_timeout(120)
    n2 = pg.locator("#canvas .blk").count()
    print("blocks after inserting every type:", n2, "(added", n2 - n, "of", len(types), ")")
    assert n2 - n == len(types)
    pg.screenshot(path=f"{out}/02-inspector.png")
    # preview editions
    pg.click("#modePreview"); pg.wait_for_timeout(600)
    for ed in ["web", "email", "print"]:
        pg.click(f'.pbar [data-ed="{ed}"]'); pg.wait_for_timeout(1200)
        pg.screenshot(path=f"{out}/03-preview-{ed}.png")
    # export the issue JSON via the renderer and write the three editions + PDF
    data = pg.evaluate("() => JSON.parse(localStorage.getItem('newsletter-studio-v1'))")
    cur = data["issues"][data["current"]]
    json.dump(cur, open(f"{out}/issue.json", "w"), indent=1)
    html = {k: pg.evaluate(f"(i) => NSRender.render{k}(i)", cur) for k in ["Web", "Email", "Print"]}
    for k, v in html.items(): open(f"{out}/{k.lower()}.html", "w").write(v)
    # print edition → PDF with Chrome's print engine, Letter, honoring @page
    pp = ctx.new_page(); pp.set_content(html["Print"], wait_until="networkidle"); pp.wait_for_timeout(1200)
    pp.emulate_media(media="print")
    pp.pdf(path=f"{out}/print.pdf", prefer_css_page_size=True, print_background=True)
    # web edition at phone and desktop widths
    for w in [375, 1280]:
        wp = ctx.new_page(); wp.set_viewport_size({"width": w, "height": 900}); wp.set_content(html["Web"], wait_until="networkidle"); wp.wait_for_timeout(800)
        wp.screenshot(path=f"{out}/04-web-{w}.png", full_page=(w == 375))
        over = wp.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")
        print(f"web {w}px horizontal overflow:", over)
    ep = ctx.new_page(); ep.set_viewport_size({"width": 700, "height": 900}); ep.set_content(html["Email"]); ep.wait_for_timeout(500)
    ep.screenshot(path=f"{out}/05-email.png", full_page=True)
    b.close()
print("console errors:", errors or "none")
print("evidence in", out)
