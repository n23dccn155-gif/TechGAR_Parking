/* TechGar2 algo-web — app shell: router, catalog, player, inspector.
 * SPEC §6-§7. Không fetch/module/network; chạy file:// và http://.
 * Metadata/scenario chỉ đưa vào DOM qua textContent — không inject HTML.
 */
(function () {
'use strict';

var NS = window.TechGarAlgo;
var ROOT = document.getElementById('app');
if (!NS) {
  ROOT.textContent = 'Thiếu shared/engine.js — namespace TechGarAlgo không tồn tại.';
  return;
}

/* ================= Tiện ích DOM ================= */
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'cls') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k]; /* chỉ dùng cho markup tĩnh nội bộ */
    else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') {
      n.addEventListener(k.slice(2), attrs[k]);
    } else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
    if (c == null) return;
    n.appendChild(typeof c === 'string' || typeof c === 'number'
      ? document.createTextNode(String(c)) : c);
  });
  return n;
}
function fmtNum(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 10000) / 10000);
}
function jsonShort(v, max) {
  try {
    var s = JSON.stringify(v);
    if (s === undefined) return 'undefined';
    return s.length > (max || 220) ? s.slice(0, (max || 220)) + '…' : s;
  } catch (e) { return String(v); }
}

/* ================= Trạng thái app ================= */
var App = {
  route: { page: 'catalog', id: null },
  navOpen: false,
  search: '',
  packFilter: null,
  /* player */
  lesson: null, scenarioId: null, params: {},
  trace: null, frameIdx: 0,
  playing: false, speed: 1, progress: 1,
  _raf: 0, _lastTs: 0, _carry: 0,
  reduced: false
};
try {
  App.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (window.matchMedia) {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
      App.reduced = e.matches; renderFrame();
    });
  }
} catch (e) { /* giữ false */ }

var SPEEDS = [0.25, 0.5, 1, 2, 4];
var PACK_LABEL = { frontend: 'Frontend', cv: 'Thị giác (CV)', integration: 'Tích hợp' };
var TOPIC_ORDER_HINT = {}; /* topic → index để sắp xếp ổn định */

/* ================= Router ================= */
function parseHash() {
  var h = location.hash || '#/';
  if (h.charAt(0) === '#') h = h.slice(1);
  var query = '';
  var qi = h.indexOf('?');
  if (qi >= 0) { query = h.slice(qi + 1); h = h.slice(0, qi); }
  if (h === '' || h === '/') return { page: 'catalog' };
  var m = h.match(/^\/algo\/([A-Za-z0-9_-]+)\/?$/);
  if (m) {
    var route = { page: 'algo', id: m[1] };
    if (query) {
      query.split('&').forEach(function (kv) {
        var p = kv.split('=');
        if (p[0] === 'scenario' && p[1]) route.scenario = decodeURIComponent(p[1]);
      });
    }
    return route;
  }
  return { page: 'notfound', path: h };
}

window.addEventListener('hashchange', function () {
  stopPlayback();
  render();
});

function goto(hash) { location.hash = hash; }

/* ================= Top bar / sidebar ================= */
function renderTopbar(route) {
  var bar = el('header', { cls: 'topbar' });
  var toggle = el('button', {
    cls: 'sidebar-toggle', 'aria-label': 'Mở/đóng danh mục',
    onclick: function () { App.navOpen = !App.navOpen; syncSidebarOpen(); }
  }, '☰');
  bar.appendChild(toggle);
  bar.appendChild(el('a', { cls: 'brand', href: '#/', html: 'TechGar2 <em>Algo</em>' }));
  var crumb = '';
  if (route.page === 'algo') crumb = route.id;
  bar.appendChild(el('span', { cls: 'crumb', text: crumb }));
  bar.appendChild(el('span', { cls: 'spacer' }));
  var st = NS.packStatus();
  var ps = el('span', { cls: 'pack-status' });
  ['frontend', 'cv', 'integration'].forEach(function (p) {
    var s = st[p];
    ps.appendChild(el('span', {
      cls: 'ps ' + (s.registered ? 'ok' : 'pending'),
      title: s.registered ? s.count + '/' + s.expected + ' bài đã nộp' : 'Chưa nộp — đang triển khai'
    }, (PACK_LABEL[p] || p) + ' ' + s.count + '/' + s.expected));
  });
  bar.appendChild(ps);
  return bar;
}

function syncSidebarOpen() {
  var sb = document.querySelector('.sidebar');
  if (sb) sb.classList.toggle('open', App.navOpen);
}

function lessonMatches(l, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if ((l.id + ' ' + l.title + ' ' + (l.topic || '') + ' ' + (l.summary || '')).toLowerCase().indexOf(q) >= 0) return true;
  var refs = l.codeRefs || [];
  for (var i = 0; i < refs.length; i++) {
    if (((refs[i].path || '') + ' ' + (refs[i].symbol || '')).toLowerCase().indexOf(q) >= 0) return true;
  }
  return false;
}

function renderSidebar() {
  var sb = el('aside', { cls: 'sidebar' + (App.navOpen ? ' open' : ''), role: 'navigation' });
  var sw = el('div', { cls: 'search' });
  sw.appendChild(el('input', {
    type: 'search', placeholder: 'Tìm ID / title / symbol…',
    'aria-label': 'Tìm thuật toán',
    value: App.search,
    oninput: function (e) { App.search = e.target.value; refreshNavAndCatalog(); }
  }));
  sb.appendChild(sw);

  var nav = el('div', { cls: 'nav-list', id: 'nav-list' });
  buildNav(nav);
  sb.appendChild(nav);
  return sb;
}

