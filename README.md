# Newsletter Studio

A local-first visual editor for a newsletter. Write an issue once, on the designed page itself, and publish it three ways:

| Edition | What it is | How to get it |
|---|---|---|
| Web | Self-contained responsive HTML page, light and dark, keyboard accessible | Export → Web page |
| Email | 600px table layout, inline styles, no scripts, grid or web fonts; reads with images off | Export → Email, or Copy email HTML |
| Print / PDF | US Letter publication: cover with contents, running heads, page numbers, link appendix | Export → Print / PDF, then Save as PDF |

The canonical file is **issue JSON** (`schema: newsletter-studio/issue`, version 1). Everything else is rendered from it by pure functions in `render.js`. Keep the JSON; the HTML and PDF can always be remade.

No build step, no accounts, no server. Open `index.html` over any static host (GitHub Pages works). Issues autosave to the browser's localStorage, with a History of the last 15 autosaves per issue. Export the JSON when an issue is done.

## Files

```
index.html     the studio shell
studio.css     editor chrome (the canvas uses the web edition's own CSS)
studio.js      the editor: in-place editing, block palette, outline, inspector, previews, exports, history, import
render.js      pure renderers: renderWeb, renderEmail, renderPrint, renderWordPress + sanitizer, schema, migrate
samples/       Taming the Whirlwind, Issue 1 as issue JSON, plus its exported PDF and a contact sheet
tools/test-render.mjs   acceptance tests for the renderers (node tools/test-render.mjs)
tools/check_studio.py   headless smoke test of the studio: edit, reload, insert every block, previews, PDF
tools/pdf_check.py      issue JSON → PDF + contact sheet with Chrome
tools/sync-preview.sh   copies the studio to /tmp/newsletter-studio for local preview (Box paths are not servable)
```

## Editing

- Click any text on the page and type. Select text in a body field for **bold**, *italic* and links (⌘/Ctrl+K). Enter adds a line break.
- Select a block, or click its gear, for the settings that are not text: link URLs, access labels, images, panel tones, list style, heading level.
- Add blocks from the left palette; a new block lands after the selected one. Reorder by dragging the outline or with Alt+↑/↓.
- Images can be uploaded (resized to 1600px and stored in the JSON) or linked by URL. The email edition needs a public URL, set in the block.
- Preview shows each edition at phone, email and desktop widths. "Open in a tab" opens the real file.

## Blocks

Group band · Section head · Heading · Paragraph · Story (kicker, headline, body, sources with access labels, "For your classroom") · Pull quote · Image · Editorial note (editor / review banner / plain) · Resource card · Callout panel (red, powder, navy, blue, plain, following the Whirlwind style sheet) · Dates list · List · In this issue (auto from section heads) · Disclosure · Rule.

## Security

Every string that reaches an edition passes `esc()`, `cleanInline()` (allows only b, i, a[href], br, sup, sub) or `safeUrl()` (http, https, mailto, in-page anchors; images also allow `data:image/...`). `javascript:`, `vbscript:` and `data:text/html` URLs, event-handler attributes, scripts and styles cannot reach any export; `tools/test-render.mjs` checks this. Theme colors must be 6-digit hex and font names plain text, or they fall back to the defaults. Unknown block types in an imported file are kept and reported, never dropped silently.

## WordPress

Export → Copy for WordPress puts Gutenberg HTML block markup on the clipboard. In WordPress, start a new post, switch to the Code editor, paste, and save as a draft. Nothing here talks to WordPress directly and nothing is ever published from the studio.

## Verifying

```
node tools/test-render.mjs
./tools/sync-preview.sh && (cd /tmp/newsletter-studio && python3 -m http.server 8780)
python3 tools/check_studio.py http://127.0.0.1:8780 /tmp/ns-evidence
python3 tools/pdf_check.py samples/taming-the-whirlwind-issue-1.json /tmp/ns-pdf
```

`check_studio.py` and `pdf_check.py` use Playwright with the installed Chrome (`channel="chrome"`) and `pypdfium2` for the contact sheet.

## Design

The default theme is the University of Mississippi brand used by Taming the Whirlwind: Oxford Blue, Lyceum Red, Powder Blue, IBM Plex Sans and Serif, with Archivo standing in for Termina. Fonts load from Google Fonts in the studio, the web edition and the print edition; the email edition uses Arial. All colors and fonts are editable under Publication.

Built by Marc Watkins with Claude. No AI-generated images.
