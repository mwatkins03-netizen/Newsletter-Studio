/* Newsletter Studio · render.js
   Pure renderers from issue JSON to three editions: web HTML, email HTML, print HTML.
   No DOM, no editor markup, no network. Runs in the browser and in Node.
   Everything that reaches output passes through esc(), cleanInline() or safeUrl(). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NSRender = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCHEMA = 'newsletter-studio/issue';
  const VERSION = 1;

  // ---------- escaping and sanitizing ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(s) { return esc(s); }
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  function decode(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
    });
  }
  /** Link and image URLs: only http(s), mailto and in-page anchors. Images also allow data:image. */
  function safeUrl(u, kind) {
    let s = String(u == null ? '' : u).trim().replace(/[\u0000-\u001f\u007f]/g, '');
    if (!s) return '';
    if (kind === 'image' && /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
    if (/^#[\w-]+$/.test(s)) return s;
    if (/^mailto:[^\s<>"']+$/i.test(s) && kind !== 'image') return s;
    try {
      const url = new URL(s);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (e) { /* not a URL */ }
    return '';
  }
  /** Inline rich text: keep only b/strong, i/em, a[href], br, sup, sub. Everything else is flattened to text. */
  function cleanInline(html) {
    const src = String(html == null ? '' : html);
    const out = [];
    const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<!--[\s\S]*?-->|([^<]+)|</g;
    let m, openA = 0, skip = null;
    while ((m = re.exec(src))) {
      if (skip) { if (m[1] && m[1].toLowerCase() === skip && m[0][1] === '/') skip = null; continue; }
      if (m[3] != null) { out.push(esc(decode(m[3]))); continue; }
      if (m[0] === '<') { out.push('&lt;'); continue; }
      if (!m[1]) continue; // comment
      const tag = m[1].toLowerCase(); const closing = m[0][1] === '/';
      if ((tag === 'script' || tag === 'style' || tag === 'template' || tag === 'svg' || tag === 'math') && !closing) { skip = tag; continue; }
      if (tag === 'b' || tag === 'strong') out.push(closing ? '</b>' : '<b>');
      else if (tag === 'i' || tag === 'em') out.push(closing ? '</i>' : '<i>');
      else if (tag === 'sup' || tag === 'sub') out.push(closing ? `</${tag}>` : `<${tag}>`);
      else if (tag === 'br' && !closing) out.push('<br>');
      else if (tag === 'div' || tag === 'p') { if (closing) out.push('<br>'); }
      else if (tag === 'a') {
        if (closing) { if (openA) { out.push('</a>'); openA--; } }
        else {
          const hm = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2] || '');
          const href = safeUrl(decode(hm ? (hm[2] ?? hm[3] ?? hm[4] ?? '') : ''));
          if (href) { out.push(`<a href="${attr(href)}">`); openA++; }
        }
      }
      // any other tag: dropped, its text is kept
    }
    while (openA-- > 0) out.push('</a>');
    // balance b/i crudely: count opens vs closes
    let s = out.join('');
    for (const t of ['b', 'i', 'sup', 'sub']) {
      const o = (s.match(new RegExp(`<${t}>`, 'g')) || []).length, c = (s.match(new RegExp(`</${t}>`, 'g')) || []).length;
      for (let k = c; k < o; k++) s += `</${t}>`;
    }
    return s.replace(/(<br>\s*)+$/,'');
  }
  function textOf(html) { return decode(String(html == null ? '' : html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
  function words(s) { const t = textOf(s); return t ? t.split(/\s+/).length : 0; }
  const HEX = /^#[0-9a-fA-F]{6}$/;
  function color(c, fallback) { return HEX.test(String(c || '')) ? c : fallback; }
  function font(f, fallback) { const s = String(f || '').trim(); return s && /^[A-Za-z0-9 ,'"\-]+$/.test(s) ? s : fallback; }

  // ---------- defaults, schema, migration ----------
  const THEME = {
    navy: '#142142', red: '#CF142B', powder: '#006BA6', light: '#B1DDF6', panel: '#F3F6FA', rule: '#D6DCE6',
    ink: '#1D2638', muted: '#4A5568', paper: '#FFFFFF',
    fontDisplay: 'Archivo', fontBody: 'IBM Plex Serif', fontUi: 'IBM Plex Sans',
  };
  function theme(t) {
    t = t || {};
    const o = {};
    for (const k of Object.keys(THEME)) o[k] = k.startsWith('font') ? font(t[k], THEME[k]) : color(t[k], THEME[k]);
    return o;
  }
  function uid() { return 'b' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }

  const BLOCKS = {
    band:       { label: 'Group band',      make: () => ({ text: 'New group' }) },
    section:    { label: 'Section head',    make: () => ({ label: 'Section label', heading: 'Section heading', deck: '' }) },
    heading:    { label: 'Heading',         make: () => ({ text: 'Heading', level: 3 }) },
    paragraph:  { label: 'Paragraph',       make: () => ({ html: '' }) },
    story:      { label: 'Story',           make: () => ({ kicker: 'Kicker', head: 'What happened', body: '', links: [{ title: 'Source title', url: '', outlet: '', date: '', access: 'Free' }], classroom: '' }) },
    quote:      { label: 'Pull quote',      make: () => ({ text: 'Quotation', cite: '' }) },
    image:      { label: 'Image',           make: () => ({ src: '', publicSrc: '', alt: '', caption: '', size: 'full' }) },
    note:       { label: 'Editorial note',  make: () => ({ label: 'From the editor', html: '', tone: 'editor' }) },
    resource:   { label: 'Resource card',   make: () => ({ title: 'Resource', url: '', source: '', access: 'Free', html: '', um: false, buttonText: 'Open' }) },
    callout:    { label: 'Callout panel',   make: () => ({ label: '', heading: 'Callout', html: '', tone: 'red' }) },
    events:     { label: 'Dates list',      make: () => ({ items: [{ date: 'Nov 1', when: '', title: 'Event', url: '', detail: '', where: '' }] }) },
    list:       { label: 'List',            make: () => ({ style: 'bullets', items: [''] }) },
    toc:        { label: 'In this issue',   make: () => ({ label: 'In this issue' }) },
    disclosure: { label: 'Disclosure',      make: () => ({ label: 'Disclosure', heading: 'How this issue was made', items: [{ term: 'AI tool used', text: '' }], foot: '' }) },
    divider:    { label: 'Rule',            make: () => ({}) },
  };
  const ACCESS = ['Free', 'UM access', 'Metered', 'Paywalled', 'Limited'];

  function newIssue(partial) {
    const now = new Date().toISOString();
    return Object.assign({
      schema: SCHEMA, version: VERSION, id: uid(), created: now, updated: now,
      publication: {
        title: 'Newsletter title', kicker: 'Organization · Unit', dek: 'One sentence on who this is for and what it covers.',
        publisher: 'Publisher', editor: 'Editor', contact: 'editor@example.edu', address: '', url: '',
        footer: '', theme: Object.assign({}, THEME),
      },
      issue: { number: 1, month: '', coverage: '', status: '' },
      blocks: [],
    }, partial || {});
  }
  function makeBlock(type) {
    const def = BLOCKS[type]; if (!def) throw new Error('Unknown block type ' + type);
    return Object.assign({ id: uid(), type }, def.make());
  }
  /** Normalize any object into a valid issue: unknown block types are kept as `unknown` so nothing is silently lost. */
  function migrate(raw) {
    const problems = [];
    if (!raw || typeof raw !== 'object') { problems.push('Not an object'); return { issue: newIssue(), problems }; }
    if (raw.schema && raw.schema !== SCHEMA) problems.push(`Schema is ${raw.schema}, expected ${SCHEMA}`);
    let v = Number(raw.version) || 0;
    const issue = newIssue();
    issue.id = typeof raw.id === 'string' && raw.id ? raw.id : issue.id;
    issue.created = raw.created || issue.created; issue.updated = raw.updated || issue.updated;
    const p = raw.publication || {};
    for (const k of Object.keys(issue.publication)) if (k !== 'theme' && p[k] != null) issue.publication[k] = String(p[k]);
    issue.publication.theme = theme(p.theme);
    const i = raw.issue || {};
    issue.issue = { number: i.number == null ? 1 : (Number(i.number) || String(i.number)), month: String(i.month || ''), coverage: String(i.coverage || ''), status: String(i.status || '') };
    const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
    issue.blocks = blocks.map((b, n) => {
      if (!b || typeof b !== 'object') { problems.push(`Block ${n} is not an object; dropped`); return null; }
      if (!BLOCKS[b.type]) { problems.push(`Block ${n}: unknown type "${b.type}" kept as unknown`); return { id: b.id || uid(), type: 'unknown', original: b }; }
      const fresh = makeBlock(b.type);
      const out = Object.assign(fresh, b, { id: typeof b.id === 'string' && b.id ? b.id : fresh.id, type: b.type });
      // array fields must be arrays of objects/strings
      for (const k of ['links', 'items']) if (k in fresh && !Array.isArray(out[k])) { problems.push(`Block ${n}: ${k} repaired`); out[k] = fresh[k]; }
      return out;
    }).filter(Boolean);
    // version-specific upgrades go here: if (v < 2) {...}
    issue.version = VERSION;
    if (v && v > VERSION) problems.push(`Issue was saved by a newer version (${v}); some fields may be ignored`);
    return { issue, problems };
  }
  function wordCount(issue) {
    let n = 0;
    for (const b of issue.blocks || []) {
      for (const k of ['text', 'html', 'body', 'head', 'heading', 'deck', 'classroom', 'caption', 'cite', 'foot']) if (typeof b[k] === 'string') n += words(b[k]);
      for (const it of b.items || []) { if (typeof it === 'string') n += words(it); else for (const k of ['title', 'detail', 'text', 'term']) if (typeof it[k] === 'string') n += words(it[k]); }
    }
    return n;
  }
  function slug(s) { return textOf(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section'; }
  function sectionIds(issue) {
    const used = new Set(); const map = {};
    for (const b of issue.blocks) if (b.type === 'section') { let s = slug(b.heading || b.label), k = s, n = 2; while (used.has(k)) k = `${s}-${n++}`; used.add(k); map[b.id] = k; }
    return map;
  }
  function accClass(a) { return a === 'UM access' ? 'um' : ''; }

  // =====================================================================
  //  WEB EDITION  (also used by the editor canvas, with ctx.edit = true)
  // =====================================================================
  function webCss(T) {
    return `
.nl{--navy:${T.navy};--red:${T.red};--powder:${T.powder};--sky:${T.light};--panel:${T.panel};--rule:${T.rule};--ink:${T.ink};--muted:${T.muted};--paper:${T.paper};
 --display:"${T.fontDisplay}","Arial Black",Arial,sans-serif;--serif:"${T.fontBody}",Georgia,"Times New Roman",serif;--sans:"${T.fontUi}","Helvetica Neue",Arial,sans-serif;
 --bg:var(--paper);--surface:var(--panel);--text:var(--ink);--heading:var(--navy);--link:var(--powder);--accent:var(--red);--chip:#E6EEF7;--band:var(--navy);--band-ink:#fff;--band-muted:var(--sky);
 background:var(--bg);color:var(--text);font-family:var(--serif);font-size:17.5px;line-height:1.6;margin:0;-webkit-text-size-adjust:100%}
@media (prefers-color-scheme:dark){.nl.auto-dark{--bg:#0c1328;--surface:#141d38;--text:#dde3ee;--heading:#fff;--muted:#9aa6c0;--rule:#28335a;--accent:#FF6170;--link:#8fcdf0;--chip:#1d2a4d;color-scheme:dark}}
.nl *,.nl *::before,.nl *::after{box-sizing:border-box}
.nl a{color:var(--link);text-underline-offset:2px;text-decoration-thickness:1px}
.nl a:hover{text-decoration-thickness:2px}
.nl a:focus-visible,.nl button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
.nl .gut{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.nl .col{max-width:760px;margin:0 auto}
.nl h1,.nl h2,.nl h3,.nl h4{text-wrap:balance;margin:0;color:var(--heading)}
.nl p{margin:0}
.nl .skip{position:absolute;left:-999px;top:8px;background:#fff;color:#000;padding:8px 12px;z-index:9}
.nl .skip:focus{left:8px}
/* masthead */
.nl .mast{background:var(--band);color:var(--band-ink);border-bottom:6px solid var(--red)}
.nl .mast .col{padding-block:36px 30px;display:flex;flex-direction:column;gap:14px}
.nl .kicker{font-family:var(--sans);font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--band-muted)}
.nl .mast h1{font-family:var(--display);font-stretch:125%;font-weight:800;font-size:clamp(30px,6.4vw,56px);line-height:1.02;letter-spacing:-.01em;color:var(--band-ink);text-transform:uppercase}
.nl .mast .dek{font-size:19px;max-width:56ch;color:var(--band-ink)}
.nl .issuebar{display:flex;flex-wrap:wrap;gap:8px 22px;font-family:var(--sans);font-size:14px;color:var(--band-muted);border-top:1px solid rgba(177,221,246,.35);padding-top:12px}
.nl .issuebar strong{color:var(--band-ink);font-weight:600}
.nl main .col{display:flex;flex-direction:column;gap:44px;padding-block:36px 72px}
/* blocks */
.nl .label{font-family:var(--sans);font-size:12.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.nl .sh{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.nl .sh h2{font-family:var(--display);font-stretch:112%;font-weight:800;font-size:clamp(24px,3.6vw,31px);line-height:1.12}
.nl .sh .deck{color:var(--muted);font-family:var(--sans);font-size:15.5px;max-width:62ch}
.nl .groupband{font-family:var(--sans);font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#fff;background:var(--band);padding:10px 16px;border-left:6px solid var(--red);margin-top:12px}
.nl h2.h{font-family:var(--display);font-stretch:112%;font-weight:800;font-size:clamp(22px,3.2vw,28px);line-height:1.15}
.nl h3.h{font-family:var(--display);font-stretch:105%;font-weight:700;font-size:21px;line-height:1.25}
.nl .para{max-width:66ch}
.nl .story{display:flex;flex-direction:column;gap:10px;padding-top:22px;border-top:1px solid var(--rule)}
.nl .story .tag{display:inline-block;font-family:var(--sans);font-size:12px;padding:2px 9px;border-radius:999px;background:var(--chip);color:var(--heading);letter-spacing:.03em;align-self:flex-start}
.nl .story h3{font-family:var(--display);font-stretch:105%;font-weight:700;font-size:23px;line-height:1.2}
.nl .story .body{max-width:66ch}
.nl .reads{font-family:var(--sans);font-size:14.5px;color:var(--muted);display:flex;flex-direction:column;gap:5px;margin:0;padding:0;list-style:none}
.nl .reads li{padding-left:1.1em;text-indent:-1.1em}
.nl .reads li::before{content:"\\2192  ";color:var(--accent)}
.nl .reads a{color:var(--heading);font-weight:600}
.nl .acc{font-family:var(--sans);font-size:11.5px;padding:1px 7px;border-radius:4px;margin-left:6px;white-space:nowrap;border:1px solid var(--rule);color:var(--muted);text-indent:0;display:inline-block}
.nl .acc.um{border-color:var(--accent);color:var(--accent)}
.nl .classroom{background:var(--surface);border-left:4px solid var(--red);border-radius:0 6px 6px 0;padding:14px 18px;font-family:var(--sans);font-size:15.5px;line-height:1.55}
.nl .classroom b{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}
.nl blockquote.pq{margin:0;padding:6px 0 6px 24px;border-left:4px solid var(--red)}
.nl .pq p{font-family:var(--display);font-stretch:108%;font-weight:700;font-size:clamp(20px,2.8vw,26px);line-height:1.3;color:var(--heading);text-wrap:balance}
.nl .pq cite{display:block;margin-top:10px;font-family:var(--sans);font-style:normal;font-size:14px;color:var(--muted)}
.nl figure.img{margin:0}
.nl figure.img.medium{max-width:520px}
.nl figure.img img{width:100%;height:auto;display:block;border:1px solid var(--rule);border-radius:4px;background:#fff}
.nl figure.img figcaption{font-family:var(--sans);font-size:14px;color:var(--muted);margin-top:8px;line-height:1.45}
.nl figure.img .missing{display:grid;place-items:center;min-height:120px;border:1px dashed var(--rule);border-radius:4px;color:var(--muted);font-family:var(--sans);font-size:14px;padding:16px}
.nl .note{border:1px dashed var(--heading);border-radius:6px;padding:16px 20px;font-size:17px;line-height:1.6}
.nl .note .label{display:block;margin-bottom:6px}
.nl .note.review{border:1px solid #7a5a00;background:#fff4d6;color:#1d2638;font-family:var(--sans);font-size:14.5px;border-style:solid}
.nl .note.review .label{color:#7a5a00}
.nl .note.plain{border-color:var(--rule);font-family:var(--sans);font-size:15.5px;color:var(--muted)}
.nl .res{background:var(--surface);border-radius:6px;padding:16px 18px;display:grid;grid-template-columns:1fr auto;gap:6px 16px;align-items:start;font-family:var(--sans)}
.nl .res.um{border-left:4px solid var(--red)}
.nl .res h3{font-size:17px;font-weight:600;line-height:1.35;grid-column:1}
.nl .res .meta{font-size:13px;color:var(--muted);grid-column:1}
.nl .res .desc{font-size:15px;line-height:1.5;grid-column:1}
.nl .res .btn{grid-column:2;grid-row:1/4;align-self:center;font-size:13.5px;font-weight:600;color:var(--heading);border:1.5px solid var(--heading);border-radius:999px;padding:7px 14px;text-decoration:none;white-space:nowrap}
.nl .res .btn:hover{background:var(--heading);color:#fff}
.nl .co{border-radius:6px;padding:18px 22px;font-family:var(--sans);font-size:15.5px;line-height:1.55;background:var(--surface);border:1.5px solid var(--rule)}
.nl .co .label{display:block;margin-bottom:4px}
.nl .co h3{font-family:var(--display);font-stretch:105%;font-weight:700;font-size:20px;line-height:1.25;margin-bottom:8px}
.nl .co.red{border-color:var(--red)}
.nl .co.powder{border-color:var(--powder)}
.nl .co.blue{border-color:var(--navy)}
.nl .co.navy{background:var(--navy);border-color:var(--navy);border-bottom:5px solid var(--red);color:#fff}
.nl .co.navy h3,.nl .co.navy a,.nl .co.navy .label{color:#fff}
.nl .co.navy .label{color:var(--sky)}
.nl .cal{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.nl .cal li{display:grid;grid-template-columns:118px 1fr;gap:4px 18px;padding:14px 0;border-bottom:1px solid var(--rule)}
.nl .cal li:first-child{border-top:1px solid var(--rule)}
.nl .when{font-family:var(--sans);font-variant-numeric:tabular-nums;line-height:1.3}
.nl .when .d{display:block;font-family:var(--display);font-stretch:112%;font-weight:800;font-size:19px;color:var(--heading)}
.nl .when .t{font-size:13px;color:var(--muted)}
.nl .what{min-width:0;display:flex;flex-direction:column;gap:3px}
.nl .what .where{font-family:var(--sans);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.nl .what h3{font-family:var(--sans);font-weight:600;font-size:17px;line-height:1.35}
.nl .what p{font-family:var(--sans);font-size:14.5px;color:var(--muted)}
.nl ul.ls,.nl ol.ls{margin:0;padding-left:1.3em;max-width:66ch}
.nl .ls li{margin-bottom:6px}
.nl .toc{display:flex;flex-direction:column;gap:8px}
.nl .toc ul{display:flex;flex-wrap:wrap;gap:8px;font-family:var(--sans);font-size:14px;list-style:none;margin:0;padding:0}
.nl .toc a{display:inline-block;padding:6px 12px;border-radius:999px;background:var(--chip);color:var(--heading);text-decoration:none}
.nl .toc a:hover{background:var(--sky);color:#142142}
.nl .disc{background:var(--surface);border-top:4px solid var(--navy);border-radius:0 0 6px 6px;padding:22px 24px;font-family:var(--sans);font-size:15.5px;display:flex;flex-direction:column;gap:14px}
.nl .disc dl{margin:0;display:grid;grid-template-columns:150px 1fr;gap:10px 18px}
.nl .disc dt{font-weight:600;color:var(--heading)}
.nl .disc dd{margin:0;min-width:0}
.nl hr.rule{border:0;border-top:1px solid var(--rule);margin:0}
.nl .unknown{border:1px dashed var(--red);padding:12px;font-family:var(--sans);font-size:14px;color:var(--muted)}
.nl footer{border-top:1px solid var(--rule)}
.nl footer .col{padding-block:26px 40px;font-family:var(--sans);font-size:14px;color:var(--muted);display:flex;flex-direction:column;gap:8px}
.nl footer strong{color:var(--heading)}
@media (max-width:640px){.nl{font-size:17px}.nl .cal li{grid-template-columns:1fr}.nl .when .d{display:inline;margin-right:8px}.nl .disc dl{grid-template-columns:1fr;gap:2px}.nl .disc dd{margin-bottom:10px}.nl .res{grid-template-columns:1fr}.nl .res .btn{grid-column:1;grid-row:auto;justify-self:start}}
`;
  }

  /** Editable text helper: in edit mode wraps the field so the studio can read it back. */
  function fld(ctx, path, html, opts) {
    opts = opts || {};
    if (!ctx.edit) return html;
    const tag = opts.tag || 'span';
    const ph = opts.placeholder ? ` data-ph="${attr(opts.placeholder)}"` : '';
    return `<${tag} class="ed${opts.rich ? ' rich' : ''}" data-field="${attr(path)}"${opts.rich ? ' data-rich="1"' : ''}${ph} contenteditable="true" spellcheck="true">${html}</${tag}>`;
  }
  function T(ctx, path, s, opts) { return fld(ctx, path, esc(s), opts); }
  function R(ctx, path, html, opts) { return fld(ctx, path, cleanInline(html), Object.assign({ rich: true }, opts)); }
  function accBadge(a) { a = ACCESS.includes(a) ? a : (a ? String(a) : ''); return a ? `<span class="acc ${accClass(a)}">${esc(a)}</span>` : ''; }
  function link(url, inner, ctx, extra) {
    const u = safeUrl(url);
    const target = ctx.edit ? '' : ' target="_blank" rel="noopener"';
    return u ? `<a href="${attr(u)}"${target}${extra || ''}>${inner}</a>` : `<span class="nolink">${inner}</span>`;
  }
  function imgSrc(b) { return safeUrl(b.src, 'image') || safeUrl(b.publicSrc, 'image'); }

  function blockWeb(b, i, ctx, ids) {
    const P = (k) => `blocks.${i}.${k}`;
    switch (b.type) {
      case 'band': return `<p class="groupband">${T(ctx, P('text'), b.text)}</p>`;
      case 'section': {
        const id = ids[b.id];
        return `<div class="sh" id="${attr(id)}"><span class="label">${T(ctx, P('label'), b.label)}</span><h2>${T(ctx, P('heading'), b.heading)}</h2>` +
          (b.deck || ctx.edit ? `<p class="deck">${T(ctx, P('deck'), b.deck, { placeholder: 'Deck (optional)' })}</p>` : '') + `</div>`;
      }
      case 'heading': { const lv = b.level === 2 ? 2 : 3; return `<h${lv} class="h">${T(ctx, P('text'), b.text)}</h${lv}>`; }
      case 'paragraph': return `<p class="para">${R(ctx, P('html'), b.html, { tag: 'span', placeholder: 'Write a paragraph' })}</p>`;
      case 'story': {
        const links = (b.links || []).map((l, j) => {
          const Q = (k) => P(`links.${j}.${k}`);
          const meta = [];
          if (l.outlet || ctx.edit) meta.push(T(ctx, Q('outlet'), l.outlet, { placeholder: 'Outlet' }));
          if (l.date || ctx.edit) meta.push(T(ctx, Q('date'), l.date, { placeholder: 'Date' }));
          return `<li data-link="${j}">${link(l.url, T(ctx, Q('title'), l.title), ctx)}${meta.length ? ', ' + meta.join(', ') : ''}${accBadge(l.access)}</li>`;
        }).join('');
        return `<article class="story"><span class="tag">${T(ctx, P('kicker'), b.kicker)}</span><h3>${T(ctx, P('head'), b.head)}</h3>` +
          `<p class="body">${R(ctx, P('body'), b.body, { tag: 'span', placeholder: 'Two to four sentences' })}</p>` +
          (links ? `<ul class="reads">${links}</ul>` : '') +
          (b.classroom || ctx.edit ? `<div class="classroom"><b>For your classroom</b>${R(ctx, P('classroom'), b.classroom, { tag: 'span', placeholder: 'Something faculty can do (leave empty to hide)' })}</div>` : '') +
          `</article>`;
      }
      case 'quote': return `<blockquote class="pq"><p>${R(ctx, P('text'), b.text, { tag: 'span' })}</p>` + (b.cite || ctx.edit ? `<cite>${T(ctx, P('cite'), b.cite, { placeholder: 'Attribution' })}</cite>` : '') + `</blockquote>`;
      case 'image': {
        const src = imgSrc(b);
        const img = src ? `<img src="${attr(src)}" alt="${attr(b.alt)}" loading="lazy">` : `<div class="missing">No image yet. Add an image URL or upload one in the block settings.</div>`;
        return `<figure class="img ${b.size === 'medium' ? 'medium' : 'full'}">${img}` + (b.caption || ctx.edit ? `<figcaption>${R(ctx, P('caption'), b.caption, { tag: 'span', placeholder: 'Caption (optional)' })}</figcaption>` : '') + `</figure>`;
      }
      case 'note': {
        const tone = ['editor', 'review', 'plain'].includes(b.tone) ? b.tone : 'editor';
        return `<aside class="note ${tone}">` + (b.label || ctx.edit ? `<span class="label">${T(ctx, P('label'), b.label, { placeholder: 'Label' })}</span>` : '') + `<p>${R(ctx, P('html'), b.html, { tag: 'span', placeholder: 'Note text' })}</p></aside>`;
      }
      case 'resource': {
        const btn = safeUrl(b.url) ? link(b.url, esc(b.buttonText || 'Open'), ctx, ' class="btn"') : '';
        const meta = [b.source ? T(ctx, P('source'), b.source) : (ctx.edit ? T(ctx, P('source'), '', { placeholder: 'Source' }) : ''), accBadge(b.access)].filter(Boolean).join(' ');
        return `<article class="res ${b.um ? 'um' : ''}"><h3>${link(b.url, T(ctx, P('title'), b.title), ctx)}</h3>` + (meta ? `<p class="meta">${meta}</p>` : '') +
          (b.html || ctx.edit ? `<p class="desc">${R(ctx, P('html'), b.html, { tag: 'span', placeholder: 'What it is and why it matters' })}</p>` : '') + btn + `</article>`;
      }
      case 'callout': {
        const tone = ['red', 'blue', 'powder', 'navy', 'plain'].includes(b.tone) ? b.tone : 'red';
        return `<aside class="co ${tone}">` + (b.label || ctx.edit ? `<span class="label">${T(ctx, P('label'), b.label, { placeholder: 'Label' })}</span>` : '') +
          (b.heading || ctx.edit ? `<h3>${T(ctx, P('heading'), b.heading, { placeholder: 'Heading' })}</h3>` : '') + `<p>${R(ctx, P('html'), b.html, { tag: 'span', placeholder: 'Panel text' })}</p></aside>`;
      }
      case 'events': {
        const items = (b.items || []).map((e, j) => {
          const Q = (k) => P(`items.${j}.${k}`);
          return `<li data-item="${j}"><div class="when"><span class="d">${T(ctx, Q('date'), e.date)}</span>` + (e.when || ctx.edit ? `<span class="t">${T(ctx, Q('when'), e.when, { placeholder: 'Time or place' })}</span>` : '') + `</div>` +
            `<div class="what">` + (e.where || ctx.edit ? `<span class="where">${T(ctx, Q('where'), e.where, { placeholder: 'Tag (e.g. UM)' })}</span>` : '') + `<h3>${link(e.url, T(ctx, Q('title'), e.title), ctx)}</h3>` +
            (e.detail || ctx.edit ? `<p>${R(ctx, Q('detail'), e.detail, { tag: 'span', placeholder: 'Detail' })}</p>` : '') + `</div></li>`;
        }).join('');
        return `<ul class="cal">${items}</ul>`;
      }
      case 'list': {
        const tag = b.style === 'numbers' ? 'ol' : 'ul';
        return `<${tag} class="ls">${(b.items || []).map((s, j) => `<li data-item="${j}">${R(ctx, P(`items.${j}`), s, { tag: 'span', placeholder: 'List item' })}</li>`).join('')}</${tag}>`;
      }
      case 'toc': {
        const secs = ctx.issue.blocks.filter(x => x.type === 'section');
        return `<nav class="toc" aria-label="${attr(b.label || 'In this issue')}"><span class="label">${T(ctx, P('label'), b.label || 'In this issue')}</span><ul>${secs.map(s => `<li><a href="#${attr(ids[s.id])}">${esc(textOf(s.heading) || textOf(s.label))}</a></li>`).join('')}</ul></nav>`;
      }
      case 'disclosure': {
        const rows = (b.items || []).map((it, j) => `<dt data-item="${j}">${T(ctx, P(`items.${j}.term`), it.term)}</dt><dd>${R(ctx, P(`items.${j}.text`), it.text, { tag: 'span' })}</dd>`).join('');
        return `<section class="discwrap" aria-label="${attr(b.heading || 'Disclosure')}"><div class="sh"><span class="label">${T(ctx, P('label'), b.label)}</span><h2>${T(ctx, P('heading'), b.heading)}</h2></div><div class="disc" style="margin-top:18px"><dl>${rows}</dl>` + (b.foot || ctx.edit ? `<p>${R(ctx, P('foot'), b.foot, { tag: 'span', placeholder: 'Closing line (optional)' })}</p>` : '') + `</div></section>`;
      }
      case 'divider': return `<hr class="rule">`;
      default: return `<div class="unknown">Unknown block type "${esc(b.type)}" (kept in the file, not rendered).</div>`;
    }
  }

  function masthead(issue, ctx) {
    const p = issue.publication, i = issue.issue;
    const bar = [];
    bar.push(`<span><strong>Issue ${T(ctx, 'issue.number', i.number)}</strong>` + (i.month || ctx.edit ? ` · ${T(ctx, 'issue.month', i.month, { placeholder: 'Month' })}` : '') + `</span>`);
    if (p.editor || ctx.edit) bar.push(`<span>Edited by <strong>${T(ctx, 'publication.editor', p.editor, { placeholder: 'Editor' })}</strong></span>`);
    if (i.coverage || ctx.edit) bar.push(`<span>${T(ctx, 'issue.coverage', i.coverage, { placeholder: 'Coverage dates' })}</span>`);
    return `<header class="mast gut"><div class="col"><p class="kicker">${T(ctx, 'publication.kicker', p.kicker, { placeholder: 'Organization line' })}</p>` +
      `<h1>${T(ctx, 'publication.title', p.title)}</h1><p class="dek">${T(ctx, 'publication.dek', p.dek, { placeholder: 'One-sentence description' })}</p><div class="issuebar">${bar.join('')}</div></div></header>`;
  }
  function footerWeb(issue, ctx) {
    const p = issue.publication;
    const line = p.footer ? R(ctx, 'publication.footer', p.footer, { tag: 'span' }) : `<span><strong>${esc(p.title)}</strong> is published by ${esc(p.publisher)}${p.editor ? ' and edited by ' + esc(p.editor) : ''}.</span>`;
    const where = [p.address, p.contact].filter(Boolean).map(esc).join(' · ');
    return `<footer class="gut"><div class="col">${line}${where ? `<span>${where}</span>` : ''}</div></footer>`;
  }
  function googleFonts(T) {
    const fam = [...new Set([T.fontDisplay, T.fontBody, T.fontUi])].map(f => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':ital,wght@0,400;0,600;0,700;0,800;1,400').join('&');
    return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${fam}&display=swap" rel="stylesheet">`;
  }
  /** Body-only web markup (masthead + blocks + footer). Used by renderWeb, the editor canvas and the WordPress copy. */
  function webBody(issue, ctx) {
    ctx = Object.assign({ edit: false, issue }, ctx || {});
    const ids = sectionIds(issue);
    const blocks = issue.blocks.map((b, i) => `<div class="blk" data-index="${i}" data-id="${attr(b.id)}" data-type="${attr(b.type)}">${blockWeb(b, i, ctx, ids)}</div>`).join('\n');
    return `${masthead(issue, ctx)}<main id="main" class="gut"><div class="col">${blocks}</div></main>${footerWeb(issue, ctx)}`;
  }
  function renderWeb(issue, opts) {
    opts = opts || {};
    const Th = theme(issue.publication.theme);
    const title = `${textOf(issue.publication.title)} · Issue ${esc(String(issue.issue.number))}${issue.issue.month ? ' · ' + esc(issue.issue.month) : ''}`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${attr(textOf(issue.publication.dek))}">
${opts.fonts === false ? '' : googleFonts(Th)}
<style>${webCss(Th)}</style></head>
<body class="nl${opts.autoDark === false ? '' : ' auto-dark'}"><a class="skip" href="#main">Skip to content</a>
${webBody(issue)}
</body></html>`;
  }
  /** Markup for pasting into a WordPress post: blocks only, no masthead or footer, no styles. */
  function renderWordPress(issue) {
    const ctx = { edit: false, issue }; const ids = sectionIds(issue);
    return issue.blocks.map((b, i) => `<!-- wp:html -->\n${blockWeb(b, i, ctx, ids)}\n<!-- /wp:html -->`).join('\n\n');
  }

  // =====================================================================
  //  EMAIL EDITION  (tables, inline styles, 600px, no web fonts/grid/forms)
  // =====================================================================
  function renderEmail(issue) {
    const Th = theme(issue.publication.theme);
    const SANS = 'Arial, Helvetica, sans-serif';
    const p = issue.publication, i = issue.issue;
    const st = {
      p: `margin:0 0 10px 0;font-family:${SANS};font-size:16px;line-height:24px;color:${Th.ink};`,
      small: `margin:0 0 8px 0;font-family:${SANS};font-size:13px;line-height:19px;color:${Th.muted};`,
      label: `margin:0 0 4px 0;font-family:${SANS};font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:${Th.red};`,
      h2: `margin:0 0 10px 0;font-family:${SANS};font-size:24px;line-height:30px;font-weight:bold;color:${Th.navy};`,
      h3: `margin:0 0 8px 0;font-family:${SANS};font-size:19px;line-height:25px;font-weight:bold;color:${Th.navy};`,
      a: `color:${Th.powder};text-decoration:underline;`,
    };
    const A = (url, inner, white) => { const u = safeUrl(url); return u ? `<a href="${attr(u)}" style="${white ? 'color:#ffffff;text-decoration:underline;' : st.a}">${inner}</a>` : inner; };
    const badge = (a) => a ? ` <span style="font-family:${SANS};font-size:12px;color:${Th.muted};">[${esc(a)}]</span>` : '';
    const cell = (inner, style) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${style}">${inner}</td></tr></table>`;
    const panel = (inner, border) => cell(inner, `background-color:${Th.panel};border:2px solid ${border};padding:16px 18px;`);
    const spacer = (h) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</td></tr></table>`;
    const img = (b) => {
      const src = safeUrl(b.publicSrc, 'image') || (safeUrl(b.src) ? safeUrl(b.src) : '');
      if (!src) return `<p style="${st.small}border:1px dashed ${Th.rule};padding:10px;">[Image: ${esc(b.alt || 'no public URL set, so the image is left out of the email')}]</p>`;
      const w = b.size === 'medium' ? 400 : 560;
      return `<img src="${attr(src)}" alt="${attr(b.alt)}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
    };
    const ids = sectionIds(issue);
    const rows = issue.blocks.map(b => {
      switch (b.type) {
        case 'band': return spacer(10) + cell(`<p style="margin:0;font-family:${SANS};font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#ffffff;">${esc(b.text)}</p>`, `background-color:${Th.navy};border-left:6px solid ${Th.red};padding:9px 14px;`) + spacer(8);
        case 'section': return spacer(10) + `<p style="${st.label}">${esc(b.label)}</p><h2 style="${st.h2}">${esc(b.heading)}</h2>` + (b.deck ? `<p style="${st.small}">${esc(b.deck)}</p>` : '');
        case 'heading': return `<h3 style="${b.level === 2 ? st.h2 : st.h3}">${esc(b.text)}</h3>`;
        case 'paragraph': return `<p style="${st.p}">${cleanInline(b.html)}</p>`;
        case 'story': {
          const links = (b.links || []).map(l => `<p style="${st.small}">${A(l.url, `<b>${esc(l.title)}</b>`)}${l.outlet ? ', ' + esc(l.outlet) : ''}${l.date ? ', ' + esc(l.date) : ''}${badge(l.access)}</p>`).join('');
          return cell(`<p style="${st.label}">${esc(b.kicker)}</p><h3 style="${st.h3}">${esc(b.head)}</h3><p style="${st.p}">${cleanInline(b.body)}</p>${links}` +
            (b.classroom ? cell(`<p style="${st.label}margin-bottom:2px;">For your classroom</p><p style="${st.p}margin:0;font-size:15px;line-height:22px;">${cleanInline(b.classroom)}</p>`, `background-color:${Th.panel};border-left:4px solid ${Th.red};padding:10px 14px;`) : ''),
            `padding:14px 0 6px 0;border-top:1px solid ${Th.rule};`);
        }
        case 'quote': return cell(`<p style="${st.h3}font-size:21px;line-height:29px;">${cleanInline(b.text)}</p>` + (b.cite ? `<p style="${st.small}margin:0;">${esc(b.cite)}</p>` : ''), `border-left:4px solid ${Th.red};padding:6px 0 6px 18px;`) + spacer(8);
        case 'image': return img(b) + (b.caption ? `<p style="${st.small}margin-top:6px;">${cleanInline(b.caption)}</p>` : '') + spacer(8);
        case 'note': {
          const review = b.tone === 'review';
          return cell((b.label ? `<p style="${st.label}${review ? 'color:#7a5a00;' : ''}">${esc(b.label)}</p>` : '') + `<p style="${st.p}margin:0;">${cleanInline(b.html)}</p>`,
            review ? `background-color:#fff4d6;border:1px solid #7a5a00;padding:12px 16px;` : `border:1px dashed ${Th.navy};padding:12px 16px;`) + spacer(8);
        }
        case 'resource': return cell(`<h3 style="${st.h3}font-size:17px;line-height:23px;">${A(b.url, esc(b.title))}</h3>` + (b.source || b.access ? `<p style="${st.small}">${esc(b.source)}${badge(b.access)}</p>` : '') + (b.html ? `<p style="${st.p}margin:0;font-size:15px;line-height:22px;">${cleanInline(b.html)}</p>` : ''),
          `background-color:${Th.panel};${b.um ? `border-left:4px solid ${Th.red};` : ''}padding:14px 16px;`) + spacer(8);
        case 'callout': {
          const navy = b.tone === 'navy';
          const border = b.tone === 'powder' ? Th.powder : (b.tone === 'blue' || navy) ? Th.navy : b.tone === 'plain' ? Th.rule : Th.red;
          const inner = (b.label ? `<p style="${st.label}${navy ? `color:${Th.light};` : ''}">${esc(b.label)}</p>` : '') + (b.heading ? `<h3 style="${st.h3}${navy ? 'color:#ffffff;' : ''}">${esc(b.heading)}</h3>` : '') +
            `<p style="${st.p}margin:0;${navy ? 'color:#ffffff;' : ''}">${navy ? cleanInline(b.html).replace(/<a href="([^"]*)">/g, `<a href="$1" style="color:#ffffff;text-decoration:underline;">`) : cleanInline(b.html)}</p>`;
          return cell(inner, navy ? `background-color:${Th.navy};border-bottom:5px solid ${Th.red};padding:16px 18px;` : `background-color:${Th.panel};border:2px solid ${border};padding:16px 18px;`) + spacer(8);
        }
        case 'events': return (b.items || []).map(e => `<p style="${st.p}margin-bottom:8px;"><b>${esc(e.date)}</b>${e.when ? ', ' + esc(e.when) : ''}: ${A(e.url, esc(e.title))}${e.where ? ` <span style="color:${Th.red};font-size:12px;font-weight:bold;">${esc(e.where)}</span>` : ''}${e.detail ? `<br><span style="font-size:14px;line-height:20px;color:${Th.muted};">${cleanInline(e.detail)}</span>` : ''}</p>`).join('');
        case 'list': { const tag = b.style === 'numbers' ? 'ol' : 'ul'; return `<${tag} style="margin:0 0 10px 0;padding-left:22px;">${(b.items || []).map(s => `<li style="${st.p}margin-bottom:4px;">${cleanInline(s)}</li>`).join('')}</${tag}>`; }
        case 'toc': { const secs = issue.blocks.filter(x => x.type === 'section'); return `<p style="${st.p}font-size:14px;line-height:21px;"><b>${esc(b.label || 'In this issue')}:</b> ${secs.map(s => `<a href="#${attr(ids[s.id])}" style="${st.a}">${esc(textOf(s.heading) || textOf(s.label))}</a>`).join(' · ')}</p>`; }
        case 'disclosure': return spacer(6) + `<p style="${st.label}">${esc(b.label)}</p><h2 style="${st.h2}">${esc(b.heading)}</h2>` + panel((b.items || []).map(it => `<p style="${st.p}font-size:14px;line-height:21px;"><b>${esc(it.term)}.</b> ${cleanInline(it.text)}</p>`).join('') + (b.foot ? `<p style="${st.p}font-size:14px;line-height:21px;margin:0;">${cleanInline(b.foot)}</p>` : ''), Th.navy);
        case 'divider': return `<hr style="border:0;border-top:1px solid ${Th.rule};margin:10px 0;">`;
        default: return '';
      }
    }).join('\n');
    const head = cell(`<p style="${st.label}color:${Th.light};">${esc(p.kicker)}</p><h1 style="margin:0 0 8px 0;font-family:${SANS};font-size:32px;line-height:36px;font-weight:bold;color:#ffffff;text-transform:uppercase;">${esc(p.title)}</h1>` +
      `<p style="${st.p}color:#ffffff;margin-bottom:10px;">${esc(p.dek)}</p><p style="${st.small}color:${Th.light};margin:0;"><b style="color:#ffffff;">Issue ${esc(String(i.number))}</b>${i.month ? ' · ' + esc(i.month) : ''}${p.editor ? ' · Edited by ' + esc(p.editor) : ''}${i.coverage ? ' · ' + esc(i.coverage) : ''}</p>`,
      `background-color:${Th.navy};border-bottom:6px solid ${Th.red};padding:28px 24px 22px 24px;`);
    const foot = `<p style="${st.small}">${p.footer ? cleanInline(p.footer) : `<b>${esc(p.title)}</b> is published by ${esc(p.publisher)}${p.editor ? ' and edited by ' + esc(p.editor) : ''}.`}</p><p style="${st.small}margin:0;">${[p.address, p.contact].filter(Boolean).map(esc).join(' · ')}</p>`;
    const title = `${textOf(p.title)} · Issue ${esc(String(i.number))}`;
    return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body{margin:0;padding:0;background:#EEF1F5;} table{border-collapse:collapse;} img{border:0;line-height:100%;outline:none;text-decoration:none;} a{color:${Th.powder};}</style></head>
<body style="margin:0;padding:0;background-color:#EEF1F5;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(textOf(p.dek))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F5;"><tr><td align="center" style="padding:20px 10px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;">
<tr><td>${head}</td></tr>
<tr><td style="padding:22px 24px 10px 24px;">${rows}</td></tr>
<tr><td style="padding:14px 24px 26px 24px;border-top:1px solid ${Th.rule};">${foot}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  }

  // =====================================================================
  //  PRINT EDITION  (US Letter, designed publication, Save as PDF)
  // =====================================================================
  function printCss(T, runningHead) {
    const run = runningHead.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `
@page{size:Letter;margin:0.85in 0.8in 0.9in 0.8in;
 @top-left{content:"${run}";font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:${T.muted};vertical-align:bottom;padding-bottom:0.22in}
 @bottom-right{content:counter(page);font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.5pt;font-weight:600;color:${T.navy};vertical-align:top;padding-top:0.2in}}
@page :first{@top-left{content:none} @bottom-right{content:none}}
html,body{margin:0;padding:0;background:#fff}
body{font-family:"${T.fontBody}",Georgia,serif;font-size:10.6pt;line-height:1.52;color:${T.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
*,*::before,*::after{box-sizing:border-box}
a{color:${T.powder};text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}
h1,h2,h3,h4{font-family:"${T.fontDisplay}",Helvetica,Arial,sans-serif;font-stretch:112%;font-weight:800;letter-spacing:-.012em;color:${T.navy};margin:0;break-after:avoid}
p{margin:0}
.ui{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif}
.label{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:7.5pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${T.red};display:block;margin:0 0 .06in}
.acc{display:inline-block;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:6.6pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.navy};border:1px solid ${T.navy};border-radius:3px;padding:0 5px;line-height:1.6;vertical-align:middle;white-space:nowrap;margin-left:4px}
/* cover (first page) */
.cover{height:9.25in;display:grid;grid-template-rows:1fr auto;break-after:page;position:relative}
.cover .field{background:${T.navy};color:#fff;padding:0.6in 0.6in 0.55in;display:grid;align-content:end;gap:.12in;border-bottom:.12in solid ${T.red}}
.cover .kick{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;color:${T.light}}
.cover h1{color:#fff;font-size:54pt;line-height:.95;text-transform:uppercase;max-width:6.4in;font-stretch:118%}
.cover .dek{font-size:14pt;line-height:1.45;max-width:5.6in;color:#fff;margin-top:.1in}
.cover .bar{display:flex;flex-wrap:wrap;gap:.08in .35in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9pt;color:#fff;margin-top:.25in;padding-top:.16in;border-top:1px solid rgba(255,255,255,.3)}
.cover .bar b{color:${T.light};font-weight:600;text-transform:uppercase;letter-spacing:.1em;font-size:6.8pt;margin-right:.06in}
.cover .colophon{padding:.3in .1in 0;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.3pt;line-height:1.5;color:${T.muted};display:grid;grid-template-columns:1fr 1fr;gap:.3in}
.cover .toc{list-style:none;margin:0;padding:0}
.cover .toc li{display:flex;justify-content:space-between;gap:.2in;padding:.05in 0;border-bottom:1px dotted ${T.rule};color:${T.navy};font-weight:600}
/* flow */
.flow{display:block}
.blk{margin:0 0 .22in;break-inside:avoid}
.blk.t-story,.blk.t-paragraph,.blk.t-list,.blk.t-events,.blk.t-disclosure{break-inside:auto}
.blk.t-band{margin:0 0 .3in;break-before:page}
.blk.t-band:first-child{break-before:auto}
.blk.t-section,.blk.t-heading{break-after:avoid}
p,li,dd{orphans:3;widows:3}
.band{background:${T.navy};color:#fff;border-left:.1in solid ${T.red};padding:.14in .25in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:10pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin:0 0 .1in}
.sh{margin:.18in 0 .12in}
.sh h2{font-size:22pt;line-height:1.05;margin:.02in 0 .1in}
.sh h2::after{content:"";display:block;background:${T.red};width:1.1in;height:2.5px;margin-top:.12in}
.sh .deck{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;color:${T.muted};font-size:9.8pt;line-height:1.5;max-width:5.6in}
h2.h{font-size:16pt;line-height:1.15}
h3.h{font-size:12.5pt;line-height:1.25}
.para{font-size:11pt;line-height:1.56;max-width:6.2in}
.story{padding-top:.16in;border-top:1px solid ${T.rule}}
.story .label{break-after:avoid}
.story h3{font-size:16.5pt;line-height:1.12;margin:0 0 .12in;max-width:6in;break-after:avoid}
.story .body{font-size:10.8pt;line-height:1.55;margin:0 0 .12in;max-width:6.2in}
.story .classroom{max-width:6.2in;margin-top:.12in}
.story .sources{list-style:none;margin:0;padding:.08in 0 0;border-top:1px solid ${T.rule};columns:2;column-gap:.4in;break-inside:avoid}
.sources li{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.6pt;line-height:1.35;margin:0 0 .08in;break-inside:avoid}
.sources a{font-weight:600;display:block;color:${T.navy};text-decoration-color:${T.powder}}
.sources .meta{color:${T.muted}}
.classroom{background:${T.panel};border-left:3px solid ${T.red};padding:.12in .16in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9.6pt;line-height:1.48}
.classroom b{display:block;font-size:7.2pt;letter-spacing:.14em;text-transform:uppercase;color:${T.red};margin-bottom:.04in}
blockquote.pq{margin:.1in 0;padding:.06in 0 .06in .3in;border-left:4px solid ${T.red};max-width:5.8in}
.pq p{font-family:"${T.fontDisplay}",Helvetica,Arial,sans-serif;font-stretch:108%;font-weight:700;font-size:16pt;line-height:1.28;color:${T.navy}}
.pq cite{display:block;margin-top:.08in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-style:normal;font-size:8.8pt;color:${T.muted}}
figure.img{margin:0;border:1px solid ${T.rule};padding:.08in;background:#fff}
figure.img.medium{max-width:4.2in}
figure.img img{width:100%;height:auto;display:block;max-height:7.5in;object-fit:contain}
figure.img figcaption{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.6pt;color:${T.muted};margin-top:.08in;line-height:1.4}
.note{border:1.5px dashed ${T.navy};padding:.2in .26in;max-width:6in;font-size:12pt;line-height:1.55;color:${T.navy};font-style:italic}
.note .label{font-style:normal}
.note.review{border:2px solid ${T.red};background:${T.panel};color:${T.ink};font-style:normal;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9.6pt}
.note.plain{border-color:${T.rule};color:${T.muted};font-style:normal;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9.8pt}
.res{background:${T.panel};padding:.14in .18in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;display:grid;grid-template-columns:1fr auto;gap:.04in .25in}
.res.um{border-left:3px solid ${T.red}}
.res h3{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-stretch:100%;letter-spacing:0;font-size:11pt;font-weight:600;line-height:1.3}
.res h3 a{color:${T.navy};text-decoration:none}
.res .meta{font-size:8.4pt;color:${T.muted}}
.res .desc{font-size:9.6pt;line-height:1.45;grid-column:1}
.res .url{grid-column:2;grid-row:1/4;align-self:center;font-size:8pt;color:${T.powder};max-width:1.9in;word-break:break-all;text-align:right}
.co{background:${T.panel};border:1.5px solid ${T.rule};padding:.18in .22in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9.8pt;line-height:1.5}
.co h3{font-size:13.5pt;line-height:1.2;margin:0 0 .08in}
.co.red{border-color:${T.red}} .co.blue{border-color:${T.navy}} .co.powder{border-color:${T.powder}}
.co.navy{background:${T.navy};border-color:${T.navy};border-bottom:.08in solid ${T.red};color:#fff}
.co.navy h3,.co.navy a{color:#fff} .co.navy .label{color:${T.light}}
.cal{list-style:none;margin:0;padding:0}
.cal li{display:grid;grid-template-columns:1.15in 1fr;gap:.02in .25in;padding:.1in 0;border-bottom:1px solid ${T.rule};break-inside:avoid}
.cal li:first-child{border-top:1px solid ${T.rule}}
.when .d{display:block;font-family:"${T.fontDisplay}",Helvetica,Arial,sans-serif;font-stretch:112%;font-weight:800;font-size:12.5pt;color:${T.navy};line-height:1.1}
.when .t{display:block;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.2pt;color:${T.muted};margin-top:.03in}
.what .where{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:7.2pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${T.red};display:block}
.what h3{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-stretch:100%;letter-spacing:0;font-size:10.8pt;font-weight:600;line-height:1.3}
.what h3 a{color:${T.navy};text-decoration:none}
.what p{font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9pt;color:${T.muted};line-height:1.4;margin-top:.02in}
ul.ls,ol.ls{margin:0;padding-left:1.2em;font-size:10.6pt;max-width:6in} .ls li{margin-bottom:.05in}
.disc{background:${T.panel};border-top:3px solid ${T.navy};padding:.2in .24in;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:9.4pt;line-height:1.5}
.disc dl{margin:0;display:grid;grid-template-columns:1.3in 1fr;gap:.08in .2in} .disc dt{font-weight:700;color:${T.navy}} .disc dd{margin:0}
.disc p{margin-top:.12in}
hr.rule{border:0;border-top:1px solid ${T.rule};margin:.05in 0}
.foot{margin-top:.5in;padding-top:.14in;border-top:2.5px solid ${T.navy};font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.3pt;line-height:1.5;color:${T.muted};break-inside:avoid}
.links{margin-top:.35in;break-before:page}
.links h2{font-size:22pt;margin-bottom:.14in}
.links ol{margin:0;padding-left:1.4em;font-family:"${T.fontUi}",Helvetica,Arial,sans-serif;font-size:8.4pt;line-height:1.45;columns:2;column-gap:.4in}
.links li{margin-bottom:.07in;break-inside:avoid}
.links li a{color:${T.navy};text-decoration:none;font-weight:600}
.links li span{display:block;color:${T.powder};word-break:break-all}
@media screen{body{background:#D6DCE6;padding:.4in 0} .sheet{background:#fff;width:8.5in;margin:0 auto .4in;padding:.85in .8in .9in;box-shadow:0 2px 14px rgba(0,0,0,.18)}}
`;
  }
  function renderPrint(issue, opts) {
    opts = opts || {};
    const Th = theme(issue.publication.theme);
    const p = issue.publication, i = issue.issue;
    const ids = sectionIds(issue);
    const allLinks = [];
    const A = (url, inner, extra) => { const u = safeUrl(url); if (!u) return inner; allLinks.push({ t: textOf(inner) || u, u }); return `<a href="${attr(u)}"${extra || ''}>${inner}</a>`; };
    const badge = (a) => a ? `<span class="acc">${esc(a)}</span>` : '';
    const blocks = issue.blocks.map(b => {
      let inner;
      switch (b.type) {
        case 'band': inner = `<p class="band">${esc(b.text)}</p>`; break;
        case 'section': inner = `<div class="sh" id="${attr(ids[b.id])}"><span class="label">${esc(b.label)}</span><h2>${esc(b.heading)}</h2>${b.deck ? `<p class="deck">${esc(b.deck)}</p>` : ''}</div>`; break;
        case 'heading': inner = b.level === 2 ? `<h2 class="h">${esc(b.text)}</h2>` : `<h3 class="h">${esc(b.text)}</h3>`; break;
        case 'paragraph': inner = `<p class="para">${cleanInline(b.html)}</p>`; break;
        case 'story': inner = `<article class="story"><span class="label">${esc(b.kicker)}</span><h3>${esc(b.head)}</h3><p class="body">${cleanInline(b.body)}</p>` +
          `<ul class="sources">${(b.links || []).map(l => `<li>${A(l.url, esc(l.title))}<span class="meta">${[l.outlet, l.date].filter(Boolean).map(esc).join(' · ')}</span>${badge(l.access)}</li>`).join('')}</ul>` +
          (b.classroom ? `<aside class="classroom"><b>For your classroom</b>${cleanInline(b.classroom)}</aside>` : '') + `</article>`; break;
        case 'quote': inner = `<blockquote class="pq"><p>${cleanInline(b.text)}</p>${b.cite ? `<cite>${esc(b.cite)}</cite>` : ''}</blockquote>`; break;
        case 'image': { const src = imgSrc(b); inner = src ? `<figure class="img ${b.size === 'medium' ? 'medium' : ''}"><img src="${attr(src)}" alt="${attr(b.alt)}">${b.caption ? `<figcaption>${cleanInline(b.caption)}</figcaption>` : ''}</figure>` : ''; break; }
        case 'note': inner = `<aside class="note ${['editor', 'review', 'plain'].includes(b.tone) ? b.tone : 'editor'}">${b.label ? `<span class="label">${esc(b.label)}</span>` : ''}<p>${cleanInline(b.html)}</p></aside>`; break;
        case 'resource': { const u = safeUrl(b.url); inner = `<article class="res ${b.um ? 'um' : ''}"><h3>${A(b.url, esc(b.title))}</h3>${b.source || b.access ? `<p class="meta">${esc(b.source)}${badge(b.access)}</p>` : ''}${b.html ? `<p class="desc">${cleanInline(b.html)}</p>` : ''}${u ? `<span class="url">${esc(u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</span>` : ''}</article>`; break; }
        case 'callout': inner = `<aside class="co ${['red', 'blue', 'powder', 'navy', 'plain'].includes(b.tone) ? b.tone : 'red'}">${b.label ? `<span class="label">${esc(b.label)}</span>` : ''}${b.heading ? `<h3>${esc(b.heading)}</h3>` : ''}<p>${cleanInline(b.html)}</p></aside>`; break;
        case 'events': inner = `<ul class="cal">${(b.items || []).map(e => `<li><div class="when"><span class="d">${esc(e.date)}</span>${e.when ? `<span class="t">${esc(e.when)}</span>` : ''}</div><div class="what">${e.where ? `<span class="where">${esc(e.where)}</span>` : ''}<h3>${A(e.url, esc(e.title))}</h3>${e.detail ? `<p>${cleanInline(e.detail)}</p>` : ''}</div></li>`).join('')}</ul>`; break;
        case 'list': { const tag = b.style === 'numbers' ? 'ol' : 'ul'; inner = `<${tag} class="ls">${(b.items || []).map(s => `<li>${cleanInline(s)}</li>`).join('')}</${tag}>`; break; }
        case 'toc': inner = ''; break; // the cover carries the contents
        case 'disclosure': inner = `<section><div class="sh"><span class="label">${esc(b.label)}</span><h2>${esc(b.heading)}</h2></div><div class="disc"><dl>${(b.items || []).map(it => `<dt>${esc(it.term)}</dt><dd>${cleanInline(it.text)}</dd>`).join('')}</dl>${b.foot ? `<p>${cleanInline(b.foot)}</p>` : ''}</div></section>`; break;
        case 'divider': inner = `<hr class="rule">`; break;
        default: inner = '';
      }
      // links inside rich text count for the appendix too
      inner.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, (m, u, t) => { if (!allLinks.some(x => x.u === u)) allLinks.push({ t: decode(t) || u, u }); return m; });
      return inner ? `<div class="blk t-${b.type}">${inner}</div>` : '';
    }).join('\n');
    const secs = issue.blocks.filter(b => b.type === 'section');
    const runningHead = `${textOf(p.title)} · Issue ${i.number}${i.month ? ' · ' + i.month : ''}`;
    const seen = new Set(); const uniq = allLinks.filter(l => !seen.has(l.u) && seen.add(l.u));
    const cover = `<section class="cover"><div class="field"><p class="kick">${esc(p.kicker)}</p><h1>${esc(p.title)}</h1><p class="dek">${esc(p.dek)}</p>` +
      `<div class="bar"><span><b>Issue</b>${esc(String(i.number))}</span>${i.month ? `<span><b>Month</b>${esc(i.month)}</span>` : ''}${p.editor ? `<span><b>Editor</b>${esc(p.editor)}</span>` : ''}${i.coverage ? `<span><b>Coverage</b>${esc(i.coverage)}</span>` : ''}</div></div>` +
      `<div class="colophon"><div><p><b>${esc(p.title)}</b> is published by ${esc(p.publisher)}${p.editor ? ' and edited by ' + esc(p.editor) : ''}.</p>${[p.address, p.contact].filter(Boolean).length ? `<p>${[p.address, p.contact].filter(Boolean).map(esc).join(' · ')}</p>` : ''}${p.url ? `<p>${esc(p.url)}</p>` : ''}${i.status ? `<p>${esc(i.status)}</p>` : ''}</div>` +
      `<div>${secs.length ? `<span class="label">In this issue</span><ul class="toc">${secs.map(s => `<li><span>${esc(textOf(s.heading) || textOf(s.label))}</span></li>`).join('')}</ul>` : ''}</div></div></section>`;
    const appendix = opts.links === false || !uniq.length ? '' : `<section class="links"><div class="sh"><span class="label">Appendix</span><h2>Every link in this issue</h2></div><ol>${uniq.map(l => `<li><a href="${attr(l.u)}">${esc(l.t)}</a><span>${esc(l.u.replace(/^https?:\/\//, ''))}</span></li>`).join('')}</ol></section>`;
    const foot = `<div class="foot"><p><b>${esc(p.title)}</b> · Issue ${esc(String(i.number))}${i.month ? ' · ' + esc(i.month) : ''}. Published by ${esc(p.publisher)}${p.editor ? '; edited by ' + esc(p.editor) : ''}.${p.contact ? ' ' + esc(p.contact) : ''}</p></div>`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(runningHead)}</title><meta name="author" content="${attr(p.editor || p.publisher)}"><meta name="description" content="${attr(textOf(p.dek))}">
${opts.fonts === false ? '' : googleFonts(Th)}
<style>${printCss(Th, runningHead)}</style></head>
<body><div class="sheet">${cover}<div class="flow">${blocks}${appendix}${foot}</div></div>
${opts.autoprint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},600)})</script>' : ''}
</body></html>`;
  }

  /** One block's web markup (used by the editor to refresh a single block). */
  function renderBlock(issue, i, ctx) { ctx = Object.assign({ edit: false, issue }, ctx || {}); return blockWeb(issue.blocks[i], i, ctx, sectionIds(issue)); }
  return { SCHEMA, VERSION, BLOCKS, ACCESS, THEME, esc, safeUrl, cleanInline, textOf, words, wordCount, theme, uid, newIssue, makeBlock, migrate, sectionIds, webCss, webBody, renderBlock, renderWeb, renderWordPress, renderEmail, renderPrint };
});