function buildNav(nav) {
  nav.textContent = '';
  var q = App.search;
  ['frontend', 'cv', 'integration'].forEach(function (p) {
    var pack = NS.packs[p];
    if (!pack) return;
    var items = pack.lessons.filter(function (l) { return lessonMatches(l, q); });
    if (!items.length) return;
    var g = el('div', { cls: 'nav-group' });
    g.appendChild(el('div', { cls: 'g-label', text: PACK_LABEL[p] }));
    items.forEach(function (l) {
      var active = App.route.page === 'algo' && App.route.id === l.id;
      g.appendChild(el('a', {
        cls: 'nav-item' + (active ? ' active' : ''),
        href: '#/algo/' + l.id
      }, [
        el('span', { cls: 'nid', text: l.id }),
        document.createTextNode(' · ' + l.title)
      ]));
    });
    nav.appendChild(g);
  });
  if (!nav.children.length) {
    nav.appendChild(el('div', { cls: 'g-label', text: 'Không có kết quả — pack có thể chưa nộp.' }));
  }
}

function refreshNavAndCatalog() {
  var nav = document.getElementById('nav-list');
  if (nav) buildNav(nav);
  var cat = document.getElementById('catalog-body');
  if (cat) buildCatalogBody(cat);
}

/* ================= Catalog ================= */
function renderCatalog() {
  var main = el('div');
  main.appendChild(el('div', { cls: 'hero' }, [
    el('h1', { text: 'Học thuật toán TechGar2' }),
    el('p', { text: '117 thuật toán canonical của hệ thống đỗ xe thông minh: điều hướng frontend, pipeline thị giác máy 2 camera, và lớp tích hợp gate-session. Mỗi trang có mô phỏng canvas, pseudocode tô sáng, inspector dữ liệu và dẫn chứng source.' })
  ]));

  /* cảnh báo đăng ký (nếu có) — QA đọc errors[] này */
  if (NS.errors.length) {
    var eb = el('div', { cls: 'error-box' });
    eb.appendChild(el('strong', { text: 'Lỗi đăng ký pack (' + NS.errors.length + '):' }));
    var ul = el('ul');
    NS.errors.slice(0, 10).forEach(function (e) {
      ul.appendChild(el('li', { text: '[' + e.pack + '] ' + e.message }));
    });
    if (NS.errors.length > 10) ul.appendChild(el('li', { text: '… và ' + (NS.errors.length - 10) + ' lỗi khác' }));
    eb.appendChild(ul);
    main.appendChild(eb);
  }

  var tools = el('div', { cls: 'catalog-tools' });
  tools.appendChild(el('input', {
    type: 'search', placeholder: 'Tìm theo tên, ID, chủ đề, đường dẫn/symbol…',
    'aria-label': 'Tìm trong catalog',
    oninput: function (e) {
      App.search = e.target.value; refreshNavAndCatalog();
      var si = document.querySelector('.sidebar .search input');
      if (si) si.value = App.search;
    }
  }));
  [['all', 'Tất cả'], ['frontend', 'Frontend'], ['cv', 'CV'], ['integration', 'Tích hợp']].forEach(function (kv) {
    tools.appendChild(el('button', {
      cls: 'chip' + ((App.packFilter || 'all') === kv[0] ? ' on' : ''),
      onclick: function () { App.packFilter = kv[0] === 'all' ? null : kv[0]; render(); }
    }, kv[1]));
  });
  main.appendChild(tools);

  var body = el('div', { id: 'catalog-body' });
  buildCatalogBody(body);
  main.appendChild(body);
  return main;
}

function buildCatalogBody(body) {
  body.textContent = '';
  var q = App.search, pf = App.packFilter;
  var total = 0, shown = 0;
  var pendingByPack = { frontend: [], cv: [], integration: [] };

  /* nhóm theo topic cho bài đã đăng ký; pending gom theo pack */
  ['frontend', 'cv', 'integration'].forEach(function (p) {
    var pack = NS.packs[p];
    var canon = NS.canonicalCatalog[p] || [];
    total += canon.length;
    var seenIds = {};
    if (pack) {
      var topics = {};
      pack.lessons.forEach(function (l) {
        seenIds[l.id] = true;
        var t = l.topic || 'Khác';
        (topics[t] = topics[t] || []).push(l);
      });
      Object.keys(topics).sort().forEach(function (t) {
        var items = topics[t].filter(function (l) { return lessonMatches(l, q) && (!pf || pf === p); });
        if (!items.length) return;
        shown += items.length;
        var block = el('div', { cls: 'topic-block' });
        block.appendChild(el('h2', null, [
          t + ' ', el('span', { cls: 'count', text: items.length + ' bài · ' + PACK_LABEL[p] })
        ]));
        var cards = el('div', { cls: 'cards' });
        items.forEach(function (l) { cards.appendChild(lessonCard(l)); });
        block.appendChild(cards);
        body.appendChild(block);
      });
    }
    canon.forEach(function (id) {
      if (!seenIds[id]) pendingByPack[p].push(id);
    });
  });

  /* roadmap gợi ý từ dossier (chỉ cho pack đã nộp) */
  var roadmap = suggestedRoadmap();
  if (roadmap.length && !q) {
    var rm = el('div', { cls: 'roadmap' });
    rm.appendChild(el('h2', { text: 'Lộ trình gợi ý (theo dossier)' }));
    var ol = el('ol');
    roadmap.forEach(function (r) {
      ol.appendChild(el('li', null, [
        el('strong', { text: r.title }),
        ' — ' + r.why + ' ',
        el('span', { cls: 'rm-ids', text: r.ids.join(', ') })
      ]));
    });
    rm.appendChild(ol);
    body.appendChild(rm);
  }

  /* pending theo pack */
  ['frontend', 'cv', 'integration'].forEach(function (p) {
    var list = pendingByPack[p];
    if (!list.length || (pf && pf !== p)) return;
    var block = el('div', { cls: 'topic-block' });
    block.appendChild(el('h2', null, [
      'Đang triển khai — ' + PACK_LABEL[p] + ' ',
      el('span', { cls: 'count', text: list.length + ' ID canonical chờ pack' })
    ]));
    var cards = el('div', { cls: 'cards' });
    list.forEach(function (id) {
      var c = el('div', { cls: 'card pending' }, [
        el('span', { cls: 'cid', text: id }),
        el('h3', { text: 'Đang triển khai' }),
        el('p', { text: 'Bài học thuộc pack ' + (PACK_LABEL[p] || p) + ' — owner chưa nộp. ID đã đăng ký trong danh mục SPEC.' }),
        el('div', { cls: 'badges' }, [
          el('span', { cls: 'badge pack-' + p, text: p }),
          el('span', { cls: 'badge b-pending', text: 'chờ pack' })
        ])
      ]);
      cards.appendChild(c);
    });
    block.appendChild(cards);
    body.appendChild(block);
  });

  var note = el('div', { cls: 'src-note' });
  note.textContent = 'Hiển thị ' + shown + ' bài đã nộp / ' + total + ' ID canonical' +
    (q ? ' · lọc: "' + q + '"' : '');
  body.appendChild(note);
}

