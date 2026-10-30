// Acceptance tests for render.js: run with  node tools/test-render.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const R = createRequire(import.meta.url)(path.join(here, '..', 'render.js'));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

// 1. sample issue loads, migrates cleanly, round-trips
const raw = JSON.parse(fs.readFileSync(path.join(here, '..', 'samples', 'taming-the-whirlwind-issue-1.json'), 'utf8'));
const { issue, problems } = R.migrate(raw);
ok(problems.length === 0, 'sample migrates with no problems ' + JSON.stringify(problems));
const again = R.migrate(JSON.parse(JSON.stringify(issue))).issue;
ok(JSON.stringify(again.blocks) === JSON.stringify(issue.blocks) && again.publication.title === issue.publication.title, 'JSON round trip keeps blocks and metadata');
ok(R.wordCount(issue) > 1000, `sample is a real issue (${R.wordCount(issue)} words)`);

// 2. the three editions render and contain the content
const web = R.renderWeb(issue), email = R.renderEmail(issue), print = R.renderPrint(issue);
for (const [name, html] of [['web', web], ['email', email], ['print', print]]) {
  ok(html.includes('Taming the Whirlwind') && html.includes('Faculty are watching students more closely'), `${name} edition carries masthead and story text`);
  ok(!/<script/i.test(html.replace(/<script>window\.addEventListener\("load"[\s\S]*?<\/script>/, '')), `${name} edition has no scripts`);
  ok(!/javascript:/i.test(html), `${name} edition has no javascript: URLs`);
}
ok(/<table role="presentation"/.test(email) && !/display:\s*grid/.test(email) && !/fonts\.googleapis/.test(email), 'email uses tables, no grid, no web fonts');
ok(/<meta name="viewport"/.test(web) && /@media \(max-width:640px\)/.test(web), 'web edition is responsive');
ok(/@page\{size:Letter/.test(print) && /counter\(page\)/.test(print) && /<title>/.test(print), 'print edition is Letter with page numbers and a title');

// 3. hostile input cannot become executable markup in any edition
const bad = R.newIssue();
bad.publication.title = '<img src=x onerror=alert(1)>Title';
bad.publication.theme.navy = 'red;}body{background:url(javascript:alert(1))';
bad.publication.theme.fontDisplay = 'Arial"; } </style><script>alert(1)</script>';
bad.blocks = [
  Object.assign(R.makeBlock('paragraph'), { html: 'Click <a href="javascript:alert(1)">here</a> <a href="data:text/html,hi">or here</a> <script>alert(2)</script><img src=x onerror=alert(3)> <b onclick="x()">bold</b> <a href="https://ok.example/">fine</a>' }),
  Object.assign(R.makeBlock('image'), { src: 'javascript:alert(1)', publicSrc: 'data:text/html;base64,PHNjcmlwdD4=', alt: '"><script>alert(1)</script>', caption: '<iframe src=x>' }),
  Object.assign(R.makeBlock('story'), { head: '</h3><script>alert(1)</script>', links: [{ title: 'x', url: 'vbscript:msgbox', outlet: 'o', date: 'd', access: '<b>x</b>' }] }),
  Object.assign(R.makeBlock('resource'), { url: ' JAVASCRIPT:alert(1)', title: 't' }),
  Object.assign(R.makeBlock('callout'), { tone: 'navy', html: '<a href="javascript:x">j</a>' }),
  { id: 'z', type: 'evil<script>', html: 'x' },
];
const { issue: hostile, problems: hp } = R.migrate(bad);
ok(hp.some(p => /unknown type/.test(p)), 'unknown block type is reported and kept');
for (const [name, html] of [['web', R.renderWeb(hostile)], ['email', R.renderEmail(hostile)], ['print', R.renderPrint(hostile)], ['wordpress', R.renderWordPress(hostile)]]) {
  const body = html.replace(/<script>window\.addEventListener\("load"[\s\S]*?<\/script>/, '');
  ok(!/<script/i.test(body), `${name}: no script tags survive`);
  ok(!/javascript:|vbscript:|data:text\/html/i.test(body), `${name}: no javascript/vbscript/data:text URLs survive`);
  ok(!/<[^>]*\son(error|click)=/i.test(body), `${name}: no event handler attributes survive`);
  ok(!/<img src=x/i.test(body) && !/<iframe/i.test(body), `${name}: no injected img/iframe elements`);
  ok(body.includes('https://ok.example/'), `${name}: the legitimate link is kept`);
}
ok(R.theme(hostile.publication.theme).navy === R.THEME.navy && R.theme(hostile.publication.theme).fontDisplay === R.THEME.fontDisplay, 'invalid theme colors and fonts fall back to defaults');

// 4. required block set from the acceptance list renders in every edition
const full = R.newIssue();
full.blocks = ['heading', 'paragraph', 'quote', 'image', 'note', 'resource', 'story', 'callout', 'events', 'list', 'toc', 'section', 'band', 'disclosure', 'divider'].map(t => R.makeBlock(t));
full.blocks[3].src = 'https://example.org/a.jpg'; full.blocks[3].alt = 'An example';
ok(R.renderWeb(full).includes('example.org/a.jpg') && R.renderPrint(full).includes('example.org/a.jpg') && R.renderEmail(full).includes('example.org/a.jpg'), 'image with an https URL appears in all three editions');
const dataImg = Object.assign(R.makeBlock('image'), { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Embedded' });
full.blocks.push(dataImg);
ok(R.renderWeb(full).includes('data:image/png;base64') && /\[Image: Embedded/.test(R.renderEmail(full)), 'embedded image shows on web and becomes a labelled placeholder in email');

console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
