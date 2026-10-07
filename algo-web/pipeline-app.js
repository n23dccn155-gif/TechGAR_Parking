/* TechGar2 pipeline V2 — app shell (builder C).
 * Bản đồ 12 node: 2 view (thứ tự runtime / hành trình 1 xe) dùng chung vị
 * trí node; global timeline + token xe/GID; hash routing #/map #/journey
 * #/node/<id>/<scenario>; báo thiếu pack, không claim hoàn tất khi <12.
 */
(function () {
  'use strict';
  var TGP = window.TechGarPipelineEngine;
  var esc = TGP.esc;
  var app = document.getElementById('app');

  /* ---------- layout: vị trí node dùng chung 2 view (viewBox 1400x660) ---------- */
  var W = 110, H = 58;
  /* Main loop = 1 hàng ngang theo call order; worker chỉ slot-vision;
     binder chạy trong loop (update_tracks/finalize) — dossier §1. */
  var POS = {
    'capture':      { x: 80,   y: 170 },
    'kalman':       { x: 205,  y: 170 },
    'motion':       { x: 330,  y: 170 },
    'roi':          { x: 455,  y: 170 },
    'assignment':   { x: 580,  y: 170 },
    'coasting':     { x: 705,  y: 170 },
    'handoff':      { x: 830,  y: 170 },
    'binder':       { x: 955,  y: 170 },
    'snapshot':     { x: 1080, y: 170 },
    'slot-vision':  { x: 455,  y: 478 },
    'gate-session': { x: 1298, y: 118 },
    'navigation':   { x: 1298, y: 262 }
  };
  var MAP_LABEL = {
    'capture':      ['Cam & đồng bộ', '2 cam · latest-only'],
    'kalman':       ['Kalman', 'predict → correct'],
    'motion':       ['Motion → blob', 'MOG2 + temporal'],
    'roi':          ['ROI', 'vùng quan sát'],
    'assignment':   ['Assignment', 'LAPJV 1-1'],
    'coasting':     ['Coasting', 'mất dấu tạm'],
    'handoff':      ['Handoff / GID', 'ReID histogram'],
    'slot-vision':  ['Slot vision', 'vote TRỐNG ≥12/25'],
    'binder':       ['Binder', 'track→ô · episode'],
    'snapshot':     ['Snapshot & API', 'schema v2 · ~5Hz'],
    'gate-session': ['Gate & session', 'vạch cổng · QR 120s'],
    'navigation':   ['Điều hướng', 'A* · off-route 80px']
  };
  var GROUP_BOXES = [
    { x: 148, y: 118, w: 654, h: 106, label: 'THEO DÕI 1 CAMERA (×2 cam)', nodes: ['kalman','motion','roi','assignment','coasting'] },
    { x: 330, y: 424, w: 250, h: 108, label: 'PARKING VISION WORKER ~2Hz — nhánh song song', nodes: ['slot-vision'] },
    { x: 1236, y: 60, w: 126, h: 258, label: 'CONSUMER ASYNC', nodes: ['gate-session','navigation'] }
  ];
  /* kind: order | worker | async | feedback */
  var EDGES = [
    { f: 'capture', t: 'kalman', k: 'order' },
    { f: 'kalman', t: 'motion', k: 'order' },
    { f: 'motion', t: 'roi', k: 'order' },
    { f: 'roi', t: 'assignment', k: 'order' },
    { f: 'assignment', t: 'coasting', k: 'order' },
    { f: 'coasting', t: 'handoff', k: 'order' },
    { f: 'handoff', t: 'binder', k: 'order', label: 'tracks + GID' },
    { f: 'binder', t: 'snapshot', k: 'order', label: 'episodes' },
    { f: 'capture', t: 'slot-vision', k: 'worker', label: 'frame gốc ~2Hz' },
    { f: 'slot-vision', t: 'binder', k: 'worker', label: 'evidence → áp đầu vòng sau', via: [[720, 478], [905, 210]] },
    { f: 'snapshot', t: 'gate-session', k: 'async', label: 'poll 0.25s' },
    { f: 'snapshot', t: 'navigation', k: 'async', label: 'poll 200ms', via: [[1190, 262]] },
    { f: 'binder', t: 'motion', k: 'feedback', label: 'reservations → tracker', via: [[955, 118], [640, 66], [330, 118]] },
    { f: 'binder', t: 'handoff', k: 'feedback', label: 'reservations → manager', via: [[955, 138], [892, 94], [830, 138]] }
  ];

  /* ---------- beats ---------- */
  /* runtime: theo call order đã cross-review (C §1) */
  var RT_BEATS = [
    { n: ['capture'],      label: 'Đọc frame mới nhất từ 2 cam + đồng bộ skew' },
    { n: ['slot-vision', 'binder'], label: 'Áp parking evidence của worker vào đầu vòng — trước identity' },
    { n: ['kalman'],       label: 'Kalman predict mọi track' },
    { n: ['motion'],       label: 'MOG2 foreground + temporal motion gate' },
    { n: ['roi'],          label: 'ROI context + morphology → detections' },
    { n: ['assignment'],   label: 'LAPJV ghép detection↔track; matched → correct' },
    { n: ['coasting'],     label: 'Unmatched → coast/freeze/TTL; det lẻ → track mới' },
    { n: ['handoff'],      label: 'update_all_tracks → handoff/ReID → GID + remap' },
    { n: ['binder'],       label: 'update_tracks + finalize → owner/episode; feedback reservations' },
    { n: ['snapshot'],     label: 'build schema v2 → publish latest-only ~5Hz' },
    { n: ['gate-session'], label: 'Gate poll 0.25s → session/QR/exit (async)' },
    { n: ['navigation'],   label: 'Frontend poll 200ms → map/route (async)' }
  ];
  /* journey: timeline nghiệp vụ 1 xe (SPEC §2.2) */
  var J_BEATS = [
    { n: ['capture'],                          label: 'Xe đi vào vùng phủ cam1' },
    { n: ['kalman', 'motion', 'roi', 'assignment'], label: 'cam1: blob → track local T3' },
    { n: ['handoff'],                          label: 'Cấp Global ID G#5' },
    { n: ['gate-session'],                     label: 'Cắt vạch ENTRY → session + QR 120s (CHƯA đỗ)' },
    { n: ['navigation'],                       label: 'Claim → chọn ô A05 → A* dẫn đường' },
    { n: ['handoff'],                          label: 'Sang cam2 — ReID giữ G#5' },
    { n: ['coasting'],                         label: 'Xe dừng — track local LOST/coast' },
    { n: ['slot-vision'],                      label: 'Ô A05: empty_votes <12 → occupied' },
    { n: ['binder'],                           label: 'Arrival claim → episode parked A05:G5' },
    { n: ['snapshot'],                         label: 'Snapshot schema2 → consumers' },
    { n: ['gate-session'],                     label: 'Session → PARKED' },
    { n: ['navigation', 'gate-session'],       label: 'Rời ô → cắt EXIT → đóng session' }
  ];
  var BEAT_MS = 2600;

  /* ---------- state ---------- */
  var view = 'map';            /* map | journey */
  var player = null;           /* global timeline player */
  var detail = null;           /* mounted detail handle */
  var lastBeat = 0;
  var currentNodeId = null;
  var currentScen = null;

  function beats() { return view === 'journey' ? J_BEATS : RT_BEATS; }
  function beatPos(b) { return POS[b.n[0]]; }

  /* ---------- chrome ---------- */

  function packChipHtml() {
    var st = TGP.packStatus();
    var nodes = TGP.allNodes().length;
    var s = st.map(function (p) {
      return p.loaded
        ? '<span class="ok">' + p.key + ' ✓' + p.count + '</span>'
        : '<span class="warn">' + p.key + ' ⏳ (builder ' + p.owner + ')</span>';
    }).join(' · ');
    return s + ' — <b>' + nodes + '/12 node</b>';
  }

  function renderChrome() {
    app.innerHTML =
      '<div class="tgp-header">' +
      '  <h1>TechGar2 — Bản đồ pipeline</h1>' +
      '  <span class="sub">mô phỏng giáo dục · dữ liệu minh họa</span>' +
      '  <div class="tgp-tabs" role="tablist">' +
      '    <button id="tab-map" role="tab">Thứ tự runtime</button>' +
      '    <button id="tab-journey" role="tab">Hành trình 1 xe</button>' +
      '  </div>' +
      '  <span class="pack-status" id="pack-status"></span>' +
      '</div>' +
      '<div class="transport" id="transport">' +
      '  <button class="tbtn primary" id="g-play" aria-label="Phát hoặc tạm dừng">▶</button>' +
      '  <button class="tbtn" id="g-prev" aria-label="Bước trước">‹</button>' +
      '  <button class="tbtn" id="g-next" aria-label="Bước sau">›</button>' +
      '  <button class="tbtn" id="g-reset" aria-label="Về đầu">⟲</button>' +
      '  <select id="g-speed" aria-label="Tốc độ">' +
      '    <option value="0.5">0.5×</option><option value="1" selected>1×</option>' +
      '    <option value="2">2×</option><option value="4">4×</option>' +
      '  </select>' +
      '  <div class="scrub-wrap"><input type="range" id="g-scrub" min="0" max="1000" value="0" aria-label="Scrub timeline">' +
      '  <span class="step-label" id="g-step"></span></div>' +
      '</div>' +
      '<div id="stage"></div>';

    document.getElementById('tab-map').onclick = function () { location.hash = '#/map'; };
    document.getElementById('tab-journey').onclick = function () { location.hash = '#/journey'; };
    document.getElementById('g-play').onclick = function () { player && player.toggle(); };
    document.getElementById('g-prev').onclick = function () { player && player.prev(); };
    document.getElementById('g-next').onclick = function () { player && player.next(); };
    document.getElementById('g-reset').onclick = function () { player && player.reset(); };
    document.getElementById('g-speed').onchange = function (e) { player && player.setSpeed(parseFloat(e.target.value)); };
    document.getElementById('g-scrub').oninput = function (e) { player && player.seek(parseInt(e.target.value, 10) / 1000); };
  }

  /* ---------- map svg ---------- */

  /* cắt đầu/cuối cạnh tại mép card để mũi tên hiển thị (không chui vào card) */
  function clipEnds(pts) {
    function clipOut(p, q) {          /* điểm ra khỏi card tâm p theo hướng q */
      var dx = q[0] - p[0], dy = q[1] - p[1];
      var sx = dx === 0 ? 1e9 : (W / 2 + 2) / Math.abs(dx);
      var sy = dy === 0 ? 1e9 : (H / 2 + 2) / Math.abs(dy);
      var s = Math.min(sx, sy, 1);
      return [p[0] + dx * s, p[1] + dy * s];
    }
    if (pts.length < 2) return pts;
    var out = pts.slice();
    out[0] = clipOut(pts[0], pts[1]);
    var n = pts.length;
    out[n - 1] = clipOut(pts[n - 1], pts[n - 2]);
    return out;
  }
  function edgePath(e) {
    var a = POS[e.f], b = POS[e.t];
    var pts = clipEnds([[a.x, a.y]].concat(e.via || []).concat([[b.x, b.y]]));
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 1; i < pts.length; i++) d += ' L' + pts[i][0] + ',' + pts[i][1];
    return d;
  }
  /* điểm t trên polyline cạnh (đã clip) */
  function edgePoint(e, t) {
    var a = POS[e.f], b = POS[e.t];
    var pts = clipEnds([[a.x, a.y]].concat(e.via || []).concat([[b.x, b.y]]));
    var segs = [], total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      segs.push(L); total += L;
    }
    var d = t * total;
    for (var j = 0; j < segs.length; j++) {
      if (d <= segs[j] || j === segs.length - 1) {
        var u = segs[j] ? d / segs[j] : 0;
        return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u,
                pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u];
      }
      d -= segs[j];
    }
    return [b.x, b.y];
  }
  function findIncomingEdge(nodeId, preferFrom) {
    var cands = EDGES.filter(function (e) { return e.t === nodeId && e.k !== 'feedback'; });
    if (!cands.length) return null;
    var hit = cands.filter(function (e) { return e.f === preferFrom; })[0];
    return hit || cands[0];
  }

  function journeyOrderBadge(id) {
    var nums = [];
    J_BEATS.forEach(function (b, i) { if (b.n.indexOf(id) >= 0) nums.push(i + 1); });
    return nums;
  }

  function buildMapSvg() {
    var map = TGP.nodeMap();
    var missing = {};
    TGP.missingNodeIds().forEach(function (id) { missing[id] = true; });
    var s = '<svg viewBox="0 0 1400 660" role="group" aria-label="Bản đồ pipeline">';
    s += '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#5b7dd6"/></marker>' +
      '<marker id="ahw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#57c78a"/></marker>' +
      '<marker id="aha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#c9a24d"/></marker>' +
      '<marker id="ahf" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#d66a8a"/></marker>' +
      '<marker id="ahj" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#b78bff"/></marker></defs>';

    GROUP_BOXES.forEach(function (g) {
      s += '<rect class="group-box" x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="' + g.h + '" rx="14"/>' +
        '<text class="group-label" x="' + (g.x + 14) + '" y="' + (g.y + 18) + '">' + esc(g.label) + '</text>';
    });

    if (view === 'map') {
      EDGES.forEach(function (e, i) {
        var mk = e.k === 'worker' ? 'ahw' : e.k === 'async' ? 'aha' : e.k === 'feedback' ? 'ahf' : 'ah';
        s += '<path id="edge-' + i + '" class="edge ' + e.k + '" d="' + edgePath(e) + '" marker-end="url(#' + mk + ')"/>';
        if (e.label) {
          var mid = edgePoint(e, 0.55);
          s += '<text class="edge-label" x="' + mid[0] + '" y="' + (mid[1] - 8) + '" text-anchor="middle">' + esc(e.label) + '</text>';
        }
      });
    } else {
      /* journey polyline — clip từng đoạn tại mép card */
      var jp = '';
      for (var i = 0; i < J_BEATS.length - 1; i++) {
        var ja = beatPos(J_BEATS[i]), jb = beatPos(J_BEATS[i + 1]);
        var seg = clipEnds([[ja.x, ja.y], [jb.x, jb.y]]);
        jp += (i === 0 ? 'M' : ' M') + seg[0][0] + ',' + seg[0][1] + ' L' + seg[1][0] + ',' + seg[1][1];
      }
      s += '<path class="edge" style="stroke:#b78bff;stroke-dasharray:10 7;stroke-width:2.6" d="' + jp + '" marker-end="url(#ahj)"/>';
    }

    /* node cards */
    TGP.NODE_ORDER.forEach(function (id, idx) {
      var p = POS[id]; if (!p) return;
      var lab = MAP_LABEL[id] || [id, ''];
      var miss = missing[id];
      var badgeSvg;
      if (view === 'journey') {
        /* pill nửa-ngoài mép trên-phải — không đè title */
        var jt = journeyOrderBadge(id).join('·');
        var jw = Math.max(20, 10 + jt.length * 5.6);
        badgeSvg = '<rect class="j-pill" x="' + (p.x + W / 2 - jw / 2) + '" y="' + (p.y - H / 2 - 8) + '" width="' + jw + '" height="15" rx="7.5"/>' +
          '<text class="j-pill-t" x="' + (p.x + W / 2) + '" y="' + (p.y - H / 2 + 3.6) + '" text-anchor="middle" font-size="9.5" font-weight="700">' + esc(jt) + '</text>';
      } else {
        /* số thứ tự ghim nửa-ngoài góc trên-trái — không đè title */
        badgeSvg = '<circle class="flow-num-bg" cx="' + (p.x - W / 2) + '" cy="' + (p.y - H / 2) + '" r="9"/>' +
          '<text class="flow-num" x="' + (p.x - W / 2) + '" y="' + (p.y - H / 2 + 3.4) + '" text-anchor="middle" font-size="10" font-weight="700">' + esc(String(idx + 1)) + '</text>';
      }
      s += '<g class="node-g' + (miss ? ' missing' : '') + '" id="node-' + id + '" tabindex="' + (miss ? '-1' : '0') + '" role="button" aria-label="' + esc(lab[0]) + (miss ? ' — đang chờ pack' : '') + '" data-node="' + id + '">' +
        '<rect class="node-rect" x="' + (p.x - W / 2) + '" y="' + (p.y - H / 2) + '" width="' + W + '" height="' + H + '" rx="10"/>' +
        badgeSvg +
        '<text class="node-title" x="' + p.x + '" y="' + (p.y - 4) + '" text-anchor="middle">' + esc(lab[0]) + '</text>' +
        '<text class="node-sub" x="' + p.x + '" y="' + (p.y + 15) + '" text-anchor="middle">' + esc(miss ? '⏳ chờ pack' : lab[1]) + '</text>' +
        '</g>';
    });

    /* token xe + GID */
    s += '<g id="token"><circle id="token-glow" r="14" fill="rgba(255,215,94,.25)"/>' +
      '<rect id="token-car" x="-13" y="-8" width="26" height="15" rx="4" fill="#4d8dff" stroke="#eaf1ff" stroke-width="1.4"/>' +
      '<text id="token-gid" y="-16" text-anchor="middle" font-size="11" font-weight="700" fill="#ffd75e"></text></g>';
    /* pulse chấm trên cạnh */
    s += '<circle id="edge-pulse" r="5" fill="#ffd75e" opacity="0"/>';
    s += '</svg>';
    return s;
  }

  function legendHtml() {
    if (view === 'journey') {
      return '<div class="journey-note">Timeline nghiệp vụ của <b>1 chiếc xe</b> — entry QR/select xảy ra <b>trước</b> khi parked. Không thay cho call order runtime.</div>' +
        '<div class="legend">' +
        '<span class="lg"><span class="sw" style="border-color:#b78bff;border-top-style:dashed"></span> đường đi của xe/GID</span>' +
        '<span class="lg"><span class="dot"></span> token = xe (G#5 sau khi cấp GID)</span>' +
        '<span class="lg">số góc node = thứ tự xuất hiện trong hành trình</span>' +
        '</div>';
    }
    return '<div class="legend">' +
      '<span class="lg"><span class="sw"></span> thứ tự gọi trong loop</span>' +
      '<span class="lg"><span class="sw worker"></span> nhánh worker song song (~2Hz)</span>' +
      '<span class="lg"><span class="sw async"></span> consumer async (poll)</span>' +
      '<span class="lg"><span class="sw feedback"></span> feedback → vòng sau</span>' +
      '<span class="lg"><span class="dot"></span> token = frame/xe đang được xử lý</span>' +
      '</div>';
  }

  /* list 12 node cho màn hẹp — SVG không thu nhỏ, thay bằng hàng tappable */
  function mNodeListHtml() {
    var map = TGP.nodeMap();
    var ids = TGP.NODE_ORDER.slice();
    if (view === 'journey') {
      ids.sort(function (a, b) {
        return (journeyOrderBadge(a)[0] || 99) - (journeyOrderBadge(b)[0] || 99);
      });
    }
    var rows = ids.map(function (id, i) {
      var lab = MAP_LABEL[id] || [id, ''];
      var miss = !map[id];
      var badge = view === 'journey' ? journeyOrderBadge(id).join('·') : String(i + 1);
      return '<button type="button" class="m-node' + (miss ? ' missing' : '') + '" data-node="' + id + '"' + (miss ? ' disabled' : '') + '>' +
        '<span class="m-num">' + esc(badge) + '</span>' +
        '<span class="m-txt"><b>' + esc(lab[0]) + '</b><i>' + esc(miss ? 'đang chờ pack' : lab[1]) + '</i></span>' +
        '<span class="m-go">›</span></button>';
    }).join('');
    var note = view === 'journey'
      ? '<p class="m-note">Hành trình 1 xe — chạm node để xem chi tiết. Số = thứ tự trong hành trình.</p>'
      : '<p class="m-note">Thứ tự runtime — chạm node để xem chi tiết.</p>';
    return '<div class="m-node-list" role="list" aria-label="Danh sách 12 node pipeline">' + note + rows + '</div>';
  }

  function renderMap() {
    var stage = document.getElementById('stage');
    stage.innerHTML = '<div class="map-stage">' + buildMapSvg() + legendHtml() + '</div>' +
      mNodeListHtml() +
      '<p class="foot-note">Mô phỏng giáo dục — dữ liệu minh họa, không phải pipeline production đang chạy. ' +
      'Ngưỡng production chỉ ghi khi đã verify trong source. ' +
      '<a href="catalog.html">catalog 117 bài V1 (lưu trữ)</a></p>';

    document.querySelectorAll('.m-node').forEach(function (el) {
      el.addEventListener('click', function () {
        location.hash = '#/node/' + el.getAttribute('data-node');
      });
    });
    document.querySelectorAll('.node-g').forEach(function (g) {
      var id = g.getAttribute('data-node');
      if (g.classList.contains('missing')) return;
      function go() { location.hash = '#/node/' + id; }
      g.addEventListener('click', go);
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
    applyBeat(lastBeat, 0);
  }

  /* ---------- global timeline ---------- */

  function setSvg(id, x, y) {
    var g = document.getElementById(id);
    if (g) g.setAttribute('transform', 'translate(' + x + ',' + y + ')');
  }

  function applyBeat(idx, progress) {
    var bs = beats(), b = bs[idx];
    var map = TGP.nodeMap();
    document.querySelectorAll('.node-g').forEach(function (g) {
      g.classList.toggle('active', b.n.indexOf(g.getAttribute('data-node')) >= 0);
    });
    document.querySelectorAll('.m-node').forEach(function (el) {
      el.classList.toggle('active', b.n.indexOf(el.getAttribute('data-node')) >= 0);
    });
    /* token: ease từ pos(beat trước) → pos(beat hiện) trong 55% đầu */
    var from = beatPos(bs[Math.max(0, idx - 1)]), to = beatPos(b);
    if (idx === 0) from = to;
    var t = Math.min(1, progress / 0.55), e = t * t * (3 - 2 * t);
    var x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e - 52;
    setSvg('token', x, y);
    var gid = document.getElementById('token-gid');
    if (gid) gid.textContent = (view === 'journey' && idx >= 2) ? 'G#5' : (view === 'journey' ? 'xe' : 'frame');
    /* pulse trên cạnh vào node đầu của beat */
    var pulse = document.getElementById('edge-pulse');
    if (pulse) {
      var px, py;
      if (view === 'journey' && idx > 0) {
        var fp = beatPos(bs[idx - 1]), tp = beatPos(b);
        var tt = t;
        px = fp.x + (tp.x - fp.x) * tt; py = fp.y + (tp.y - fp.y) * tt;
        pulse.setAttribute('opacity', '0.95');
        pulse.setAttribute('cx', px); pulse.setAttribute('cy', py);
      } else if (view === 'map') {
        var edge = findIncomingEdge(b.n[0], bs[Math.max(0, idx - 1)].n[0]);
        if (edge) {
          var q = edgePoint(edge, progress);
          pulse.setAttribute('opacity', '0.95');
          pulse.setAttribute('cx', q[0]); pulse.setAttribute('cy', q[1]);
        } else pulse.setAttribute('opacity', '0');
      } else pulse.setAttribute('opacity', '0');
    }
    var step = document.getElementById('g-step');
    if (step) step.innerHTML = 'bước <b>' + (idx + 1) + '/' + bs.length + '</b> — ' + esc(b.label);
    var scrubEl = document.getElementById('g-scrub');
    if (scrubEl && document.activeElement !== scrubEl) {
      scrubEl.value = String(Math.round(((idx + progress) / bs.length) * 1000));
    }
    var pb = document.getElementById('g-play');
    if (pb) pb.textContent = player && player.isPlaying() ? '⏸' : '▶';
  }

  function rebuildPlayer() {
    if (player) player.destroy();
    var frames = beats().map(function (b) { return { durationMs: BEAT_MS, title: b.label }; });
    player = TGP.createPlayer(frames, {
      onTick: function (st) { lastBeat = st.frameIndex; applyBeat(st.frameIndex, st.progress); }
    });
    applyBeat(0, 0);
  }

  /* ---------- routing ---------- */

  function showDetail(nodeId, scenId) {
    var map = TGP.nodeMap();
    var stage = document.getElementById('stage');
    var node = map[nodeId];
    /* peer-A issue 3: pause + ẩn global transport — không 2 player sống */
    if (player) player.pause();
    var tp = document.getElementById('transport');
    if (tp) tp.style.display = 'none';
    if (!node) {
      stage.innerHTML = '<div class="detail-head"><button class="tbtn" id="d-back">← Bản đồ</button>' +
        '<h2>' + esc((MAP_LABEL[nodeId] || [nodeId])[0]) + '</h2><span class="chip missing">đang chờ pack</span></div>' +
        '<div class="err-banner">Node này thuộc pack chưa load (builder ' +
        esc(nodeId === 'handoff' || nodeId === 'slot-vision' || nodeId === 'binder' ? 'B — pipeline-identity.js' :
          nodeId === 'capture' || nodeId === 'snapshot' || nodeId === 'gate-session' || nodeId === 'navigation' ? 'C — pipeline-system.js' : 'A — pipeline-local.js') +
        '). UI chưa hoàn tất.</div>';
      document.getElementById('d-back').onclick = function () { location.hash = '#/' + view; };
      return;
    }
    detail = TGP.mountNodeDetail(stage, node, {
      scenarioId: scenId,
      onBack: function () { location.hash = '#/' + view; },
      onPrevNode: function () { stepNode(-1); },
      onNextNode: function () { stepNode(1); },
      onScenario: function (sid) {
        currentScen = sid;
        history.replaceState(null, '', '#/node/' + nodeId + '/' + sid);
      }
    });
  }
  function stepNode(dir) {
    var order = TGP.NODE_ORDER;
    var i = order.indexOf(currentNodeId);
    if (i < 0) return;
    var j = (i + dir + order.length) % order.length;
    location.hash = '#/node/' + order[j];
  }

  function route() {
    var h = location.hash || '#/map';
    var m;
    if ((m = h.match(/^#\/node\/([\w-]+)(?:\/([\w-]+))?/))) {
      if (detail && currentNodeId === m[1] && m[2] && m[2] !== currentScen) {
        /* đổi scenario qua hash — remount */
        detail.destroy(); detail = null;
      } else if (detail && currentNodeId === m[1]) return;
      if (detail) { detail.destroy(); detail = null; }
      currentNodeId = m[1];
      if (!document.getElementById('stage')) renderChrome();
      showDetail(m[1], m[2]);
      syncTabs();
      return;
    }
    if (detail) { detail.destroy(); detail = null; }
    currentNodeId = null;
    view = h === '#/journey' ? 'journey' : 'map';
    renderChrome();
    document.getElementById('pack-status').innerHTML = packChipHtml();
    syncTabs();
    renderMap();
    rebuildPlayer();
  }
  function syncTabs() {
    var tm = document.getElementById('tab-map'), tj = document.getElementById('tab-journey');
    if (tm) tm.setAttribute('aria-pressed', view === 'map' ? 'true' : 'false');
    if (tj) tj.setAttribute('aria-pressed', view === 'journey' ? 'true' : 'false');
  }

  /* keyboard map-level (detail tự xử lý trong engine) */
  document.addEventListener('keydown', function (e) {
    if (currentNodeId) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); player && player.toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player && player.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player && player.prev(); }
    else if (e.key === 'r' || e.key === 'R') { player && player.reset(); }
  });

  window.addEventListener('hashchange', route);

  /* boot */
  renderChrome();
  document.getElementById('pack-status').innerHTML = packChipHtml();
  route();
  /* QA hook */
  window.__tgp = {
    route: route,
    beats: beats,
    player: function () { return player; },
    engine: TGP
  };
})();