function lessonCard(l) {
  var badges = el('div', { cls: 'badges' }, [
    el('span', { cls: 'badge pack-' + l.pack, text: PACK_LABEL[l.pack] || l.pack })
  ]);
  var hasEdge = (l.scenarios || []).some(function (s) { return s.edgeCase === true; });
  if (hasEdge) badges.appendChild(el('span', { cls: 'badge b-edge', text: 'edge case' }));
  if ((l.simplifications || []).length) badges.appendChild(el('span', { cls: 'badge b-sim', text: 'mô phỏng' }));
  if ((l.aliases || []).length) badges.appendChild(el('span', { cls: 'badge', text: (l.aliases || []).length + ' alias' }));
  return el('a', { cls: 'card', href: '#/algo/' + l.id }, [
    el('span', { cls: 'cid', text: l.id }),
    el('h3', { text: l.title }),
    el('p', { text: l.summary || l.role || '' }),
    badges
  ]);
}

/* Lộ trình gợi ý — từ dossier §Y của pack integration (chỉ ID đã duyệt) */
function suggestedRoadmap() {
  var out = [];
  if (NS.packs.integration) {
    out.push(
      { title: 'Vạch cổng: giao cắt + hướng', ids: ['segment-intersection-orientation', 'directed-crossing-direction'], why: 'giao cắt vô hướng → chiều có hướng' },
      { title: 'Continuity & cứu entry', ids: ['observation-continuity-window', 'measured-path-entry-rescue'], why: 'hai lớp bảo chứng cho crossing tin cậy' },
      { title: 'Vòng đời session tại cổng', ids: ['entry-session-creation', 'exit-crossing-session-delete', 'session-state-machine'], why: 'entry→create, exit→delete trên nền FSM' },
      { title: 'Snapshot v2 producer', ids: ['snapshot-v2-build', 'camera-age-online-derivation'], why: 'build payload + derive camera health' },
      { title: 'Freshness & cursor hai consumer', ids: ['live-freshness-contract', 'source-mode-live-gating', 'frame-cursor-monotonic-poll'], why: 'cùng rule hai ngôn ngữ + polling order' },
      { title: 'QR issuance & waiting', ids: ['qr-token-issuance-ttl'], why: 'TTL/sort/pick + edge claim-quá-hạn' },
      { title: 'Concurrency & reservation', ids: ['revision-optimistic-concurrency', 'spot-reservation-availability'], why: 'chống double-booking' },
      { title: 'Persistence', ids: ['live-observation-cache', 'atomic-session-store'], why: 'cache nóng + atomic file' },
      { title: 'Episodes & legacy dwell', ids: ['parking-episode-apply', 'parked-evidence-dwell-legacy'], why: 'v2-authoritative vs v1-evidence' },
      { title: 'Identity remap hai phía', ids: ['identity-alias-remap-backend', 'canonical-runtime-id-consumer'], why: 'producer remap + consumer chain' },
      { title: 'Replay & prerequisites', ids: ['replay-timestamp-pairing', 'gate-config-validate-save'], why: 'chạy lại đúng như live' }
    );
  }
  return out;
}

/* ================= Trang thuật toán ================= */
var canvas = null, ctx = null, ro = null;

