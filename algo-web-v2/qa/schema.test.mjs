// qa/schema.test.mjs — kiểm schema trang + registry, chạy bằng node, không cần browser.
// Chạy từ gốc repo: node qa/schema.test.mjs
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/core/tg.js', 'js/core/terms.js', 'js/core/render.js']) {
  vm.runInContext(read(f), ctx, { filename: f });
}
const TG = ctx.TG;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  ok  ' + name); }
  else { failed++; console.error('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

// 1. trang thiếu mục phải báo lỗi
const bad = TG.validatePage({ id: 'x' });
check('validatePage báo lỗi trang thiếu mục', Array.isArray(bad) && bad.length > 0);

// 2. trang fixture hợp lệ không báo lỗi
const valid = JSON.parse(read('qa/fixtures/valid-page.json'));
const good = TG.validatePage(valid);
check('trang hợp lệ không báo lỗi', good.length === 0, good.join('; '));

// 3. các biến thể sai phải bị bắt
const cases = [
  ['id có ký tự lạ', (d) => { d.id = 'Bad_Id!'; }],
  ['thiếu group', (d) => { delete d.group; }],
  ['thiếu title', (d) => { delete d.title; }],
  ['thiếu order', (d) => { delete d.order; }],
  ['thiếu fn.text', (d) => { d.fn = {}; }],
  ['why.paras rỗng', (d) => { d.why.paras = []; }],
  ['how rỗng', (d) => { d.how = []; }],
  ['how id sai dạng', (d) => { d.how[1].id = 'x.9'; }],
  ['how id không tăng', (d) => { d.how[1].id = '3.0'; }],
  ['formulas+params đều rỗng', (d) => { d.formulas = []; d.params = []; }],
  ['params thiếu src', (d) => { d.params[0].src = undefined; }],
  ['params kind lạ', (d) => { d.params[0].kind = 'weird'; }],
  ['figures rỗng không noFigureReason', (d) => { d.figures = []; d.noFigureReason = null; }],
  ['limits rỗng', (d) => { d.limits = []; }],
  ['limits status lạ', (d) => { d.limits[0].evidence.status = 'MAYBE'; }],
  ['sources rỗng', (d) => { d.sources = []; }],
  ['values thiếu src khi không illustrative', (d) => { d.how[0].values[0].src = undefined; }],
];
for (const [name, mutate] of cases) {
  const d = JSON.parse(JSON.stringify(valid));
  mutate(d);
  const errs = TG.validatePage(d);
  check('bắt lỗi: ' + name, errs.length > 0, errs.join('; '));
}

// 4. values kind=illustrative không bắt buộc src
{
  const d = JSON.parse(JSON.stringify(valid));
  d.how[0].values[0].kind = 'illustrative';
  d.how[0].values[0].src = undefined;
  const errs = TG.validatePage(d);
  check('illustrative không cần src', errs.length === 0, errs.join('; '));
}
// 5. figures rỗng + noFigureReason → hợp lệ
{
  const d = JSON.parse(JSON.stringify(valid));
  d.figures = [];
  d.noFigureReason = 'Chưa có ảnh thật phù hợp — sẽ bổ sung ở Task 3.';
  const errs = TG.validatePage(d);
  check('figures rỗng + noFigureReason hợp lệ', errs.length === 0, errs.join('; '));
}
// 6. registry definePage/getPageDef/pageIds
{
  const d = JSON.parse(JSON.stringify(valid));
  TG.definePage(d);
  check('getPageDef trả về đúng def', TG.getPageDef('_fixture') && TG.getPageDef('_fixture').title === d.title);
  check('pageIds chứa _fixture', TG.pageIds().includes('_fixture'));
}
// 7. renderPage tồn tại; nếu có DOM thật (browser/e2e) thì xuất đúng 7 section s1..s7
{
  check('TG.renderPage là hàm', typeof TG.renderPage === 'function');
  if (typeof ctx.document !== 'undefined') {
    try {
      const el = TG.renderPage(valid);
      const secs = el.querySelectorAll('section.sec');
      check('renderPage xuất 7 section s1..s7', secs.length === 7 && secs[0].id === 's1' && secs[6].id === 's7');
    } catch (e) { check('renderPage không ném lỗi', false, String(e)); }
  }
}
// 8. terms registry
{
  TG.defineTerms([{ term: 'Kalman filter', vi: 'bộ lọc dự đoán vị trí', def: 'x', role: 'y', example: 'z', page: 'kalman-lapjv' }]);
  const t = TG.getTerm('kalman filter');
  check('getTerm không phân biệt hoa thường', !!t && t.term === 'Kalman filter');
  check('getTerm alias', TG.getTerm('kalman') === null || TG.getTerm('kalman').term === 'Kalman filter');
}

if (failed) { console.error(failed + ' check(s) FAILED'); process.exit(1); }
console.log('schema ok');
