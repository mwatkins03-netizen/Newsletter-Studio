#!/usr/bin/env python3
"""Render an issue JSON to PDF with Chrome and a contact sheet.  python3 tools/pdf_check.py <issue.json> <out_dir>"""
import sys, os, json, math, subprocess
from playwright.sync_api import sync_playwright
src, out = sys.argv[1:3]; os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
html = subprocess.check_output(['node', '-e', "const R=require(process.argv[1]);const i=R.migrate(JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'))).issue;process.stdout.write(R.renderPrint(i))", os.path.join(here, '..', 'render.js'), src], text=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome"); pg = b.new_page()
    pg.set_content(html, wait_until="networkidle"); pg.wait_for_timeout(1200); pg.emulate_media(media="print")
    pg.pdf(path=f"{out}/print.pdf", prefer_css_page_size=True, print_background=True); b.close()
import pypdfium2 as pdfium
from PIL import Image
pdf = pdfium.PdfDocument(f"{out}/print.pdf"); n = len(pdf); ims = [pdf[i].render(scale=0.55).to_pil() for i in range(n)]
w, h = ims[0].size; cols = 5; rows = math.ceil(n / cols)
sheet = Image.new('RGB', (cols*(w+12)+12, rows*(h+12)+12), (214,220,230))
for i, im in enumerate(ims): sheet.paste(im, (12+(i%cols)*(w+12), 12+(i//cols)*(h+12)))
sheet.save(f"{out}/contact.png"); print(n, "pages ->", out)