function renderAlgo(id) {
  var main = el('div');

  /* alias → canonical */
  var canon = NS.resolveAlias(id);
  if (canon) { goto('#/algo/' + canon); return main; }

  var lesson = NS.byId(id);
  if (!lesson) {
    var owner = NS.ownerOf(id);
    if (owner) {
      main.appendChild(el('div', { cls: 'notice' }, [
        '"' + id + '" thuộc pack ' + (PACK_LABEL[owner] || owner) +
        ' — pack chưa nộp, đang triển khai. ',
        el('a', { href: '#/' }, 'Về catalog')
      ]));
    } else {
      main.appendChild(el('div', { cls: 'notice' }, [
        'Không tìm thấy thuật toán "' + id + '". ',
        el('a', { href: '#/' }, 'Về catalog')
      ]));
    }
    return main;
  }

  /* ---- header ---- */
  var head = el('div', { cls: 'algo-head' });
  head.appendChild(el('div', { cls: 'crumbs' }, [
    el('a', { href: '#/' }, 'Catalog'), ' / ',
    el('span', { text: PACK_LABEL[lesson.pack] || lesson.pack }), ' / ',
    el('span', { text: lesson.topic || '' })
  ]));
  var h1 = el('h1', { text: lesson.title });
  head.appendChild(h1);
  var badges = el('div', { cls: 'badges' }, [
    el('span', { cls: 'badge pack-' + lesson.pack, text: PACK_LABEL[lesson.pack] || lesson.pack }),
    el('span', { cls: 'badge', text: lesson.id })
  ]);
  if ((lesson.simplifications || []).length)
    badges.appendChild(el('span', { cls: 'badge b-sim', text: 'có giản lược mô phỏng' }));
  (lesson.aliases || []).forEach(function (a) {
    badges.appendChild(el('span', { cls: 'badge', text: 'alias: ' + a }));
  });
  head.appendChild(badges);
  if (lesson.role) head.appendChild(el('p', { cls: 'role', text: lesson.role }));
  var refs = el('div', { cls: 'src-refs' });
  (lesson.codeRefs || []).forEach(function (r) {
    refs.appendChild(el('a', {
      href: '../' + r.path + '#L' + r.line,
      title: r.note || r.symbol || ''
    }, r.path + ':' + r.line + (r.endLine ? '-' + r.endLine : '')));
  });
  head.appendChild(refs);
  head.appendChild(el('div', { cls: 'src-note', text: 'Link mở file thô trong trình duyệt; fragment #L không bảo đảm nhảy dòng — số dòng là dẫn chứng.' }));
  main.appendChild(head);

  /* ---- scenario + params ---- */
  main.appendChild(buildScenBar(lesson));

  /* ---- stage: canvas + side ---- */
  var wrap = el('div', { cls: 'canvas-wrap' });
  canvas = el('canvas', { role: 'img', 'aria-label': 'Canvas mô phỏng ' + lesson.id });
  wrap.appendChild(canvas);
  var legend = el('div', { cls: 'legend', id: 'cv-legend' });
  wrap.appendChild(legend);
  ctx = canvas.getContext('2d');

  var pseudoPanel = el('section', { cls: 'panel' }, [
    el('div', { cls: 'p-title', text: 'Pseudocode' }),
    el('div', { cls: 'p-body' }, el('ol', { cls: 'pseudo', id: 'pseudo-list' }))
  ]);
  var inspPanel = el('section', { cls: 'panel inspector' }, [
    el('div', { cls: 'p-title', text: 'Inspector — state realtime' }),
    el('div', { cls: 'p-body', id: 'inspector' })
  ]);
  var metricPanel = el('section', { cls: 'panel' }, [
    el('div', { cls: 'p-title', text: 'Metrics' }),
    el('div', { cls: 'p-body' }, el('div', { cls: 'metrics', id: 'metrics' }))
  ]);
  var side = el('div', { cls: 'side-col' }, [pseudoPanel, inspPanel, metricPanel]);
  var stage = el('div', { cls: 'stage' }, [wrap, side]);
  main.appendChild(stage);

  /* ---- controls ---- */
  main.appendChild(buildControls());

  /* ---- explanation ---- */
  main.appendChild(el('div', { cls: 'explain', id: 'explain' }));

  /* ---- read-more ---- */
  main.appendChild(buildReadMore(lesson));

  /* ---- prev/next trong cùng topic ---- */
  main.appendChild(buildPrevNext(lesson));

  /* player khởi tạo SAU KHI main gắn vào DOM — renderFrame/renderPanels/controls
   * tra cứu getElementById nên không được chạy trên cây detached */
  App._pendingLesson = lesson;
  return main;
}

/* ================= Scenario & params ================= */
function defaultParams(lesson) {
  var p = {};
  (lesson.parameters || []).forEach(function (d) { p[d.key] = d.default; });
  /* scenario có thể pin defaultParams riêng (SPEC: reset params khi đổi scenario) */
  var sc = currentScenario(lesson);
  if (sc && sc.defaultParams) { for (var k in sc.defaultParams) p[k] = sc.defaultParams[k]; }
  return p;
}

function currentScenario(lesson) {
  var list = lesson.scenarios || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === App.scenarioId) return list[i];
  return list[0];
}

function buildScenBar(lesson) {
  var bar = el('div', { cls: 'scen-bar' });
  var sf = el('div', { cls: 'field' });
  sf.appendChild(el('label', { text: 'Kịch bản', 'for': 'scen-sel' }));
  var sel = el('select', { id: 'scen-sel' });
  (lesson.scenarios || []).forEach(function (s) {
    sel.appendChild(el('option', {
      value: s.id, text: (s.edgeCase ? '⚠ ' : '') + (s.title || s.id)
    }));
  });
  sel.value = App.scenarioId || (lesson.scenarios || [])[0].id;
  sel.addEventListener('change', function () {
    /* SPEC: đổi scenario → reset params về default + pause ở frame0 */
    App.scenarioId = sel.value;
    App.params = defaultParams(lesson);
    /* đồng bộ URL để share/refresh giữ đúng scenario (replaceState không fire hashchange) */
    if (history.replaceState) history.replaceState(null, '', '#/algo/' + lesson.id + '?scenario=' + sel.value);
    rebuildTrace(true);
    refreshScenDesc();
    rebuildParamFields();
  });
  sf.appendChild(sel);
  bar.appendChild(sf);
  bar.appendChild(el('div', { cls: 'scen-desc', id: 'scen-desc' }));

  var pg = el('div', { cls: 'param-group', id: 'param-group' });
  bar.appendChild(pg);
  return bar;
}

function refreshScenDesc() {
  var d = document.getElementById('scen-desc');
  if (!d || !App.lesson) return;
  var sc = currentScenario(App.lesson);
  d.textContent = (sc && sc.description) || '';
}

