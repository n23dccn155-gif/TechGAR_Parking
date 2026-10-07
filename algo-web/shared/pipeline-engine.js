/* TechGar2 pipeline V2 — engine (builder C, SPEC §5).
 * Registry : packs gán window.TechGarPipelinePacks[key] = [node,...]
 *            với key 'local' (A) / 'identity' (B) / 'system' (C).
 * Engine   : thứ tự node chuẩn, validate, player deterministic,
 *            mountNodeDetail() dựng toàn bộ màn chi tiết, helpers vẽ h.
 * Không fetch/CDN/build. Chạy file:// lẫn HTTP.
 */
(function () {
  'use strict';

  window.TechGarPipelinePacks = window.TechGarPipelinePacks || {};

  // SPEC §3 — thứ tự 12 node chính thức (không suy ra từ packs).
  var NODE_ORDER = [
    'capture', 'kalman', 'motion', 'roi', 'assignment', 'coasting',
    'handoff', 'slot-vision', 'binder', 'snapshot', 'gate-session', 'navigation'
  ];
  var GROUP_LABEL = {
    input: 'Đầu vào', tracking: 'Theo dõi 1 camera', local: 'Theo dõi 1 camera',
    identity: 'Liên kết 2 camera', parking: 'Worker ô đỗ song song',
    occupancy: 'Worker ô đỗ song song',
    output: 'Xuất bản', consumer: 'Consumer async', system: 'Hệ thống'
  };
  var PACK_OWNER = { local: 'A', identity: 'B', system: 'C' };

  /* ---------------- registry ---------------- */

  function packs() { return window.TechGarPipelinePacks; }

  function allNodes() {
    var out = [];
    Object.keys(packs()).forEach(function (k) {
      (packs()[k] || []).forEach(function (n) { out.push(n); });
    });
    var rank = {}; NODE_ORDER.forEach(function (id, i) { rank[id] = i; });
    out.sort(function (a, b) {
      var ra = rank[a.id] != null ? rank[a.id] : 999;
      var rb = rank[b.id] != null ? rank[b.id] : 999;
      return ra - rb;
    });
    return out;
  }
  function nodeMap() {
    var m = {}; allNodes().forEach(function (n) { m[n.id] = n; }); return m;
  }
  function missingNodeIds() {
    var m = nodeMap();
    return NODE_ORDER.filter(function (id) { return !m[id]; });
  }
  function dupNodeIds() {
    var seen = {}, dups = {};
    Object.keys(packs()).forEach(function (k) {
      (packs()[k] || []).forEach(function (n) {
        if (n && n.id) { if (seen[n.id]) dups[n.id] = true; seen[n.id] = true; }
      });
    });
    return Object.keys(dups);
  }
  function packStatus() {
    var p = packs();
    return Object.keys(PACK_OWNER).map(function (k) {
      var arr = p[k];
      return { key: k, owner: PACK_OWNER[k], loaded: Array.isArray(arr) && arr.length > 0, count: arr ? arr.length : 0 };
    });
  }

  /* ---------------- validation ---------------- */

  function validateNode(node) {
    var errs = [];
    if (!node || typeof node !== 'object') return ['node không phải object'];
    ['id', 'title', 'group', 'summary'].forEach(function (f) {
      if (typeof node[f] !== 'string' || !node[f]) errs.push('thiếu ' + f);
    });
    var a = node.answers || {};
    ['does', 'role', 'where', 'why'].forEach(function (f) {
      if (typeof a[f] !== 'string' || !a[f]) errs.push('thiếu answers.' + f);
    });
    if (!Array.isArray(node.refs) || node.refs.length === 0) {
      errs.push('refs rỗng');
    } else {
      node.refs.forEach(function (r, i) {
        if (!r || typeof r.path !== 'string' || !r.path) errs.push('refs[' + i + '].path');
        if (!Number.isInteger(r && r.line) || r.line < 1) errs.push('refs[' + i + '].line');
        if (typeof (r && r.excerpt) !== 'string' || !r.excerpt) errs.push('refs[' + i + '].excerpt');
        if (!Number.isInteger(r && r.excerptStart)) errs.push('refs[' + i + '].excerptStart');
      });
    }
    if (!Array.isArray(node.pseudocode) || node.pseudocode.length < 5 || node.pseudocode.length > 10) {
      errs.push('pseudocode phải 5-10 dòng');
    }
    if (!Array.isArray(node.scenarios) || node.scenarios.length < 2) {
      errs.push('cần ≥ 2 scenarios');
    } else {
      var seenScen = {};
      node.scenarios.forEach(function (s, i) {
        if (!s || typeof s.id !== 'string' || !s.id) { errs.push('scenarios[' + i + '].id'); return; }
        if (seenScen[s.id]) errs.push('scenario id trùng: ' + s.id);
        seenScen[s.id] = true;
        if (typeof (s && s.build) !== 'function') errs.push('scenarios[' + i + '].build');
        else {
          var frames;
          try { frames = s.build(); } catch (e) { errs.push('scenarios[' + i + '].build throw: ' + e.message); return; }
          if (!Array.isArray(frames) || frames.length < 3) { errs.push('scenarios[' + i + '] < 3 frames'); return; }
          var plen = (node.pseudocode || []).length;
          frames.forEach(function (f, j) {
            if (!f || typeof f.title !== 'string' || !f.title) errs.push('scen ' + i + ' frame ' + j + ' thiếu title');
            if (!f || typeof f.explanation !== 'string' || !f.explanation) errs.push('scen ' + i + ' frame ' + j + ' thiếu explanation');
            if (!f || !(f.durationMs > 0)) errs.push('scen ' + i + ' frame ' + j + ' thiếu durationMs');
            if (!f || typeof f.state !== 'object' || f.state === null || !Object.keys(f.state).length) errs.push('scen ' + i + ' frame ' + j + ' state rỗng');
            if (!f || typeof f.scene !== 'object' || f.scene === null) errs.push('scen ' + i + ' frame ' + j + ' thiếu scene');
            if (f && Array.isArray(f.activeLines)) {
              f.activeLines.forEach(function (L) {
                if (!Number.isInteger(L) || L < 0 || L >= plen) errs.push('scen ' + i + ' frame ' + j + ' activeLines[' + L + '] ngoài pseudocode');
              });
            }
            try { JSON.stringify(f.scene == null ? {} : f.scene); JSON.stringify(f.state == null ? {} : f.state); }
            catch (e) { errs.push('scen ' + i + ' frame ' + j + ' scene/state không JSON-safe'); }
          });
        }
      });
    }
    if (typeof node.draw !== 'function') errs.push('thiếu draw(ctx, frame, view)');
    return errs;
  }

  /* ---------------- draw helpers (packs dùng qua TGP.h) ---------------- */

  var TAU = Math.PI * 2;
  var h = {
    lerp: function (a, b, t) { return a + (b - a) * t; },
    clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    ease: function (t) { t = h.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
    easeOut: function (t) { t = h.clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); },
    pt: function (a, b, t) { return { x: h.lerp(a.x, b.x, t), y: h.lerp(a.y, b.y, t) }; },

    box: function (ctx, x, y, w, hgt, r, fill, stroke, lw) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + hgt, r);
      ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
      ctx.arcTo(x, y + hgt, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    },
    txt: function (ctx, s, x, y, o) {
      o = o || {};
      ctx.fillStyle = o.color || '#dbe4f5';
      ctx.font = (o.weight || 400) + ' ' + (o.size || 12) + 'px "Segoe UI", "Noto Sans", sans-serif';
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'middle';
      ctx.fillText(s, x, y);
    },
    mono: function (ctx, s, x, y, o) {
      o = o || {};
      ctx.fillStyle = o.color || '#dbe4f5';
      ctx.font = (o.weight || 400) + ' ' + (o.size || 11) + 'px Consolas, monospace';
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'middle';
      ctx.fillText(s, x, y);
    },
    arrow: function (ctx, x1, y1, x2, y2, o) {
      o = o || {};
      var col = o.color || '#5b7dd6', w = o.width || 2;
      ctx.strokeStyle = col; ctx.lineWidth = w;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      var ang = Math.atan2(y2 - y1, x2 - x1), ah = o.head || 8;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah * Math.cos(ang - 0.45), y2 - ah * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - ah * Math.cos(ang + 0.45), y2 - ah * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fill();
    },
    pill: function (ctx, s, x, y, o) {
      o = o || {};
      ctx.font = (o.weight || 600) + ' ' + (o.size || 11) + 'px "Segoe UI", sans-serif';
      var w = ctx.measureText(s).width + 16, hgt = (o.size || 11) + 10;
      var bx = o.align === 'center' ? x - w / 2 : x;
      h.box(ctx, bx, y - hgt / 2, w, hgt, hgt / 2, o.bg || '#1d2a4c', o.border || '#30427a');
      h.txt(ctx, s, bx + w / 2, y + 0.5, { color: o.color || '#dbe4f5', size: o.size || 11, weight: 600, align: 'center' });
      return w;
    },
    /* xe nhỏ + nhãn GID tùy chọn */
    car: function (ctx, x, y, angle, o) {
      o = o || {};
      var col = o.color || '#4d8dff', L = o.len || 30, W = o.wid || 16;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle || 0);
      h.box(ctx, -L / 2, -W / 2, L, W, 4, col, '#dbe4f5', 1.2);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(L * 0.05, -W / 2 + 2, L * 0.28, W - 4); // kính trước
      ctx.restore();
      if (o.gid != null) {
        h.pill(ctx, 'G#' + o.gid, x, y - W / 2 - 13, { bg: '#3a2c12', border: '#ffd75e', color: '#ffd75e', size: 10, align: 'center' });
      }
    },
    glow: function (ctx, x, y, r, color, alpha) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.globalAlpha = alpha == null ? 0.5 : alpha;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
    },
    /* pulse chạy trên đoạn theo progress */
    pulseDot: function (ctx, a, b, t, o) {
      o = o || {};
      var p = h.pt(a, b, h.ease(t));
      h.glow(ctx, p.x, p.y, o.r || 9, o.color || '#ffd75e', 0.8);
      ctx.fillStyle = o.color || '#ffd75e';
      ctx.beginPath(); ctx.arc(p.x, p.y, o.dot || 4, 0, TAU); ctx.fill();
      return p;
    }
  };

  /* ---------------- player deterministic ---------------- */

  function totalDuration(frames) {
    return frames.reduce(function (s, f) { return s + (f.durationMs || 1500); }, 0);
  }

  function createPlayer(frames, opts) {
    opts = opts || {};
    var idx = 0, elapsed = 0, playing = false, speed = opts.speed || 1;
    var raf = null, lastTs = null, destroyed = false;

    function fire() { if (opts.onTick) opts.onTick(api.state()); }

    function tick(ts) {
      if (!playing || destroyed) return;
      if (lastTs == null) lastTs = ts;
      var dt = (ts - lastTs) * speed; lastTs = ts;
      elapsed += dt;
      while (elapsed >= (frames[idx].durationMs || 1500)) {
        if (idx >= frames.length - 1) {
          elapsed = frames[idx].durationMs || 1500;
          playing = false;
          if (opts.onEnd) opts.onEnd();
          break;
        }
        elapsed -= (frames[idx].durationMs || 1500);
        idx += 1;
      }
      fire();
      if (playing) raf = requestAnimationFrame(tick);
    }

    var api = {
      state: function () {
        var d = frames[idx].durationMs || 1500;
        return {
          frameIndex: idx, frame: frames[idx],
          progress: Math.min(1, elapsed / d),
          previous: idx > 0 ? frames[idx - 1] : null,
          elapsedInFrame: elapsed, totalElapsed: frames.slice(0, idx).reduce(function (s, f) { return s + (f.durationMs || 1500); }, 0) + elapsed,
          total: totalDuration(frames), playing: playing, speed: speed,
          frameCount: frames.length
        };
      },
      play: function () {
        if (destroyed || playing) return;
        if (idx >= frames.length - 1 && elapsed >= (frames[idx].durationMs || 1500)) { idx = 0; elapsed = 0; }
        playing = true; lastTs = null; raf = requestAnimationFrame(tick); fire();
      },
      pause: function () {
        playing = false;
        if (raf != null) cancelAnimationFrame(raf); raf = null; fire();
      },
      toggle: function () { playing ? api.pause() : api.play(); },
      next: function () {
        api.pause();
        if (idx < frames.length - 1) { idx += 1; elapsed = 0; }
        fire();
      },
      prev: function () {
        api.pause();
        if (elapsed > 1) elapsed = 0; else if (idx > 0) { idx -= 1; elapsed = 0; }
        fire();
      },
      reset: function () { api.pause(); idx = 0; elapsed = 0; fire(); },
      /* frac 0..1 trên toàn scenario */
      seek: function (frac) {
        var target = h.clamp(frac, 0, 0.9999) * totalDuration(frames);
        var acc = 0; idx = 0;
        while (idx < frames.length - 1 && acc + (frames[idx].durationMs || 1500) <= target) {
          acc += frames[idx].durationMs || 1500; idx += 1;
        }
        elapsed = Math.max(0, target - acc); fire();
      },
      setSpeed: function (v) { speed = v; fire(); },
      isPlaying: function () { return playing; },
      destroy: function () {
        destroyed = true; playing = false;
        if (raf != null) cancelAnimationFrame(raf);
      }
    };
    return api;
  }

  /* ---------------- node detail mount ---------------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  var SPEEDS = [0.5, 1, 2, 4];

  /* opts: { scenarioId, onPrevNode, onNextNode, onBack, onScenario } */
  function mountNodeDetail(host, node, opts) {
    opts = opts || {};
    var errors = validateNode(node);
    host.innerHTML = '';
    var wrap = el('div', 'node-detail');
    host.appendChild(wrap);

    /* header */
    var head = el('div', 'detail-head');
    var back = el('button', 'tbtn', '← Bản đồ');
    back.setAttribute('aria-label', 'Quay lại bản đồ pipeline');
    back.onclick = function () { if (opts.onBack) opts.onBack(); };
    head.appendChild(back);
    head.appendChild(el('h2', null, esc(node.title)));
    head.appendChild(el('span', 'chip', esc(GROUP_LABEL[node.group] || node.group)));
    var nav = el('div', 'nav-btns');
    var pv = el('button', 'tbtn', '‹ Trước'); pv.setAttribute('aria-label', 'Node trước trong pipeline');
    var nx = el('button', 'tbtn', 'Sau ›'); nx.setAttribute('aria-label', 'Node sau trong pipeline');
    pv.onclick = function () { if (opts.onPrevNode) opts.onPrevNode(); };
    nx.onclick = function () { if (opts.onNextNode) opts.onNextNode(); };
    nav.appendChild(pv); nav.appendChild(nx);
    head.appendChild(nav);
    wrap.appendChild(head);
    var sum = el('p', null, esc(node.summary));
    sum.style.cssText = 'margin:0 0 10px;color:#a9bce4;font-size:13.5px';
    wrap.appendChild(sum);
    if (errors.length) {
      wrap.appendChild(el('div', 'err-banner',
        'Node vi phạm contract: ' + errors.map(esc).join(' · ')));
    }

    /* transport — class riêng detail-tp để phân biệt global bar */
    var tp = el('div', 'transport detail-tp');
    var scenSel = el('select'); scenSel.setAttribute('aria-label', 'Chọn tình huống');
    (node.scenarios || []).forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.id; o.textContent = s.label || s.id;
      scenSel.appendChild(o);
    });
    tp.appendChild(scenSel);
    function mkBtn(label, aria, cls) {
      var b = el('button', 'tbtn' + (cls ? ' ' + cls : ''), label);
      b.setAttribute('aria-label', aria); tp.appendChild(b); return b;
    }
    var bPlay = mkBtn('▶', 'Phát hoặc tạm dừng', 'primary');
    var bPrev = mkBtn('‹', 'Bước trước');
    var bNext = mkBtn('›', 'Bước sau');
    var bReset = mkBtn('⟲', 'Về đầu');
    var speedSel = el('select'); speedSel.setAttribute('aria-label', 'Tốc độ phát');
    SPEEDS.forEach(function (v) {
      var o = document.createElement('option');
      o.value = String(v); o.textContent = v + '×'; if (v === 1) o.selected = true;
      speedSel.appendChild(o);
    });
    tp.appendChild(speedSel);
    var scrubWrap = el('div', 'scrub-wrap');
    var scrub = document.createElement('input');
    scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0';
    scrub.setAttribute('aria-label', 'Thanh scrub toàn tình huống');
    var stepLab = el('span', 'step-label');
    scrubWrap.appendChild(scrub); scrubWrap.appendChild(stepLab);
    tp.appendChild(scrubWrap);
    wrap.appendChild(tp);

    /* canvas + state */
    var grid = el('div', 'detail-grid');
    var card = el('div', 'canvas-card');
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Animation minh họa ' + node.title);
    card.appendChild(canvas);
    var cap = el('div', 'frame-caption');
    var fTitle = el('div', 'f-title'); var fExpl = el('div', 'f-expl');
    cap.appendChild(fTitle); cap.appendChild(fExpl);
    card.appendChild(cap);
    grid.appendChild(card);
    var side = el('div', 'side-stack');
    var statePanel = el('div', 'panel');
    statePanel.appendChild(el('h3', null, 'Trạng thái'));
    var stateTable = el('table', 'state-table');
    statePanel.appendChild(stateTable);
    side.appendChild(statePanel);
    grid.appendChild(side);
    wrap.appendChild(grid);

    /* answers */
    var ans = el('div', 'answers');
    [['LÀM GÌ', node.answers && node.answers.does],
    ['VAI TRÒ', node.answers && node.answers.role],
    ['NẰM Ở ĐÂU', node.answers && node.answers.where],
    ['TẠI SAO', node.answers && node.answers.why]].forEach(function (pair) {
      var c = el('div', 'answer-card');
      c.appendChild(el('h4', null, esc(pair[0])));
      c.appendChild(el('p', null, esc(pair[1] || '—')));
      ans.appendChild(c);
    });
    wrap.appendChild(ans);

    /* pseudocode */
    var pseudo = el('details', 'pseudo');
    pseudo.appendChild(el('summary', null, 'Pseudocode (' + (node.pseudocode || []).length + ' bước)'));
    var ol = el('ol');
    (node.pseudocode || []).forEach(function (line) { ol.appendChild(el('li', null, esc(line))); });
    pseudo.appendChild(ol);
    wrap.appendChild(pseudo);

    /* refs drawer */
    var rbtn = el('button', 'refs-toggle', '📄 Dẫn chứng source (' + (node.refs || []).length + ')');
    var refsBox = el('div', 'refs'); refsBox.style.display = 'none';
    (node.refs || []).forEach(function (r) {
      var c = el('div', 'ref-card');
      var hd = el('div', 'ref-head');
      hd.appendChild(el('span', 'sym', esc(r.symbol || '')));
      var a = document.createElement('a');
      a.href = '../' + r.path; a.textContent = r.path + ':' + r.line;
      a.target = '_blank'; a.rel = 'noopener';
      hd.appendChild(a);
      c.appendChild(hd);
      var pre = el('pre', 'ref-src');
      var start = r.excerptStart || r.line;
      pre.innerHTML = String(r.excerpt || '').replace(/\n$/, '').split('\n').map(function (ln, i) {
        return '<span class="ln">' + (start + i) + '</span>' + esc(ln);
      }).join('\n');
      c.appendChild(pre);
      refsBox.appendChild(c);
    });
    rbtn.onclick = function () {
      var show = refsBox.style.display === 'none';
      refsBox.style.display = show ? '' : 'none';
      rbtn.textContent = (show ? '📄 Ẩn dẫn chứng' : '📄 Dẫn chứng source (' + (node.refs || []).length + ')');
    };
    wrap.appendChild(rbtn);
    wrap.appendChild(refsBox);

    /* ---- scenario runtime ---- */
    var frames = [], player = null, scenarioId = null;
    var rafDraw = null, disposed = false, lastState = null;

    function draw(st) {
      var w = card.clientWidth || 700;
      var hgt = Math.round(Math.min(470, Math.max(300, w * 0.56)));
      var dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
        canvas.style.height = hgt + 'px';
      }
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hgt);
      try {
        node.draw(ctx, st.frame, {
          width: w, height: hgt,
          progress: st.progress, time: st.elapsedInFrame,
          previous: st.previous, frameIndex: st.frameIndex,
          playing: st.playing
        });
      } catch (e) {
        ctx.fillStyle = '#f3a9c0'; ctx.font = '13px sans-serif';
        ctx.fillText('draw() lỗi: ' + e.message, 14, 24);
      }
      fTitle.textContent = (st.frameIndex + 1) + '/' + frames.length + ' — ' + st.frame.title;
      fExpl.textContent = st.frame.explanation;
      /* state table */
      stateTable.innerHTML = '';
      var stObj = st.frame.state || {};
      Object.keys(stObj).forEach(function (k) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td'); td1.textContent = k;
        var v = stObj[k];
        var td2 = document.createElement('td');
        td2.textContent = (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
        tr.appendChild(td1); tr.appendChild(td2); stateTable.appendChild(tr);
      });
      /* pseudo highlight */
      var lis = ol.children;
      for (var i = 0; i < lis.length; i++) {
        lis[i].className = (st.frame.activeLines || []).indexOf(i) >= 0 ? 'on' : '';
      }
      stepLab.innerHTML = 'bước <b>' + (st.frameIndex + 1) + '/' + frames.length + '</b> · ' +
        (st.totalElapsed / 1000).toFixed(1) + 's / ' + (st.total / 1000).toFixed(1) + 's';
      if (document.activeElement !== scrub) scrub.value = String(Math.round((st.totalElapsed / st.total) * 1000));
      bPlay.textContent = st.playing ? '⏸' : '▶';
      bPlay.setAttribute('aria-label', st.playing ? 'Tạm dừng' : 'Phát');
    }

    function selectScenario(id) {
      var sc = (node.scenarios || []).filter(function (s) { return s.id === id; })[0]
        || (node.scenarios || [])[0];
      if (!sc) return;
      var oldErr = wrap.querySelector('.err-banner.build-err'); if (oldErr) oldErr.remove();
      scenarioId = sc.id; scenSel.value = sc.id;
      if (player) player.destroy();
      try {
        frames = sc.build();
      } catch (e) {
        frames = [{ title: 'build() throw', explanation: String(e && e.message || e), durationMs: 1200, activeLines: [], state: { lỗi: String(e && e.message || e) }, scene: {} }];
        var eb = el('div', 'err-banner', 'scenario.build() throw: ' + esc(e && e.message || e));
        var old = wrap.querySelector('.err-banner.build-err'); if (old) old.remove();
        eb.classList.add('build-err'); wrap.insertBefore(eb, tp);
      }
      player = createPlayer(frames, { onTick: function (st) { lastState = st; draw(st); } });
      player.setSpeed(parseFloat(speedSel.value) || 1);
      lastState = player.state();
      draw(lastState);
      if (opts.onScenario) opts.onScenario(sc.id);
    }

    scenSel.onchange = function () { selectScenario(scenSel.value); };
    bPlay.onclick = function () { player && player.toggle(); };
    bNext.onclick = function () { player && player.next(); };
    bPrev.onclick = function () { player && player.prev(); };
    bReset.onclick = function () { player && player.reset(); };
    speedSel.onchange = function () { player && player.setSpeed(parseFloat(speedSel.value)); };
    scrub.oninput = function () { player && player.seek(parseInt(scrub.value, 10) / 1000); };

    /* keyboard trong vùng detail */
    function onKey(e) {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); player && player.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); player && player.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); player && player.prev(); }
      else if (e.key === 'r' || e.key === 'R') { player && player.reset(); }
    }
    host.addEventListener('keydown', onKey);

    function onResize() { if (lastState) draw(lastState); }
    window.addEventListener('resize', onResize);

    selectScenario(opts.scenarioId);

    var handle = {
      destroy: function () {
        disposed = true;
        if (player) player.destroy();
        if (rafDraw) cancelAnimationFrame(rafDraw);
        host.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        host.innerHTML = '';
      },
      /* QA hooks */
      _api: function () { return player; },
      _frames: function () { return frames; },
      _scenario: function () { return scenarioId; },
      _canvas: function () { return canvas; },
      _select: selectScenario
    };
    window.TechGarPipelineEngine._lastDetail = handle;
    return handle;
  }

  /* ---------------- export ---------------- */

  window.TechGarPipelineEngine = {
    NODE_ORDER: NODE_ORDER,
    GROUP_LABEL: GROUP_LABEL,
    PACK_OWNER: PACK_OWNER,
    packs: packs,
    allNodes: allNodes,
    nodeMap: nodeMap,
    missingNodeIds: missingNodeIds,
    dupNodeIds: dupNodeIds,
    packStatus: packStatus,
    validateNode: validateNode,
    createPlayer: createPlayer,
    mountNodeDetail: mountNodeDetail,
    h: h,
    esc: esc
  };
})();
