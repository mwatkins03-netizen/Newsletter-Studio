/* Newsletter Studio · studio.js — the editor. State lives in issue JSON; the canvas is the web edition with editable fields. */
(function () {
  'use strict';
  const R = window.NSRender;
  const KEY = 'newsletter-studio-v1';
  const HIST = 'newsletter-studio-hist-';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = R.esc;

  // ---------- icons ----------
  const I = {
    up: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 16V4M4 10l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4v12M4 10l6 6 6-6"/></svg>',
    dup: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"/></svg>',
    del: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>',
    gear: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg>',
    blk: {
      band: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="7" width="16" height="6" rx="1"/></svg>',
      section: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="4" width="7" height="2"/><rect x="2" y="8" width="16" height="4"/><rect x="2" y="14" width="12" height="2" opacity=".5"/></svg>',
      heading: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 4v12M14 4v12M4 10h10"/></svg>',
      paragraph: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="4" width="16" height="2"/><rect x="2" y="8" width="16" height="2"/><rect x="2" y="12" width="16" height="2"/><rect x="2" y="16" width="9" height="2"/></svg>',
      story: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="3" width="6" height="2"/><rect x="2" y="6" width="16" height="4"/><rect x="2" y="12" width="16" height="2" opacity=".6"/><rect x="2" y="15" width="12" height="2" opacity=".6"/></svg>',
      quote: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 12a4 4 0 0 1 4-6v2a2 2 0 0 0-2 2h2v4H4zm8 0a4 4 0 0 1 4-6v2a2 2 0 0 0-2 2h2v4h-4z"/></svg>',
      image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 14l4-4 3 3 3-3 4 4"/><circle cx="13" cy="8" r="1.2" fill="currentColor"/></svg>',
      note: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"><rect x="3" y="4" width="14" height="12" rx="1.5"/></svg>',
      resource: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="10" rx="2"/><path d="M6 10h5"/><circle cx="14" cy="10" r="1.2" fill="currentColor"/></svg>',
      callout: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M6 8h8M6 11h5"/></svg>',
      events: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="12" rx="1.5"/><path d="M3 9h14M7 3v4M13 3v4"/></svg>',
      list: '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="10" r="1.5"/><circle cx="4" cy="14" r="1.5"/><rect x="8" y="5" width="9" height="2"/><rect x="8" y="9" width="9" height="2"/><rect x="8" y="13" width="9" height="2"/></svg>',
      toc: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="5" width="7" height="3" rx="1.5"/><rect x="11" y="5" width="7" height="3" rx="1.5"/><rect x="2" y="12" width="9" height="3" rx="1.5"/></svg>',
      disclosure: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3l6 3v4c0 4-3 6-6 7-3-1-6-3-6-7V6z"/></svg>',
      divider: '<svg viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="9" width="16" height="2"/></svg>',
    },
  };

  // ---------- state ----------
  let store, issue, selected = null, mode = 'edit', edition = 'web', pw = 1280, sideTab = 'block';
  let saveTimer = null, lastSnap = 0, savedRange = null;

  function now() { return new Date().toISOString(); }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.issues && s.order) return s; } catch (e) { /* fresh */ }
    return { issues: {}, order: [], current: null };
  }
  function persistStore() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); setSaved(true); }
    catch (e) { setSaved(false, 'Could not save: storage is full. Export your JSON.'); }
  }
  function setSaved(ok, msg) { const el = $('#saved'); el.textContent = msg || (ok ? 'Saved' : 'Not saved'); el.style.color = ok ? '' : '#FFCD6B'; }
  function snapshot(force) {
    const t = Date.now(); if (!force && t - lastSnap < 90000) return; lastSnap = t;
    try {
      const k = HIST + issue.id; const h = JSON.parse(localStorage.getItem(k) || '[]');
      h.unshift({ t: now(), words: R.wordCount(issue), data: JSON.stringify(issue) });
      localStorage.setItem(k, JSON.stringify(h.slice(0, 15)));
    } catch (e) { /* history is best effort */ }
  }
  function save() {
    clearTimeout(saveTimer); saveTimer = null;
    issue.updated = now(); store.issues[issue.id] = issue; store.current = issue.id;
    if (!store.order.includes(issue.id)) store.order.push(issue.id);
    persistStore(); snapshot(false); updateWords();
  }
  function scheduleSave() { setSaved(false, 'Saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
  function updateWords() { $('#wc').innerHTML = `<b>${R.wordCount(issue).toLocaleString()}</b> words`; }

  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }

  // ---------- starter content ----------
  function starterIssue() {
    const is = R.newIssue();
    is.publication.title = 'Taming the Whirlwind'; is.publication.kicker = 'University of Mississippi · Academic Innovations Group';
    is.publication.dek = 'A monthly guide for UM faculty on how AI is changing education and culture.';
    is.publication.publisher = 'the Academic Innovations Group, University of Mississippi'; is.publication.editor = 'Marc Watkins';
    is.publication.contact = 'innovation@olemiss.edu'; is.publication.address = 'Hill Hall 106';
    is.issue = { number: 2, month: '', coverage: '', status: 'Draft' };
    const b = (t, o) => Object.assign(R.makeBlock(t), o);
    is.blocks = [
      b('note', { label: 'From the editor', html: '', tone: 'editor' }),
      b('toc', {}),
      b('band', { text: 'The month in AI' }),
      b('section', { label: 'Education first', heading: 'AI and teaching this month', deck: 'Stories for faculty, each with a suggestion for your classroom.' }),
      b('story', { kicker: 'Kicker', head: 'What happened, in one plain sentence', body: '', links: [{ title: 'Source title', url: '', outlet: 'Outlet', date: '', access: 'Free' }], classroom: '' }),
      b('band', { text: 'Dates and resources' }),
      b('section', { label: 'On campus', heading: 'Events this month', deck: '' }),
      b('events', { items: [{ date: 'Nov 6', when: 'Fri, 9 to 10:30 am', title: 'Event', url: '', detail: '', where: 'UM' }] }),
      b('band', { text: 'About this issue' }),
      b('disclosure', { label: 'Disclosure', heading: 'How this issue was made', items: [{ term: 'AI tool used', text: '' }, { term: 'What the AI did', text: '' }, { term: 'What people did', text: '' }, { term: 'Limits', text: '' }], foot: '' }),
    ];
    return is;
  }
  async function loadSample() {
    const res = await fetch('samples/taming-the-whirlwind-issue-1.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { issue: is, problems } = R.migrate(await res.json());
    if (problems.length) console.warn(problems);
    return is;
  }

  // ---------- rendering ----------
  function themeCss() { return `<style>${R.webCss(R.theme(issue.publication.theme))}</style>`; }
  function blockBar(i, b) {
    const name = (R.BLOCKS[b.type] || { label: b.type }).label;
    return `<div class="blkbar" role="toolbar" aria-label="${esc(name)} block"><span>${esc(name)}</span>` +
      `<button data-op="up" title="Move up (Alt+↑)" aria-label="Move up">${I.up}</button><button data-op="down" title="Move down (Alt+↓)" aria-label="Move down">${I.down}</button>` +
      `<button data-op="dup" title="Duplicate" aria-label="Duplicate">${I.dup}</button><button data-op="settings" title="Block settings" aria-label="Block settings">${I.gear}</button><button data-op="del" title="Delete" aria-label="Delete block">${I.del}</button></div>`;
  }
  function renderCanvas(focusIndex) {
    const canvas = $('#canvas');
    canvas.innerHTML = themeCss() + `<div class="nl">${R.webBody(issue, { edit: true })}</div>`;
    const col = $('main .col', canvas);
    const blks = $$('.blk', col);
    if (!blks.length) {
      col.innerHTML = `<div class="empty"><p>This issue has no blocks yet.</p><button class="btn" id="emptyAdd">Add a section head</button></div>`;
      $('#emptyAdd', col).onclick = () => addBlock('section', 0);
    }
    blks.forEach((el, i) => {
      el.insertAdjacentHTML('afterbegin', blockBar(i, issue.blocks[i]));
      if (issue.blocks[i].id === selected) el.dataset.selected = 'true';
      const add = document.createElement('div'); add.className = 'addline';
      add.innerHTML = `<button type="button" data-at="${i + 1}" aria-label="Add a block after ${esc((R.BLOCKS[issue.blocks[i].type] || {}).label || 'this block')}">+ block</button>`;
      el.insertAdjacentElement('afterend', add);
    });
    if (typeof focusIndex === 'number') {
      const el = $(`.blk[data-index="${focusIndex}"]`, canvas);
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); const f = $('.ed', el); if (f) { f.focus(); } }
    }
    renderOutline();
  }
  function refreshBlock(i) {
    const el = $(`#canvas .blk[data-index="${i}"]`); if (!el) return renderCanvas();
    el.innerHTML = blockBar(i, issue.blocks[i]) + R.renderBlock(issue, i, { edit: true });
    if (issue.blocks[i].id === selected) el.dataset.selected = 'true';
  }
  function refreshDerived() {
    // things that depend on text elsewhere: the in-this-issue block and the outline
    issue.blocks.forEach((b, i) => { if (b.type === 'toc') refreshBlock(i); });
    renderOutline();
  }
  function renderOutline() {
    const ul = $('#outline');
    ul.innerHTML = issue.blocks.map((b, i) => {
      const def = R.BLOCKS[b.type] || { label: b.type };
      const name = R.textOf(b.text || b.heading || b.head || b.title || b.label || b.html || b.alt || (b.items && b.items[0] && (b.items[0].title || b.items[0].term || b.items[0])) || '') || def.label;
      return `<li class="${b.type}" data-i="${i}" draggable="true" aria-current="${b.id === selected}" tabindex="0"><span class="t">${esc(def.label)}</span><span class="n">${esc(name)}</span></li>`;
    }).join('');
  }
  function renderPalette() {
    $('#palette').innerHTML = Object.entries(R.BLOCKS).map(([k, d]) => `<button type="button" data-type="${k}" title="Add ${esc(d.label)}">${I.blk[k] || ''}<span>${esc(d.label)}</span></button>`).join('');
  }
  function renderIssueSelect() {
    const sel = $('#issueSel');
    sel.innerHTML = store.order.map(id => { const is = store.issues[id]; if (!is) return ''; return `<option value="${esc(id)}" ${id === issue.id ? 'selected' : ''}>${esc(R.textOf(is.publication.title))} · Issue ${esc(String(is.issue.number))}${is.issue.month ? ' · ' + esc(is.issue.month) : ''}</option>`; }).join('');
  }

  // ---------- inspector ----------
  const f = (label, input, help) => `<div class="f"><label>${label}</label>${input}${help ? `<small>${help}</small>` : ''}</div>`;
  const inp = (path, val, type, extra) => `<input type="${type || 'text'}" data-path="${esc(path)}" value="${esc(val == null ? '' : val)}" ${extra || ''}>`;
  const url = (path, val, help) => f('URL', `<input type="url" data-path="${esc(path)}" value="${esc(val || '')}" placeholder="https://…" pattern="(https?://|mailto:).*">`, help || (val && !R.safeUrl(val) ? '<span style="color:#CF142B">Only http, https and mailto links are allowed. This link will not be published.</span>' : ''));
  const sel = (path, val, opts) => `<select data-path="${esc(path)}">${opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  const access = (path, val) => f('Access label', sel(path, val, [['', 'None'], ...R.ACCESS.map(a => [a, a])]), 'Shown after the link, as a small badge.');
  const chk = (path, val, label) => `<label class="chk"><input type="checkbox" data-path="${esc(path)}" ${val ? 'checked' : ''}> ${label}</label>`;

  function renderInspector() {
    const box = $('#inspector');
    $('#tabBlock').setAttribute('aria-selected', sideTab === 'block'); $('#tabPub').setAttribute('aria-selected', sideTab === 'pub');
    if (sideTab === 'pub') return renderPubInspector(box);
    const i = issue.blocks.findIndex(b => b.id === selected);
    if (i < 0) { box.innerHTML = `<h2>Block</h2><p class="note">Select a block on the page to see its settings here. Text is edited directly on the page; links, images, labels and tones are set here.</p>`; return; }
    const b = issue.blocks[i]; const P = (k) => `blocks.${i}.${k}`;
    const def = R.BLOCKS[b.type] || { label: b.type };
    let h = `<div class="hdr"><h2>${esc(def.label)}</h2><button class="btn sm" id="deselect">Done</button></div>`;
    switch (b.type) {
      case 'story':
        h += `<p class="note">Kicker, headline, body and the classroom box are edited on the page. Sources are listed here.</p>`;
        h += (b.links || []).map((l, j) => `<div class="sub"><div class="shd"><b>Source ${j + 1}</b><span><button class="link" data-op="linkup" data-j="${j}">↑</button> <button class="link" data-op="linkdown" data-j="${j}">↓</button> <button class="link danger" data-op="linkdel" data-j="${j}">remove</button></span></div>` +
          f('Title', inp(P(`links.${j}.title`), l.title)) + url(P(`links.${j}.url`), l.url) + `<div class="f"><div class="row">${inp(P(`links.${j}.outlet`), l.outlet, 'text', 'placeholder="Outlet"')}${inp(P(`links.${j}.date`), l.date, 'text', 'placeholder="Date" style="max-width:40%"')}</div></div>` + access(P(`links.${j}.access`), l.access) + `</div>`).join('');
        h += `<div class="actions"><button class="btn sm" data-op="linkadd">+ Add a source</button></div>`;
        break;
      case 'image':
        h += b.src || b.publicSrc ? `<img class="thumb" src="${esc(R.safeUrl(b.src, 'image') || R.safeUrl(b.publicSrc, 'image'))}" alt="">` : '';
        h += `<div class="drop" id="drop" tabindex="0" role="button">Drop an image here or <label class="link" style="cursor:pointer">choose a file<input type="file" accept="image/*" id="imgFile" class="sr"></label><br><small>Resized to 1600px and stored inside the issue JSON.</small></div><div style="height:10px"></div>`;
        h += url(P('src'), b.src && b.src.startsWith('data:') ? '' : b.src, b.src && b.src.startsWith('data:') ? `Embedded image, ${Math.round(b.src.length * 0.75 / 1024)} KB. Paste a URL to replace it.` : 'A public https image URL, or upload above.');
        h += f('Public URL for email', inp(P('publicSrc'), b.publicSrc, 'url', 'placeholder="https://…"'), 'Email clients cannot show embedded images, so the email edition uses this URL. Leave empty to omit the image from the email.');
        h += f('Alt text', `<textarea data-path="${P('alt')}">${esc(b.alt)}</textarea>`, 'Describe what the image shows. Required for accessibility.');
        h += f('Size', sel(P('size'), b.size, [['full', 'Full column'], ['medium', 'Medium (520px)']]));
        if (b.src) h += `<div class="actions"><button class="btn sm danger" data-op="imgclear">Remove image</button></div>`;
        break;
      case 'resource':
        h += url(P('url'), b.url) + f('Button text', inp(P('buttonText'), b.buttonText || 'Open')) + access(P('access'), b.access) + chk(P('um'), b.um, 'Local resource (red edge)');
        break;
      case 'callout':
        h += f('Tone', sel(P('tone'), b.tone, [['red', 'Light panel, red border'], ['powder', 'Light panel, powder-blue border'], ['blue', 'Light panel, navy border'], ['navy', 'Navy panel, white text'], ['plain', 'Light panel, neutral border']]), 'Follows the style sheet: red for student voices and Made at UM, navy for a call, powder for what is offered.');
        break;
      case 'note':
        h += f('Tone', sel(P('tone'), b.tone, [['editor', "Editor's note (dashed box)"], ['review', 'Review banner (amber)'], ['plain', 'Plain note']]));
        break;
      case 'heading':
        h += f('Level', sel(P('level'), b.level, [[2, 'Heading 2'], [3, 'Heading 3']]));
        break;
      case 'list':
        h += f('Style', sel(P('style'), b.style, [['bullets', 'Bullets'], ['numbers', 'Numbers']]));
        h += `<p class="note">Items are edited on the page.</p>` + (b.items || []).map((s, j) => `<div class="sub"><div class="shd"><b>Item ${j + 1}</b><span><button class="link" data-op="itemup" data-j="${j}">↑</button> <button class="link" data-op="itemdown" data-j="${j}">↓</button> <button class="link danger" data-op="itemdel" data-j="${j}">remove</button></span></div><small>${esc(R.textOf(s).slice(0, 80)) || '<i>empty</i>'}</small></div>`).join('');
        h += `<div class="actions"><button class="btn sm" data-op="itemadd">+ Add an item</button></div>`;
        break;
      case 'events':
        h += `<p class="note">Dates, times, titles and details are edited on the page. Links are set here.</p>`;
        h += (b.items || []).map((e, j) => `<div class="sub"><div class="shd"><b>${esc(e.date || 'Item')} · ${esc(R.textOf(e.title).slice(0, 40))}</b><span><button class="link" data-op="itemup" data-j="${j}">↑</button> <button class="link" data-op="itemdown" data-j="${j}">↓</button> <button class="link danger" data-op="itemdel" data-j="${j}">remove</button></span></div>${url(P(`items.${j}.url`), e.url)}</div>`).join('');
        h += `<div class="actions"><button class="btn sm" data-op="itemadd">+ Add a date</button></div>`;
        break;
      case 'disclosure':
        h += `<p class="note">Terms and text are edited on the page.</p>` + (b.items || []).map((it, j) => `<div class="sub"><div class="shd"><b>${esc(it.term || 'Row ' + (j + 1))}</b><span><button class="link" data-op="itemup" data-j="${j}">↑</button> <button class="link" data-op="itemdown" data-j="${j}">↓</button> <button class="link danger" data-op="itemdel" data-j="${j}">remove</button></span></div></div>`).join('');
        h += `<div class="actions"><button class="btn sm" data-op="itemadd">+ Add a row</button></div>`;
        break;
      case 'toc': h += `<p class="note">Lists every Section head in the issue, in order, as jump links. Nothing to set.</p>`; break;
      case 'band': h += `<p class="note">A full-width navy strip that names a group of sections. In the print edition each band starts a new page.</p>`; break;
      case 'section': h += `<p class="note">Red label, display heading and an optional deck. Section heads feed the In this issue block and the print cover.</p>`; break;
      case 'quote': case 'paragraph': case 'divider': h += `<p class="note">Edited on the page. Select text for bold, italic and links.</p>`; break;
      case 'unknown': h += `<p class="note warn">This block came from a file with a type this version does not know. It is kept in the JSON and skipped in every edition.</p><textarea class="code" readonly style="width:100%;min-height:120px;font-family:var(--mono);font-size:11px">${esc(JSON.stringify(b.original, null, 1))}</textarea>`; break;
    }
    h += `<div class="actions"><button class="btn sm" data-op="up">${I.up} Up</button><button class="btn sm" data-op="down">${I.down} Down</button><button class="btn sm" data-op="dup">${I.dup} Duplicate</button><button class="btn sm danger" data-op="del">${I.del} Delete</button></div>`;
    box.innerHTML = h;
    box.querySelectorAll('.actions .btn svg').forEach(s => { s.style.width = '14px'; s.style.height = '14px'; });
  }
  function renderPubInspector(box) {
    const p = issue.publication, is = issue.issue, T = R.theme(p.theme);
    const colorRow = (k, label) => `<label><input type="color" data-path="publication.theme.${k}" value="${esc(T[k])}"> ${label}</label>`;
    const fontList = `<datalist id="fonts"><option value="Archivo"><option value="IBM Plex Sans"><option value="IBM Plex Serif"><option value="Source Serif 4"><option value="Literata"><option value="Newsreader"><option value="Public Sans"><option value="Work Sans"><option value="Libre Franklin"><option value="Fraunces"></datalist>`;
    box.innerHTML = `<h2>This issue</h2>` +
      `<div class="f"><div class="row">${inp('issue.number', is.number, 'text', 'placeholder="Number" style="max-width:30%"')}${inp('issue.month', is.month, 'text', 'placeholder="Month, e.g. November 2026"')}</div></div>` +
      f('Coverage line', inp('issue.coverage', is.coverage), 'Shown in the issue bar, e.g. "News from Oct 20 to Nov 16, 2026".') +
      f('Status', inp('issue.status', is.status), 'Internal: printed on the PDF cover colophon only.') +
      `<h2 style="padding-left:0">Publication</h2>` +
      f('Title', inp('publication.title', p.title)) + f('Organization line', inp('publication.kicker', p.kicker)) +
      f('Description', `<textarea data-path="publication.dek">${esc(p.dek)}</textarea>`) +
      f('Publisher', inp('publication.publisher', p.publisher), 'Completes "is published by …"') + f('Editor', inp('publication.editor', p.editor)) +
      f('Contact', inp('publication.contact', p.contact)) + f('Address', inp('publication.address', p.address)) + f('Website', inp('publication.url', p.url, 'url')) +
      f('Footer line (optional)', `<textarea data-path="publication.footer">${esc(p.footer)}</textarea>`, 'Replaces the default "published by" sentence. Bold, italic and links allowed.') +
      `<h2 style="padding-left:0">Theme</h2><div class="f"><div class="colors">${colorRow('navy', 'Headings, bands')}${colorRow('red', 'Labels, rules')}${colorRow('powder', 'Links')}${colorRow('light', 'Text on navy')}${colorRow('panel', 'Panels')}${colorRow('rule', 'Borders')}${colorRow('ink', 'Body text')}${colorRow('muted', 'Muted text')}${colorRow('paper', 'Page')}</div></div>` +
      fontList + f('Display font', inp('publication.theme.fontDisplay', T.fontDisplay, 'text', 'list="fonts"'), 'Headings. Loaded from Google Fonts in the web and print editions; email uses Arial.') +
      f('Body font', inp('publication.theme.fontBody', T.fontBody, 'text', 'list="fonts"')) + f('Interface font', inp('publication.theme.fontUi', T.fontUi, 'text', 'list="fonts"'), 'Labels, captions, lists.') +
      `<div class="actions"><button class="btn sm" id="themeReset">Reset to UM brand theme</button></div>`;
  }

  // ---------- block operations ----------
  function addBlock(type, at) {
    const b = R.makeBlock(type); at = Math.max(0, Math.min(issue.blocks.length, at == null ? issue.blocks.length : at));
    issue.blocks.splice(at, 0, b); selected = b.id; sideTab = 'block';
    save(); renderCanvas(at); renderInspector(); toast(`${R.BLOCKS[type].label} added`);
  }
  function removeBlock(i) {
    const b = issue.blocks[i]; if (!b) return;
    issue.blocks.splice(i, 1); selected = issue.blocks[Math.min(i, issue.blocks.length - 1)]?.id || null;
    save(); snapshot(true); renderCanvas(); renderInspector(); toast(`${(R.BLOCKS[b.type] || { label: 'Block' }).label} deleted`, () => { issue.blocks.splice(i, 0, b); selected = b.id; save(); renderCanvas(i); renderInspector(); });
  }
  function moveBlock(i, d) { const j = i + d; if (j < 0 || j >= issue.blocks.length) return; const [b] = issue.blocks.splice(i, 1); issue.blocks.splice(j, 0, b); save(); renderCanvas(); renderInspector(); const el = $(`#canvas .blk[data-index="${j}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function dupBlock(i) { const c = JSON.parse(JSON.stringify(issue.blocks[i])); c.id = R.uid(); issue.blocks.splice(i + 1, 0, c); selected = c.id; save(); renderCanvas(i + 1); renderInspector(); }
  function selectBlock(id, showSettings) { if (selected !== id) { selected = id; $$('#canvas .blk').forEach(el => { el.dataset.selected = el.dataset.id === id ? 'true' : 'false'; }); renderOutline(); } if (showSettings) sideTab = 'block'; renderInspector(); }

  // ---------- field edits from the canvas ----------
  function readField(el) {
    const path = el.dataset.field; if (!path) return;
    const val = el.dataset.rich ? R.cleanInline(el.innerHTML) : el.textContent.replace(/\s+/g, ' ').trim();
    if (path === 'issue.number') { const n = Number(val); setPath(issue, path, Number.isFinite(n) && val !== '' ? n : val); }
    else setPath(issue, path, val);
    scheduleSave();
    if (/^(blocks\.\d+\.(heading|label|head|title|text)|publication\.title)$/.test(path)) debounce('derived', refreshDerived, 600);
    if (path.startsWith('publication.') || path.startsWith('issue.')) debounce('sel', renderIssueSelect, 600);
  }
  const timers = {};
  function debounce(k, fn, ms) { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); }

  // ---------- floating toolbar ----------
  function richAncestor(node) { let el = node && (node.nodeType === 1 ? node : node.parentElement); return el ? el.closest('#canvas .ed.rich') : null; }
  function updateFtb() {
    const ftb = $('#ftb'); const s = document.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) { ftb.dataset.open = 'false'; return; }
    const r = s.getRangeAt(0); const host = richAncestor(r.commonAncestorContainer);
    if (!host) { ftb.dataset.open = 'false'; return; }
    const rect = r.getBoundingClientRect(); const stage = $('#stage').getBoundingClientRect();
    ftb.dataset.open = 'true';
    ftb.style.left = Math.max(8, rect.left - stage.left + rect.width / 2 - ftb.offsetWidth / 2 + $('#stage').scrollLeft) + 'px';
    ftb.style.top = Math.max(8, rect.top - stage.top - ftb.offsetHeight - 8 + $('#stage').scrollTop) + 'px';
  }
  function applyCmd(cmd) {
    const s = document.getSelection(); if (!s || !s.rangeCount) return;
    const host = richAncestor(s.getRangeAt(0).commonAncestorContainer); if (!host) return;
    if (cmd === 'link') { savedRange = s.getRangeAt(0).cloneRange(); return linkDialog(host); }
    document.execCommand(cmd === 'unlink' ? 'unlink' : cmd, false, null);
    readField(host); updateFtb();
  }
  async function linkDialog(host) {
    const a = savedRange && savedRange.commonAncestorContainer && (savedRange.commonAncestorContainer.nodeType === 1 ? savedRange.commonAncestorContainer : savedRange.commonAncestorContainer.parentElement).closest('a');
    const cur = a ? a.getAttribute('href') : '';
    const v = await dialog({ title: 'Link', body: `<div class="f"><label for="lk">Address</label><input type="url" id="lk" value="${esc(cur)}" placeholder="https://… or mailto:…" autofocus><small>Only http, https and mailto links are published.</small></div>`, buttons: [{ label: 'Apply', primary: true, value: 'ok' }, ...(cur ? [{ label: 'Remove link', value: 'rm' }] : []), { label: 'Cancel', value: 'cancel' }], read: () => $('#lk').value });
    if (!v || v.value === 'cancel') return;
    host.focus(); const s = document.getSelection(); s.removeAllRanges(); s.addRange(savedRange);
    if (v.value === 'rm') document.execCommand('unlink');
    else { const u = R.safeUrl(v.data); if (!u) return toast('That address is not allowed. Use http, https or mailto.'); document.execCommand('createLink', false, u); }
    readField(host);
  }

  // ---------- dialogs and toasts ----------
  function dialog({ title, body, buttons, read }) {
    return new Promise(resolve => {
      const d = $('#dlg'); $('#dlgTitle').textContent = title; $('#dlgBody').innerHTML = body;
      $('#dlgFoot').innerHTML = (buttons || [{ label: 'Close', value: 'ok', primary: true }]).map(b => `<button type="button" class="btn sm ${b.primary ? 'primary' : ''}" data-v="${esc(b.value)}">${esc(b.label)}</button>`).join('');
      const done = (v) => { d.close(); resolve(v == null ? null : { value: v, data: read ? read() : null }); cleanup(); };
      const onClick = (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v); };
      const onCancel = (e) => { e.preventDefault(); done(null); };
      const cleanup = () => { $('#dlgFoot').removeEventListener('click', onClick); d.removeEventListener('cancel', onCancel); $('#dlgX').onclick = null; };
      $('#dlgFoot').addEventListener('click', onClick); d.addEventListener('cancel', onCancel); $('#dlgX').onclick = () => done(null);
      d.showModal(); const af = $('[autofocus]', d); if (af) af.focus();
    });
  }
  let toastTimer, undoFn = null;
  function toast(msg, undo) {
    const t = $('#toast'); undoFn = undo || null;
    t.innerHTML = esc(msg) + (undo ? ' &nbsp;<button class="link" id="undoBtn" style="color:#B1DDF6;pointer-events:auto">Undo</button>' : '');
    t.style.pointerEvents = undo ? 'auto' : 'none'; t.dataset.show = 'true';
    if (undo) $('#undoBtn').onclick = () => { undoFn && undoFn(); undoFn = null; t.dataset.show = 'false'; };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.dataset.show = 'false'; }, undo ? 7000 : 2600);
  }

  // ---------- files ----------
  function download(name, text, type) { const blob = new Blob([text], { type: type || 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function fileBase() { return `${R.textOf(issue.publication.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'newsletter'}-issue-${String(issue.issue.number).replace(/[^\w.-]/g, '')}`; }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); return ok;
    }
  }
  function openPrint() {
    const html = R.renderPrint(issue, { autoprint: true });
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to open the print edition.');
    w.document.open(); w.document.write(html); w.document.close();
  }
  function openEdition(ed) {
    const html = ed === 'email' ? R.renderEmail(issue) : ed === 'print' ? R.renderPrint(issue) : R.renderWeb(issue);
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to open the edition.');
    w.document.open(); w.document.write(html); w.document.close();
  }
  function importJson(file) {
    const rd = new FileReader();
    rd.onload = async () => {
      let raw; try { raw = JSON.parse(String(rd.result)); } catch (e) { return dialog({ title: 'Could not import', body: `<p>That file is not valid JSON.</p>` }); }
      const { issue: is, problems } = R.migrate(raw);
      if (store.issues[is.id]) is.id = R.uid();
      if (problems.length) await dialog({ title: 'Imported with notes', body: `<p>The issue was imported. Some parts needed repair:</p><ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` });
      switchTo(is, true); toast('Issue imported');
    };
    rd.readAsText(file);
  }
  function switchTo(is, isNew) {
    if (saveTimer) save();
    issue = is; selected = null; lastSnap = 0;
    if (isNew) { store.issues[is.id] = is; store.order.push(is.id); }
    store.current = is.id; persistStore(); snapshot(true);
    renderIssueSelect(); renderCanvas(); renderInspector(); updateWords(); if (mode === 'preview') renderPreview();
  }
  async function imageFile(file, i) {
    if (!file || !file.type.startsWith('image/')) return toast('That is not an image file.');
    const dataUrl = await new Promise((res, rej) => { const img = new Image(); const u = URL.createObjectURL(file); img.onload = () => {
      const max = 1600; const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      const png = file.type === 'image/png' && file.size < 400000; res(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.84)); }; img.onerror = rej; img.src = u; }).catch(() => null);
    if (!dataUrl) return toast('Could not read that image.');
    if (dataUrl.length > 2500000) toast('Large image embedded. The JSON will be big; a public URL is lighter.');
    issue.blocks[i].src = dataUrl; save(); refreshBlock(i); renderInspector();
  }

  // ---------- preview ----------
  function renderPreview() {
    const html = edition === 'email' ? R.renderEmail(issue) : edition === 'print' ? R.renderPrint(issue) : R.renderWeb(issue);
    const pv = $('#pv'); pv.srcdoc = html;
    const hints = { web: 'Self-contained page. Light and dark follow the reader\'s system. Check 375 for phones.', email: 'Tables and inline styles only, 600px. Images need a public URL. Test by sending it to yourself.', print: 'US Letter. Export opens the print dialog; choose Save as PDF. Each band starts a new page.' };
    $('#phint').textContent = hints[edition];
    $$('#widthSeg button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === pw)));
    $('#pframe').style.setProperty('--pw', pw >= 1280 ? '100%' : pw + 'px');
  }
  function setMode(m) {
    mode = m; $('#stage').dataset.mode = m; $('#modeEdit').setAttribute('aria-pressed', m === 'edit'); $('#modePreview').setAttribute('aria-pressed', m === 'preview');
    if (m === 'preview') { if (saveTimer) save(); renderPreview(); } else renderCanvas();
  }

  // ---------- history ----------
  async function historyDialog() {
    let h = []; try { h = JSON.parse(localStorage.getItem(HIST + issue.id) || '[]'); } catch (e) { h = []; }
    if (!h.length) return dialog({ title: 'History', body: '<p>No earlier versions of this issue yet. A snapshot is kept every few minutes while you edit, and when you delete a block.</p>' });
    const v = await dialog({ title: 'History', body: `<p>Restore an earlier autosave. The current version is kept as a new snapshot first.</p><ul class="hist">${h.map((s, j) => `<li><span>${esc(new Date(s.t).toLocaleString())} · ${s.words} words</span><button type="button" class="btn sm" data-v="r${j}">Restore</button></li>`).join('')}</ul>`, buttons: [{ label: 'Close', value: 'cancel' }] });
    if (!v || !/^r\d+$/.test(v.value)) return;
    const snap = h[Number(v.value.slice(1))]; snapshot(true);
    const { issue: is } = R.migrate(JSON.parse(snap.data)); is.id = issue.id; store.issues[is.id] = is; issue = is; persistStore(); renderCanvas(); renderInspector(); renderIssueSelect(); updateWords(); toast('Earlier version restored');
  }

  // ---------- events ----------
  function wire() {
    const canvas = $('#canvas');
    canvas.addEventListener('input', e => { const el = e.target.closest('[data-field]'); if (el) readField(el); });
    canvas.addEventListener('focusin', e => { const blk = e.target.closest('.blk'); if (blk) selectBlock(blk.dataset.id, false); });
    canvas.addEventListener('click', e => {
      if (e.target.closest('a')) e.preventDefault();
      const op = e.target.closest('[data-op]'); const blk = e.target.closest('.blk');
      if (op && blk) { const i = Number(blk.dataset.index); e.preventDefault(); ({ up: () => moveBlock(i, -1), down: () => moveBlock(i, 1), dup: () => dupBlock(i), del: () => removeBlock(i), settings: () => selectBlock(blk.dataset.id, true) })[op.dataset.op](); return; }
      const add = e.target.closest('.addline button'); if (add) { paletteAt = Number(add.dataset.at); $('#palette button').focus(); toast('Pick a block type on the left to insert it here'); return; }
      if (blk && !e.target.closest('.ed')) selectBlock(blk.dataset.id, true);
    });
    canvas.addEventListener('keydown', e => {
      const ed = e.target.closest('.ed'); const blk = e.target.closest('.blk');
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && blk) { e.preventDefault(); const i = Number(blk.dataset.index); moveBlock(i, e.key === 'ArrowUp' ? -1 : 1); return; }
      if (!ed) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && ed.dataset.rich) { e.preventDefault(); savedRange = document.getSelection().getRangeAt(0).cloneRange(); linkDialog(ed); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i') && !ed.dataset.rich) { e.preventDefault(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (ed.dataset.rich && !e.shiftKey) document.execCommand('insertLineBreak'); else if (ed.dataset.rich) document.execCommand('insertLineBreak'); else ed.blur(); if (ed.dataset.rich) readField(ed); }
      if (e.key === 'Escape') { ed.blur(); $('#ftb').dataset.open = 'false'; }
    });
    canvas.addEventListener('paste', e => {
      const ed = e.target.closest('.ed'); if (!ed) return; e.preventDefault();
      const html = e.clipboardData.getData('text/html'); const text = e.clipboardData.getData('text/plain');
      if (ed.dataset.rich && html) document.execCommand('insertHTML', false, R.cleanInline(html)); else document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ed.dataset.rich ? '\n' : ' '));
      readField(ed);
    });
    document.addEventListener('selectionchange', () => debounce('ftb', updateFtb, 60));
    $('#ftb').addEventListener('mousedown', e => e.preventDefault());
    $('#ftb').addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b) applyCmd(b.dataset.cmd); });
    $('#stage').addEventListener('scroll', () => { $('#ftb').dataset.open = 'false'; });

    // palette
    let paletteAt = null;
    $('#palette').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (!b) return; const at = paletteAt != null ? paletteAt : (selected ? issue.blocks.findIndex(x => x.id === selected) + 1 : issue.blocks.length); paletteAt = null; addBlock(b.dataset.type, at); });

    // outline
    const ol = $('#outline'); let dragI = null;
    ol.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (!li) return; const i = Number(li.dataset.i); selectBlock(issue.blocks[i].id, true); const el = $(`#canvas .blk[data-index="${i}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (mode === 'preview') setMode('edit'); });
    ol.addEventListener('keydown', e => { const li = e.target.closest('li[data-i]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); li.click(); } });
    ol.addEventListener('dragstart', e => { const li = e.target.closest('li[data-i]'); if (!li) return; dragI = Number(li.dataset.i); li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    ol.addEventListener('dragover', e => { e.preventDefault(); $$('li.over', ol).forEach(x => x.classList.remove('over')); const li = e.target.closest('li[data-i]'); if (li) li.classList.add('over'); });
    ol.addEventListener('dragleave', e => { const li = e.target.closest('li[data-i]'); if (li) li.classList.remove('over'); });
    ol.addEventListener('drop', e => { e.preventDefault(); const li = e.target.closest('li[data-i]'); $$('li.over,li.dragging', ol).forEach(x => x.classList.remove('over', 'dragging')); if (!li || dragI == null) return; let j = Number(li.dataset.i); if (j === dragI) return; const [b] = issue.blocks.splice(dragI, 1); if (j > dragI) j--; issue.blocks.splice(j, 0, b); dragI = null; save(); renderCanvas(); renderInspector(); });
    ol.addEventListener('dragend', () => { $$('li.over,li.dragging', ol).forEach(x => x.classList.remove('over', 'dragging')); dragI = null; });

    // inspector
    const insp = $('#inspector');
    insp.addEventListener('input', e => {
      const el = e.target.closest('[data-path]'); if (!el) return; const path = el.dataset.path;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (path === 'issue.number') { const n = Number(v); v = Number.isFinite(n) && v !== '' ? n : v; }
      if (path.endsWith('.level')) v = Number(v);
      setPath(issue, path, v); scheduleSave();
      const m = /^blocks\.(\d+)\./.exec(path);
      if (m) { debounce('blk' + m[1], () => refreshBlock(Number(m[1])), el.tagName === 'SELECT' || el.type === 'checkbox' ? 0 : 250); if (/\.(url|src|publicSrc)$/.test(path)) debounce('urlhelp', renderInspector, 900); }
      else if (path.startsWith('publication.theme')) debounce('theme', () => { const st = $('#canvas style'); if (st) st.textContent = R.webCss(R.theme(issue.publication.theme)); }, 150);
      else { debounce('mast', () => { const mast = $('#canvas .mast'); if (mast && document.activeElement && !mast.contains(document.activeElement)) renderCanvas(); renderIssueSelect(); }, 500); }
    });
    insp.addEventListener('click', e => {
      if (e.target.id === 'deselect') { selected = null; $$('#canvas .blk').forEach(el => { el.dataset.selected = 'false'; }); renderInspector(); renderOutline(); return; }
      if (e.target.id === 'themeReset') { issue.publication.theme = Object.assign({}, R.THEME); save(); renderCanvas(); renderInspector(); return; }
      const op = e.target.closest('[data-op]'); if (!op) return;
      const i = issue.blocks.findIndex(b => b.id === selected); if (i < 0) return; const b = issue.blocks[i]; const j = Number(op.dataset.j);
      const arr = b.type === 'story' ? b.links : b.items;
      const swap = (k, d) => { const t = k + d; if (t < 0 || t >= arr.length) return; [arr[k], arr[t]] = [arr[t], arr[k]]; };
      switch (op.dataset.op) {
        case 'up': return moveBlock(i, -1); case 'down': return moveBlock(i, 1); case 'dup': return dupBlock(i); case 'del': return removeBlock(i);
        case 'linkadd': b.links.push({ title: 'Source title', url: '', outlet: '', date: '', access: 'Free' }); break;
        case 'linkdel': b.links.splice(j, 1); break; case 'linkup': swap(j, -1); break; case 'linkdown': swap(j, 1); break;
        case 'itemadd': b.items.push(b.type === 'list' ? '' : b.type === 'events' ? { date: 'Date', when: '', title: 'Event', url: '', detail: '', where: '' } : { term: 'Term', text: '' }); break;
        case 'itemdel': b.items.splice(j, 1); break; case 'itemup': swap(j, -1); break; case 'itemdown': swap(j, 1); break;
        case 'imgclear': b.src = ''; break;
        default: return;
      }
      save(); refreshBlock(i); renderInspector();
    });
    insp.addEventListener('change', e => { if (e.target.id === 'imgFile') { const i = issue.blocks.findIndex(b => b.id === selected); if (i >= 0) imageFile(e.target.files[0], i); } });
    insp.addEventListener('dragover', e => { const d = e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
    insp.addEventListener('dragleave', e => { const d = e.target.closest('#drop'); if (d) d.classList.remove('over'); });
    insp.addEventListener('drop', e => { const d = e.target.closest('#drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); const i = issue.blocks.findIndex(b => b.id === selected); if (i >= 0 && e.dataTransfer.files[0]) imageFile(e.dataTransfer.files[0], i); });
    $('#tabBlock').onclick = () => { sideTab = 'block'; renderInspector(); $('#settingsBtn').setAttribute('aria-pressed', 'false'); };
    $('#tabPub').onclick = () => { sideTab = 'pub'; renderInspector(); $('#settingsBtn').setAttribute('aria-pressed', 'true'); };
    $('#settingsBtn').onclick = () => { sideTab = sideTab === 'pub' ? 'block' : 'pub'; renderInspector(); $('#settingsBtn').setAttribute('aria-pressed', String(sideTab === 'pub')); };

    // top bar
    $('#modeEdit').onclick = () => setMode('edit'); $('#modePreview').onclick = () => setMode('preview');
    $$('.pbar [data-ed]').forEach(b => b.onclick = () => { edition = b.dataset.ed; $$('.pbar [data-ed]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); if (edition === 'email') pw = 600; if (edition === 'print') pw = 1280; renderPreview(); });
    $$('#widthSeg button').forEach(b => b.onclick = () => { pw = Number(b.dataset.w); renderPreview(); });
    $('#openPreview').onclick = () => openEdition(edition);
    $('#issueSel').onchange = e => { const is = store.issues[e.target.value]; if (is) switchTo(is, false); };
    const menus = [['#issueMenuBtn', '#issueMenu'], ['#exportBtn', '#exportMenu']];
    menus.forEach(([btn, pop]) => { $(btn).onclick = e => { e.stopPropagation(); const open = $(pop).dataset.open === 'true'; menus.forEach(([b2, p2]) => { $(p2).dataset.open = 'false'; $(b2).setAttribute('aria-expanded', 'false'); }); $(pop).dataset.open = String(!open); $(btn).setAttribute('aria-expanded', String(!open)); }; });
    document.addEventListener('click', () => menus.forEach(([b, p]) => { $(p).dataset.open = 'false'; $(b).setAttribute('aria-expanded', 'false'); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') menus.forEach(([b, p]) => { $(p).dataset.open = 'false'; }); });
    $('#issueMenu').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      switch (b.dataset.act) {
        case 'new': switchTo(starterIssue(), true); toast('New issue created'); break;
        case 'dup': { const c = JSON.parse(JSON.stringify(issue)); c.id = R.uid(); c.created = now(); c.blocks.forEach(x => { x.id = R.uid(); }); if (typeof c.issue.number === 'number') c.issue.number += 1; c.issue.status = 'Draft'; switchTo(c, true); toast('Issue duplicated'); break; }
        case 'sample': try { const is = await loadSample(); if (store.issues[is.id]) is.id = R.uid(); switchTo(is, true); toast('Sample issue loaded'); } catch (err) { dialog({ title: 'Sample not available', body: `<p>The sample file could not be loaded (${esc(err.message)}). When the studio is opened from a local file, browsers block that request; serve the folder over http or import <code>samples/taming-the-whirlwind-issue-1.json</code> with Import.</p>` }); } break;
        case 'import': $('#fileJson').click(); break;
        case 'history': historyDialog(); break;
        case 'delete': {
          const v = await dialog({ title: 'Delete this issue?', body: `<p><b>${esc(R.textOf(issue.publication.title))} · Issue ${esc(String(issue.issue.number))}</b> will be removed from this browser. Export its JSON first if you want to keep it.</p>`, buttons: [{ label: 'Delete', value: 'ok', primary: true }, { label: 'Cancel', value: 'cancel' }] });
          if (!v || v.value !== 'ok') return;
          delete store.issues[issue.id]; store.order = store.order.filter(x => x !== issue.id); try { localStorage.removeItem(HIST + issue.id); } catch (e2) { /* ignore */ }
          const next = store.order.length ? store.issues[store.order[0]] : starterIssue(); switchTo(next, !store.order.length); toast('Issue deleted'); break;
        }
      }
    });
    $('#fileJson').onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };
    $('#exportMenu').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; if (saveTimer) save();
      const base = fileBase();
      switch (b.dataset.act) {
        case 'json': download(base + '.json', JSON.stringify(issue, null, 1), 'application/json'); break;
        case 'web': download(base + '.html', R.renderWeb(issue), 'text/html'); break;
        case 'email': download(base + '-email.html', R.renderEmail(issue), 'text/html'); break;
        case 'print': openPrint(); break;
        case 'wp': toast((await copyText(R.renderWordPress(issue))) ? 'Block markup copied. In WordPress: new post, Code editor, paste, Save draft.' : 'Could not copy. Export the web page instead.'); break;
        case 'copyemail': toast((await copyText(R.renderEmail(issue))) ? 'Email HTML copied' : 'Could not copy.'); break;
      }
    });
    $('#helpBtn').onclick = () => dialog({ title: 'How the studio works', body: `
      <p><b>One file, three editions.</b> Everything you write is saved as issue JSON in this browser, and exported from the Export menu. The web page, the email and the print PDF are all rendered from that file, so edit once.</p>
      <ul><li><b>Edit on the page.</b> Click any text and type. Select text in a body field for bold, italic and links (<kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>). <kbd>Enter</kbd> adds a line break.</li>
      <li><b>Block settings</b> hold what is not text: links, access labels, images, tones, list style. Select a block, or click its gear.</li>
      <li><b>Add blocks</b> from the left. A new block goes after the selected one. Drag the outline to reorder, or use <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>.</li>
      <li><b>Images</b> can be uploaded (stored in the JSON) or linked. Email needs a public URL.</li>
      <li><b>Preview</b> shows each edition at phone, email and desktop widths. "Open in a tab" shows the real file.</li>
      <li><b>Print / PDF</b> opens a US Letter edition with a cover, running heads and page numbers, then the print dialog. Choose Save as PDF.</li>
      <li><b>WordPress.</b> Copy for WordPress puts block markup on the clipboard. In WordPress, start a new post, switch to the Code editor, paste, and save as a draft. Nothing is published from here.</li>
      <li><b>Keep your JSON.</b> Export it when an issue is done. Import restores it anywhere, and History holds the last autosaves in this browser.</li></ul>
      <p style="color:#4A5568;font-size:12.5px">Local-first: no accounts, no server, nothing sent anywhere. Fonts load from Google Fonts in the studio and the web and print editions.</p>` });
    window.addEventListener('beforeunload', () => { if (saveTimer) save(); });
    window.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); toast('Saved'); } });
  }

  // ---------- boot ----------
  async function boot() {
    store = load(); renderPalette();
    if (store.current && store.issues[store.current]) issue = R.migrate(store.issues[store.current]).issue;
    else if (store.order.length && store.issues[store.order[0]]) issue = R.migrate(store.issues[store.order[0]]).issue;
    else {
      try { issue = await loadSample(); } catch (e) { issue = starterIssue(); }
      store.issues[issue.id] = issue; store.order.push(issue.id); store.current = issue.id; persistStore();
    }
    wire(); renderIssueSelect(); renderCanvas(); renderInspector(); updateWords();
  }
  boot();
})();