function rebuildParamFields() {
  var pg = document.getElementById('param-group');
  if (!pg || !App.lesson) return;
  pg.textContent = '';
  (App.lesson.parameters || []).forEach(function (d) {
    var f = el('div', { cls: 'field' });
    f.appendChild(el('label', { text: d.label || d.key }));
    var inp;
    if (d.type === 'boolean') {
      inp = el('input', { type: 'checkbox' });
      inp.checked = !!App.params[d.key];
      inp.addEventListener('change', function () { onParam(d.key, inp.checked); });
    } else if (d.type === 'select') {
      inp = el('select');
      (d.options || []).forEach(function (o) {
        var ov = (o && typeof o === 'object') ? o.value : o;
        var ot = (o && typeof o === 'object') ? (o.label || o.value) : o;
        inp.appendChild(el('option', { value: ov, text: ot }));
      });
      inp.value = App.params[d.key];
      inp.addEventListener('change', function () { onParam(d.key, inp.value); });
    } else {
      inp = el('input', { type: 'number', step: d.step != null ? d.step : 1 });
      if (d.min != null) inp.min = d.min;
      if (d.max != null) inp.max = d.max;
      inp.value = App.params[d.key];
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        if (Number.isFinite(v)) onParam(d.key, v);
      });
    }
    f.appendChild(inp);
    pg.appendChild(f);
  });
}

function onParam(key, value) {
  App.params[key] = value;
  rebuildTrace(true); /* pause + frame0 theo SPEC */
}

/* ================= Player ================= */
function initPlayer(lesson) {
  App.lesson = lesson;
  if (!App.scenarioId || !(lesson.scenarios || []).some(function (s) { return s.id === App.scenarioId; })) {
    App.scenarioId = (lesson.scenarios || [])[0].id;
  }
  App.params = defaultParams(lesson);
  App.playing = false; App.speed = 1; App.progress = 1; App.frameIdx = 0;
  rebuildParamFields();
  refreshScenDesc();
  rebuildTrace(false);
}

function rebuildTrace(toFrame0) {
  pause();
  var err = null, trace = null;
  try {
    trace = App.lesson.buildTrace(App.scenarioId, Object.assign({}, App.params));
  } catch (e) { err = e; }
  if (err || !trace || !Array.isArray(trace.frames) || !trace.frames.length) {
    App.trace = { frames: [], result: null, expected: null, checks: [], _error: err ? String(err && err.message || err) : 'trace rỗng' };
  } else {
    App.trace = trace;
  }
  if (toFrame0 !== false) App.frameIdx = 0;
  App.progress = 1;
  validateTrace();
  renderFrame();
  renderPanels();
}

function validateTrace() {
  var box = document.getElementById('trace-errors');
  var t = App.trace, lesson = App.lesson;
  var msgs = [];
  if (t._error) msgs.push(t._error);
  var lineIds = {};
  (lesson.pseudocode || []).forEach(function (l) { lineIds[l.id] = true; });
  (t.frames || []).forEach(function (f, i) {
    if (!f.id) msgs.push('frame ' + i + ' thiếu id');
    if (!Array.isArray(f.activeLines) || !f.activeLines.length) msgs.push('frame "' + (f.id || i) + '" activeLines rỗng');
    (f.activeLines || []).forEach(function (a) {
      if (!lineIds[a]) msgs.push('frame "' + (f.id || i) + '" activeLine "' + a + '" không thuộc pseudocode');
    });
    if (!f.explanation) msgs.push('frame "' + (f.id || i) + '" thiếu explanation');
  });
  if (!box) {
    box = el('div', { cls: 'error-box', id: 'trace-errors' });
    var ex = document.getElementById('explain');
    if (ex && ex.parentNode) ex.parentNode.insertBefore(box, ex);
  }
  box.textContent = '';
  if (!msgs.length) { box.style.display = 'none'; return; }
  box.style.display = '';
  box.appendChild(el('strong', { text: 'Trace hợp đồng vi phạm:' }));
  var ul = el('ul');
  msgs.slice(0, 8).forEach(function (m) { ul.appendChild(el('li', { text: m })); });
  box.appendChild(ul);
}

function frames() { return (App.trace && App.trace.frames) || []; }
function curFrame() { return frames()[App.frameIdx] || null; }
function frameDuration(f) { return (f && f.durationMs) || 900; }

function play() {
  if (!frames().length || App.playing) return;
  App.playing = true; App._lastTs = 0; App._carry = 0;
  syncPlayBtn();
  App._raf = requestAnimationFrame(tick);
}
function pause() {
  App.playing = false;
  if (App._raf) { cancelAnimationFrame(App._raf); App._raf = 0; }
  App.progress = 1;
  syncPlayBtn();
}
function stopPlayback() {
  App.playing = false;
  if (App._raf) { cancelAnimationFrame(App._raf); App._raf = 0; }
}
function togglePlay() { App.playing ? pause() : play(); }

function tick(ts) {
  if (!App.playing) return;
  if (!App._lastTs) { App._lastTs = ts; App._raf = requestAnimationFrame(tick); return; }
  var dt = ts - App._lastTs; App._lastTs = ts;
  var f = curFrame();
  if (!f) { pause(); return; }
  var dur = Math.max(60, frameDuration(f) / App.speed);
  App._carry += dt;
  if (App.reduced) {
    /* reduced-motion: nhảy thẳng qua frame, không nội suy */
    App.progress = 1;
  } else {
    App.progress = Math.min(1, App._carry / dur);
  }
  if (App._carry >= dur) {
    if (App.frameIdx < frames().length - 1) {
      App.frameIdx++; App._carry = 0; App.progress = 0;
      if (App.reduced) App.progress = 1;
    } else {
      App.progress = 1; pause(); /* hết trace tự pause */
      renderFrame(); renderPanels(); return;
    }
  }
  renderFrame();
  renderPanels(true);
  App._raf = requestAnimationFrame(tick);
}

function setFrame(i) {
  var n = frames().length;
  if (!n) return;
  App.frameIdx = Math.max(0, Math.min(n - 1, i));
  App.progress = 1;
  renderFrame(); renderPanels();
}
function nextFrame() { setFrame(App.frameIdx + 1); }
function prevFrame() { setFrame(App.frameIdx - 1); }

function renderFrame() {
  var f = curFrame();
  if (!canvas || !ctx || !f || !App.lesson) {
    if (ctx && canvas) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    return;
  }
  var wrap = canvas.parentElement;
  var cssW = Math.max(280, wrap.clientWidth);
  var cssH = cssW < 520
    ? Math.max(300, Math.min(640, Math.round(cssW * 0.8)))
    : Math.max(240, Math.min(560, Math.round(cssW * 0.58)));
  var dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = NS.getPalette().background;
  ctx.fillRect(0, 0, cssW, cssH);
  var prev = App.frameIdx > 0 ? frames()[App.frameIdx - 1] : null;
  try {
    App.lesson.draw(ctx, f, {
      width: cssW, height: cssH,
      progress: App.reduced ? 1 : App.progress,
      previousFrame: prev,
      palette: NS.getPalette(),
      reducedMotion: App.reduced
    });
  } catch (e) {
    ctx.fillStyle = NS.getPalette().danger;
    ctx.font = '13px sans-serif';
    ctx.fillText('draw() lỗi: ' + (e && e.message || e), 12, 24);
  }
}

function renderPanels(light) {
  var f = curFrame(), lesson = App.lesson;
  if (!lesson) return;
  /* pseudocode */
  var pl = document.getElementById('pseudo-list');
  if (pl && !light) {
    pl.textContent = '';
    var active = {};
    (f ? f.activeLines : []).forEach(function (a) { active[a] = true; });
    (lesson.pseudocode || []).forEach(function (l, i) {
      pl.appendChild(el('li', { cls: active[l.id] ? 'active' : '' }, [
        el('span', { cls: 'ln', text: l.id }),
        l.text
      ]));
    });
  } else if (pl) {
    /* cập nhật nhẹ: chỉ đổi active */
    var active2 = {};
    (f ? f.activeLines : []).forEach(function (a) { active2[a] = true; });
    Array.prototype.forEach.call(pl.children, function (li, i) {
      var lid = (lesson.pseudocode || [])[i] && lesson.pseudocode[i].id;
      li.classList.toggle('active', !!active2[lid]);
    });
  }
  /* inspector */
  var ins = document.getElementById('inspector');
  if (ins) {
    ins.textContent = '';
    ins.appendChild(renderJSON(f ? f.state : null, 0));
  }
  /* metrics */
  var mt = document.getElementById('metrics');
  if (mt) {
    mt.textContent = '';
    ((f && f.metrics) || []).forEach(function (m) {
      mt.appendChild(el('span', { cls: 'metric' }, [
        el('span', { cls: 'm-label', text: m.label }),
        el('span', { cls: 'm-val', text: fmtNum(m.value) }),
        m.unit ? el('span', { cls: 'm-unit', text: ' ' + m.unit }) : null
      ]));
    });
  }
  /* explanation */
  var ex = document.getElementById('explain');
  if (ex) {
    ex.textContent = '';
    if (f) {
      ex.appendChild(el('span', { cls: 'frame-id', text: 'bước ' + (App.frameIdx + 1) + '/' + frames().length + ' · ' + f.id }));
      ex.appendChild(document.createTextNode(f.explanation || ''));
    }
  }
  /* controls */
  syncControls();
  /* checks (mỗi render cho rẻ — panel tĩnh dưới) */
  var ck = document.getElementById('checks-body');
  if (ck && App.trace) {
    ck.textContent = '';
    renderChecksInto(ck);
  }
}

function renderJSON(v, depth) {
  var box = el('div', { cls: 'jv' });
  buildJSON(box, v, depth || 0);
  return box;
}
function buildJSON(parent, v, depth) {
  if (depth > 4) { parent.appendChild(el('span', { cls: 'v-more', text: '…' })); return; }
  if (v === null || v === undefined) { parent.appendChild(el('span', { cls: 'v-null', text: String(v) })); return; }
  if (typeof v === 'number') { parent.appendChild(el('span', { cls: 'v-num', text: fmtNum(v) })); return; }
  if (typeof v === 'boolean') { parent.appendChild(el('span', { cls: 'v-bool', text: String(v) })); return; }
  if (typeof v !== 'object') { parent.appendChild(el('span', { cls: 'v-str', text: JSON.stringify(v) })); return; }
  var keys = Array.isArray(v) ? v.map(function (_, i) { return i; }) : Object.keys(v);
  var open = Array.isArray(v) ? '[' : '{', close = Array.isArray(v) ? ']' : '}';
  parent.appendChild(el('span', { cls: 'v-null', text: open + (keys.length ? '' : close) }));
  var cap = Math.min(keys.length, 40);
  for (var i = 0; i < cap; i++) {
    var row = el('div', { cls: 'jv' });
    row.appendChild(el('span', { cls: 'k', text: Array.isArray(v) ? String(keys[i]) : JSON.stringify(String(keys[i])) }));
    row.appendChild(document.createTextNode(': '));
    buildJSON(row, v[keys[i]], depth + 1);
    parent.appendChild(row);
  }
  if (keys.length > cap) parent.appendChild(el('div', { cls: 'v-more', text: '… +' + (keys.length - cap) + ' mục' }));
  if (keys.length) parent.appendChild(el('span', { cls: 'v-null', text: close }));
}

function syncPlayBtn() {
  var b = document.getElementById('btn-play');
  if (b) {
    b.textContent = App.playing ? '⏸' : '▶';
    b.classList.toggle('paused', !App.playing);
    b.classList.toggle('play', true);
    b.setAttribute('aria-pressed', App.playing ? 'true' : 'false');
    b.setAttribute('aria-label', App.playing ? 'Tạm dừng' : 'Phát');
  }
}
function syncControls() {
  var n = frames().length, i = App.frameIdx;
  var btns = { 'btn-first': i <= 0, 'btn-prev': i <= 0, 'btn-next': i >= n - 1 };
  for (var id in btns) {
    var b = document.getElementById(id);
    if (b) b.disabled = btns[id];
  }
  var s = document.getElementById('step-slider');
  if (s) { s.max = Math.max(0, n - 1); s.value = i; }
  var c = document.getElementById('step-counter');
  if (c) c.textContent = (i + 1) + ' / ' + n;
  var sp = document.getElementById('speed-sel');
  if (sp) sp.value = String(App.speed);
}

function buildControls() {
  var c = el('div', { cls: 'controls' });
  function btn(id, txt, title, fn) {
    return el('button', { cls: 'ctrl-btn', id: id, title: title, 'aria-label': title, onclick: fn }, txt);
  }
  c.appendChild(btn('btn-first', '⏮', 'Về đầu (Home)', function () { pause(); setFrame(0); }));
  c.appendChild(btn('btn-prev', '◀', 'Bước trước (←)', function () { pause(); prevFrame(); }));
  var play = el('button', { cls: 'ctrl-btn play', id: 'btn-play', title: 'Phát / tạm dừng (Space)', 'aria-pressed': 'false', onclick: togglePlay }, '▶');
  c.appendChild(play);
  c.appendChild(btn('btn-next', '▶|', 'Bước sau (→)', function () { pause(); nextFrame(); }));
  var sp = el('select', { cls: 'speed', id: 'speed-sel', 'aria-label': 'Tốc độ phát' });
  SPEEDS.forEach(function (s) { sp.appendChild(el('option', { value: s, text: s + '×' })); });
  sp.value = '1';
  sp.addEventListener('change', function () { App.speed = parseFloat(sp.value) || 1; });
  c.appendChild(sp);
  var sl = el('input', { type: 'range', id: 'step-slider', min: 0, max: 0, value: 0, 'aria-label': 'Bước mô phỏng' });
  sl.addEventListener('input', function () { pause(); setFrame(parseInt(sl.value, 10)); });
  c.appendChild(sl);
  c.appendChild(el('span', { cls: 'step-counter', id: 'step-counter', text: '—' }));
  return c;
}

/* ================= Read-more ================= */
function typeTable(title, rows) {
  var p = el('section', { cls: 'panel' }, el('div', { cls: 'p-title', text: title }));
  var t = el('table', { cls: 'table-mini' });
  var tr = el('tr');
  ['tên', 'kiểu', 'mô tả'].forEach(function (h) { tr.appendChild(el('th', { text: h })); });
  t.appendChild(tr);
  (rows || []).forEach(function (r) {
    var td = el('tr');
    td.appendChild(el('td', { text: r.name }));
    td.appendChild(el('td', null, el('span', { cls: 'kv', text: r.type })));
    td.appendChild(el('td', { text: r.description || '' }));
    t.appendChild(td);
  });
  var b = el('div', { cls: 'p-body' }); b.appendChild(t); p.appendChild(b);
  return p;
}

function renderChecksInto(body) {
  var t = App.trace;
  if (!t) return;
  var checks = t.checks || [];
  if (!checks.length) {
    body.appendChild(el('div', { cls: 'src-note', text: 'Không có check.' }));
    return;
  }
  checks.forEach(function (c) {
    var pass = c.pass === true;
    body.appendChild(el('div', { cls: 'check-row' }, [
      el('span', { cls: pass ? 'ok' : 'ko', text: pass ? '✓' : '✗' }),
      el('span', { text: c.label }),
      el('span', { cls: 'vals', text: 'thực=' + jsonShort(c.actual, 60) + ' · kỳ vọng=' + jsonShort(c.expected, 60) })
    ]));
  });
  /* result vs expected raw (rút gọn) */
  body.appendChild(el('div', { cls: 'src-note', text: 'result: ' + jsonShort(t.result, 180) }));
  body.appendChild(el('div', { cls: 'src-note', text: 'expected: ' + jsonShort(t.expected, 180) }));
}

function buildReadMore(lesson) {
  var g = el('div', { cls: 'grid-2' });

  g.appendChild(typeTable('Input', lesson.inputTypes));
  g.appendChild(typeTable('Output', lesson.outputTypes));

  var st = el('section', { cls: 'panel' }, el('div', { cls: 'p-title', text: 'Cấu trúc dữ liệu' }));
  var ul = el('ul', { cls: 'sec-list' });
  (lesson.structures || []).forEach(function (s) {
    ul.appendChild(el('li', null, [
      el('span', { cls: 'kv' }, [
        el('span', { cls: 'k', text: s.name }), ' — ' + s.type
      ]),
      ' ' + (s.description || '')
    ]));
  });
  var b1 = el('div', { cls: 'p-body' }); b1.appendChild(ul); st.appendChild(b1);
  g.appendChild(st);

  var cx = lesson.complexity || {};
  var cp = el('section', { cls: 'panel' }, el('div', { cls: 'p-title', text: 'Độ phức tạp' }));
  var b2 = el('div', { cls: 'p-body' });
  [['Thời gian (code)', cx.time], ['Bộ nhớ (code)', cx.space],
   ['Biến', cx.variables], ['Mô phỏng', cx.simulation]].forEach(function (kv) {
    b2.appendChild(el('div', { cls: 'check-row' }, [
      el('span', { text: kv[0] }), el('span', { cls: 'vals', text: kv[1] || '—' })
    ]));
  });
  cp.appendChild(b2); g.appendChild(cp);

  var ec = el('section', { cls: 'panel' }, el('div', { cls: 'p-title', text: 'Edge cases & failure modes' }));
  var ul2 = el('ul', { cls: 'sec-list' });
  (lesson.edgeCases || []).forEach(function (s) {
    ul2.appendChild(el('li', null, [el('strong', { text: s.title }), ' — ' + s.description]));
  });
  var b3 = el('div', { cls: 'p-body' }); b3.appendChild(ul2); ec.appendChild(b3);
  g.appendChild(ec);

  if ((lesson.simplifications || []).length) {
    var sm = el('section', { cls: 'panel' }, el('div', { cls: 'p-title', text: 'Giản lược mô phỏng vs code' }));
    var ul3 = el('ul', { cls: 'sec-list' });
    lesson.simplifications.forEach(function (s) {
      ul3.appendChild(el('li', null, [
        el('strong', { text: 'Code: ' }), s.sourceBehavior, document.createElement('br'),
        el('strong', { text: 'Demo: ' }), s.demoBehavior, document.createElement('br'),
        el('em', { text: s.reason || '' })
      ]));
    });
    var b4 = el('div', { cls: 'p-body' }); b4.appendChild(ul3); sm.appendChild(b4);
    g.appendChild(sm);
  }

  var ch = el('section', { cls: 'panel' }, [
    el('div', { cls: 'p-title', text: 'Kết quả vs expected — checks thật' })
  ]);
  var cb = el('div', { cls: 'p-body', id: 'checks-body' });
  ch.appendChild(cb);
  g.appendChild(ch);

  var rl = el('section', { cls: 'panel' }, el('div', { cls: 'p-title', text: 'Bài liên quan' }));
  var links = el('div', { cls: 'rel-links' });
  (lesson.related || []).forEach(function (id) {
    links.appendChild(el('a', { href: '#/algo/' + id }, id));
  });
  if (!(lesson.related || []).length) links.appendChild(el('span', { cls: 'src-note', text: '—' }));
  var b5 = el('div', { cls: 'p-body' }); b5.appendChild(links); rl.appendChild(b5);
  g.appendChild(rl);

  return g;
}

function buildPrevNext(lesson) {
  var pack = NS.packs[lesson.pack];
  var idx = -1;
  if (pack) for (var i = 0; i < pack.lessons.length; i++) if (pack.lessons[i].id === lesson.id) idx = i;
  var prev = idx > 0 ? pack.lessons[idx - 1] : null;
  var next = idx >= 0 && idx < pack.lessons.length - 1 ? pack.lessons[idx + 1] : null;
  var nav = el('div', { cls: 'prev-next' });
  nav.appendChild(prev ? el('a', { href: '#/algo/' + prev.id }, [
    el('span', { cls: 'dir', text: '← Trước' }), prev.title
  ]) : el('span'));
  nav.appendChild(next ? el('a', { cls: 'next', href: '#/algo/' + next.id }, [
    el('span', { cls: 'dir', text: 'Sau →' }), next.title
  ]) : el('span'));
  return nav;
}

/* ================= Keyboard ================= */
document.addEventListener('keydown', function (e) {
  if (App.route.page !== 'algo') return;
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); pause(); prevFrame(); break;
    case 'ArrowRight': e.preventDefault(); pause(); nextFrame(); break;
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'Home': e.preventDefault(); pause(); setFrame(0); break;
    case 'End': e.preventDefault(); pause(); setFrame(frames().length - 1); break;
  }
});

/* ================= Resize ================= */
if (window.ResizeObserver) {
  ro = new ResizeObserver(function () { renderFrame(); });
}
document.addEventListener('DOMContentLoaded', function () {
  var w = document.querySelector('.canvas-wrap');
  if (w && ro) ro.observe(w);
});
/* canvas-wrap tạo sau DOMContentLoaded → observe khi render */
function observeCanvas() {
  var w = document.querySelector('.canvas-wrap');
  if (w && ro && !w._obs) { ro.observe(w); w._obs = true; }
}

/* ================= Render root ================= */
function render() {
  stopPlayback();
  var route = parseHash();
  App.route = route;
  ROOT.textContent = '';
  var top = renderTopbar(route);
  var shell = el('div', { cls: 'shell' });
  shell.appendChild(renderSidebar());
  var main = el('div', { cls: 'main' });
  if (route.page === 'catalog') {
    main.appendChild(renderCatalog());
  } else if (route.page === 'algo') {
    App.lesson = null; App.trace = null; canvas = null; ctx = null;
    if (route.scenario) App.scenarioId = route.scenario;
    main.appendChild(renderAlgo(route.id));
  } else {
    main.appendChild(el('div', { cls: 'notice' }, [
      'Đường dẫn không hợp lệ. ', el('a', { href: '#/' }, 'Về catalog')
    ]));
  }
  shell.appendChild(main);
  ROOT.appendChild(top);
  ROOT.appendChild(shell);
  if (App._pendingLesson) {
    var pl2 = App._pendingLesson;
    App._pendingLesson = null;
    initPlayer(pl2);
  }
  syncSidebarOpen();
  observeCanvas();
  window.scrollTo(0, 0);
}

/* expose tối thiểu cho QA/test */
window.TechGarApp = {
  version: NS.version,
  app: App,
  render: render,
  frames: frames,
  currentFrame: curFrame
};

render();
})();
