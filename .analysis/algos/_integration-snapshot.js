/* TechGar2 algo-web — pack INTEGRATION (23 canonical IDs)
 * Owner: builder-c. Nguồn: .analysis/algos/builder-c.md (đã duyệt).
 * Contract: SPEC.md §4-§5. Classic script — chỉ dùng window.TechGarAlgo.registerPack.
 * Không fetch/module/CDN/backend/model. Mọi trace tính thật từ scenario.input + params.
 * 6 alias do pack này quản lý (đăng ký trong lesson.aliases, map nằm ở engine).
 */
(function () {
'use strict';
var PACK_ID = 'integration';

/* ================= helpers toán/dữ liệu ================= */
function dc(o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); }
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function isoS(s) { var t = Date.parse(s); return Number.isFinite(t) ? t / 1000 : NaN; }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function orient(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function segIntersect(p1, p2, p3, p4) {
  var o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  var o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  return { intersect: o1 * o2 <= 0 && o3 * o4 <= 0, o1: o1, o2: o2, o3: o3, o4: o4 };
}
function crossDir(prev, next, gate) {
  var ix = segIntersect(prev, next, gate.p1, gate.p2);
  var v = { x: next.x - prev.x, y: next.y - prev.y };
  var g = { x: gate.p2.x - gate.p1.x, y: gate.p2.y - gate.p1.y };
  var d = v.x * g.y - v.y * g.x;
  var ok = ix.intersect && Math.abs(d) >= 1e-9 &&
    (gate.direction === 'positive' ? d > 0 : d < 0);
  return { intersect: ix.intersect, d: d, ok: ok, o: ix };
}

/* ================= helpers vẽ canvas ================= */
function T(ctx, s, x, y, o) {
  o = o || {};
  ctx.fillStyle = o.c || '#e8ecf4';
  ctx.font = (o.w || '') + ' ' + (o.sz || 12) + 'px ' + (o.f || 'sans-serif');
  ctx.textAlign = o.a || 'left';
  ctx.textBaseline = o.b || 'alphabetic';
  ctx.fillText(String(s), x, y);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function LN(ctx, x1, y1, x2, y2, c, w, dash) {
  ctx.strokeStyle = c; ctx.lineWidth = w || 1.5;
  ctx.setLineDash(dash || []);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}
function AR(ctx, x1, y1, x2, y2, c, w) {
  LN(ctx, x1, y1, x2, y2, c, w || 2);
  var a = Math.atan2(y2 - y1, x2 - x1), s = 7;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - s * Math.cos(a - .5), y2 - s * Math.sin(a - .5));
  ctx.lineTo(x2 - s * Math.cos(a + .5), y2 - s * Math.sin(a + .5));
  ctx.closePath(); ctx.fill();
}
function DOT(ctx, x, y, r, c, ring) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.stroke(); }
}
function BX(ctx, x, y, w, h, fill, stroke, rad) {
  rad = rad == null ? 7 : rad;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function PILL(ctx, x, y, text, c, w) {
  var s = String(text), wd = w || (s.length * 6.4 + 14);
  BX(ctx, x, y - 9, wd, 18, 'rgba(0,0,0,.35)', c, 9);
  T(ctx, s, x + 7, y + 3.5, { c: c, sz: 10.5, w: '600' });
  return wd;
}
function title(ctx, env, s, sub) {
  T(ctx, s, 14, 24, { c: env.palette.text, sz: 14, w: '700' });
  if (sub) T(ctx, sub, 14, 41, { c: env.palette.muted, sz: 11 });
}
/* scale-fit world → canvas */
function wfit(bounds, x, y, w, h) {
  var bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
  var s = Math.min(w / (bw || 1), h / (bh || 1));
  var ox = x + (w - bw * s) / 2, oy = y + (h - bh * s) / 2;
  return {
    tx: function (wx) { return ox + (wx - bounds.x0) * s; },
    ty: function (wy) { return oy + (wy - bounds.y0) * s; },
    s: s
  };
}
function gateSeg(ctx, m, gate, c, label) {
  AR(ctx, m.tx(gate.p1.x), m.ty(gate.p1.y), m.tx(gate.p2.x), m.ty(gate.p2.y), c, 3);
  if (label) {
    var mx = (m.tx(gate.p1.x) + m.tx(gate.p2.x)) / 2;
    var my = (m.ty(gate.p1.y) + m.ty(gate.p2.y)) / 2;
    PILL(ctx, mx + 8, my - 10, label, c);
  }
}
function segTable(ctx, x, y, heads, rows, colW, rh, opts) {
  opts = opts || {};
  var w = colW.reduce(function (a, b) { return a + b; }, 0);
  BX(ctx, x, y, w, rh * (rows.length + 1) + 6, 'rgba(255,255,255,.02)', '#2a3248', 6);
  heads.forEach(function (h, i) {
    var cx = x + 8 + colW.slice(0, i).reduce(function (a, b) { return a + b; }, 0);
    T(ctx, h, cx, y + 16, { c: '#8a93a8', sz: 10, w: '700' });
  });
  rows.forEach(function (row, ri) {
    row.forEach(function (cell, ci) {
      var cx = x + 8 + colW.slice(0, ci).reduce(function (a, b) { return a + b; }, 0);
      var o = (opts.cellStyle && opts.cellStyle(ri, ci, cell)) || {};
      T(ctx, cell, cx, y + 16 + (ri + 1) * rh, { c: o.c || '#e8ecf4', sz: o.sz || 11, w: o.w });
    });
  });
}

/* ============ khung trace/checks ============ */
function mkFrame(id, lines, expl, state, metrics, scene, dur) {
  return {
    id: id, activeLines: lines, explanation: expl,
    state: state || {}, metrics: metrics || [], scene: scene || {},
    durationMs: dur == null ? 900 : dur
  };
}
function chk(label, actual, expected) {
  return { label: label, pass: deepEq(actual, expected), actual: actual, expected: expected };
}
function defParams(lesson, scenId) {
  var p = {};
  (lesson.parameters || []).forEach(function (d) { p[d.key] = d.default; });
  var sc = scenOf(lesson, scenId);
  if (sc && sc.defaultParams) { for (var k in sc.defaultParams) p[k] = sc.defaultParams[k]; }
  return p;
}
function paramsDefault(lesson, scenId, params) {
  return deepEq(defParams(lesson, scenId), params || {});
}
function scenOf(lesson, scenId) {
  var list = lesson.scenarios || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === scenId) return list[i];
  return list[0];
}
/* expected = scenario.expected khi params default; ngược lại reference() tính lại */
function expectedFor(lesson, scenId, params, reference) {
  var sc = scenOf(lesson, scenId);
  if (paramsDefault(lesson, scenId, params)) return dc(sc.expected);
  var e = reference(sc.input, params);
  return e === undefined ? dc(sc.expected) : e;
}

var LESSONS = [];

/* =================================================================
 * NHÓM A — Contract snapshot & freshness (A1–A5)
 * ================================================================= */

/* ---------- A1 snapshot-v2-build ---------- */
LESSONS.push({
  id: 'snapshot-v2-build', pack: PACK_ID,
  title: 'Chuẩn hóa payload runtime schema v2',
  topic: 'Contract & freshness',
  summary: 'Producer duy nhất của contract web: gom registry identity, parking per-camera, episode và pipeline health thành một JSON snapshot ổn định.',
  role: 'Gom output rời rạc của runtime thành 1 payload v2 (17 khóa) cho gate + frontend — vehicles sort theo global_id, camera health derive từ monotonic ns.',
  inputTypes: [
    { name: 'runtime_id, timestamp, frame_index', type: 'scalar', description: 'Định danh lần publish' },
    { name: 'registry', type: 'object', description: 'map_vehicles, identity_lifecycle, retired_global_ids, recent_events, world_unit' },
    { name: 'parking_by_camera', type: 'dict', description: '{cam:{slot_id:state}}' },
    { name: 'parking_episodes', type: 'array', description: 'Episode authoritative của binder' },
    { name: 'camera_timestamps_ns / sizes / applied_monotonic_ns', type: 'dict/scalar', description: 'Nguồn derive camera health' }
  ],
  outputTypes: [
    { name: 'snapshot', type: 'dict v2', description: 'vehicles[] sort global_id, cameras{}, parking_slots[], slot_layout[], coordinate_space…' }
  ],
  structures: [
    { name: 'slots', type: 'array', description: 'flat list {slot_id, camera_id, **state}' },
    { name: 'parked_owners', type: 'map int→str', description: 'gid → slot_id từ episode state=="parked"' },
    { name: 'vehicles', type: 'array', description: 'đã lọc terminal + sort global_id' }
  ],
  complexity: {
    time: 'O(S + V log V + E + L + ev)', space: 'O(V + S + E)',
    variables: 'S tổng slot (~60), V xe live, E episode, L slot_layout, ev events ≤100',
    simulation: 'Demo ≤4 identity + 2 cam — giữ nguyên logic map/filter/sort của producer.'
  },
  codeRefs: [
    { path: 'backend/main_detect/src/techgar/runtime_contract.py', line: 37, endLine: 168, symbol: 'build_runtime_snapshot', note: 'producer duy nhất' },
    { path: 'backend/main_detect/two_camera.py', line: 2844, endLine: 2869, symbol: 'call site', note: 'truyền applied_monotonic_ns' }
  ],
  pseudocode: [
    { id: 's1', text: 'slots ← flatten parking_by_camera kèm camera_id' },
    { id: 's2', text: 'parked_owners ← {gid→slot | episode.state=="parked"}' },
    { id: 's3', text: 'duyệt identity_lifecycle: skip state ∈ {exited, expired}' },
    { id: 's4', text: 'active ← map_vehicles[str(gid)] hoặc [int(gid)]' },
    { id: 's5', text: 'position ← active.position ‖ last_world; thiếu → bỏ xe' },
    { id: 's6', text: 'build vehicle {gid, state, observed, parked_slot_id, path tail ≤12}' },
    { id: 's7', text: 'clock ← applied_monotonic_ns ‖ max(ts); derive cameras{}' },
    { id: 's8', text: 'ghép dict 17 khóa; sort vehicles theo global_id' }
  ],
  edgeCases: [
    { title: 'Key str/int kép', description: 'map_vehicles có thể key str hoặc int → double lookup (:82-87); bỏ sót thì xe live thành observed=false.' },
    { title: 'Thiếu position', description: 'Xe không có position → bị lọc khỏi snapshot, consumer không thấy (khác observed=false).' },
    { title: 'Path tail 12', description: 'recent_observed_path chỉ giữ 12 mẫu cuối — path dài hơn bị cắt im lặng.' }
  ],
  simplifications: [
    { sourceBehavior: 'Registry production đầy đủ nhiều camera/track', demoBehavior: 'Demo ≤4 identity, 2 camera, mask/payload thu nhỏ', reason: 'Giữ đúng logic map/filter/sort — scale giảm cho canvas đọc được.' }
  ],
  related: ['camera-age-online-derivation', 'live-freshness-contract', 'parking-episode-apply'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Snapshot chuẩn — lọc exited, gán parked_slot_id', edgeCase: false,
      description: 'gid5 observed qua str-key, gid8 parked nhờ episode, gid9 exited bị lọc; cam ages từ clock 10e9.',
      input: {
        runtime_id: 'rt-001', timestamp: '2026-10-04T10:00:01', published_at: '2026-10-04T10:00:01.500',
        frame_index: 42, source_mode: 'live', camera_skew_ms: 40,
        camera_timestamps_ns: { cam1: 9900000000, cam2: 9940000000 },
        camera_sizes: { cam1: [1280, 720], cam2: [1280, 720] },
        registry: {
          world_unit: 'cm',
          map_vehicles: { '5': { position: { x: 400, y: 60 }, camera_ids: ['cam1'] } },
          identity_lifecycle: {
            '5': { global_id: 5, state: 'active', last_seen_time: 10, last_seen_frame: 42, recent_observed_path: [{ timestamp_s: 9.5, frame_index: 41, camera_id: 'cam1', local_track_id: 3, position: { x: 402, y: 55 } }] },
            '8': { global_id: 8, state: 'parked', last_world: { x: 300, y: 200 }, last_camera: 'cam2', last_seen_time: 8 },
            '9': { global_id: 9, state: 'exited', last_world: { x: 500, y: 50 } }
          },
          retired_global_ids: { '6': 5 },
          recent_events: [{ type: 'global_id_merged', superseded_global_id: 6, global_id: 5 }],
          pending_handoffs: []
        },
        parking_by_camera: {
          cam1: { D01: { occupied: false, status: 'empty' } },
          cam2: { A01: { occupied: true, status: 'occupied', vehicle_id: 8, tracking_state: 'parked', stopped_for_ms: 4000 } }
        },
        parking_episodes: [
          { parking_episode_id: 'ep-1', global_id: 8, slot_id: 'A01', state: 'parked', applied_frame_idx: 40, evidence_frame_idx: 39, applied_timestamp_s: 8, revision: 3 }
        ],
        calibration: { world: { unit: 'cm', bounds: { w: 1200, h: 900 } }, calibration_id: 'cal-1', calibration_status: 'passed', parking_slots_world: { cam1: [{ id: 'D01', polygon: [[1, 2], [3, 4], [5, 6]] }] } },
        applied_monotonic_ns: 10000000000
      },
      expected: {
        vehicle_gids: [5, 8], parked: { '8': 'A01' },
        cameras: { cam1: { age_ms: 100, online: true }, cam2: { age_ms: 60, online: true } },
        slot_count: 2, layout_count: 1
      }
    },
    {
      id: 'edge', title: 'Int-key lookup + path>12 + missing position', edgeCase: true,
      description: 'map_vehicles key int vẫn match; path 15 mẫu → tail 12; xe thiếu position bị lọc hoàn toàn.',
      input: {
        runtime_id: 'rt-002', timestamp: '2026-10-04T10:05:00', frame_index: 7, source_mode: 'live',
        camera_timestamps_ns: { cam1: 5000000000 },
        camera_sizes: { cam1: [1280, 720] },
        registry: {
          world_unit: 'cm',
          map_vehicles: { 5: { position: { x: 10, y: 10 }, camera_ids: ['cam1'] } },
          identity_lifecycle: {
            '5': { global_id: 5, state: 'active', last_seen_time: 5, last_seen_frame: 7, recent_observed_path: (function () { var a = []; for (var i = 0; i < 15; i++) a.push({ timestamp_s: i, frame_index: i, camera_id: 'cam1', local_track_id: 1, position: { x: i, y: i } }); return a; })() },
            '8': { global_id: 8, state: 'active', last_seen_time: 4, last_camera: 'cam1' }
          },
          retired_global_ids: {}, recent_events: [], pending_handoffs: []
        },
        parking_by_camera: { cam1: { D01: { occupied: false, status: 'empty' } } },
        parking_episodes: [],
        calibration: { world: { unit: 'cm', bounds: { w: 100, h: 100 } } },
        applied_monotonic_ns: 5000000000
      },
      expected: {
        vehicle_gids: [5], path_tail: 12, filtered_out: [8], parked: {},
        cameras: { cam1: { age_ms: 0, online: true } }, slot_count: 1
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], out = { slots: [], parked_owners: {}, vehicles: [], cameras: {}, meta: {} };
    F.push(mkFrame('input', ['s1'], 'Input: registry ' + Object.keys(inp.registry.identity_lifecycle).length + ' identity, ' +
      Object.keys(inp.parking_by_camera).length + ' camera parking, ' + inp.parking_episodes.length + ' episode.',
      { runtime_id: inp.runtime_id, frame_index: inp.frame_index },
      [{ label: 'identities', value: Object.keys(inp.registry.identity_lifecycle).length },
       { label: 'episodes', value: inp.parking_episodes.length }],
      { phase: 'input', inp: inp }));
    /* s1 slots */
    Object.keys(inp.parking_by_camera).forEach(function (cam) {
      var st = inp.parking_by_camera[cam];
      Object.keys(st).forEach(function (sid) {
        var o = dc(st[sid]); o.slot_id = sid; o.camera_id = cam; out.slots.push(o);
      });
    });
    F.push(mkFrame('slots', ['s1'], 'Flatten parking_by_camera → ' + out.slots.length + ' slot kèm camera_id.',
      { slots: out.slots }, [{ label: 'slots', value: out.slots.length }],
      { phase: 'slots', inp: inp, out: dc(out) }));
    /* s2 parked_owners */
    inp.parking_episodes.forEach(function (ep) {
      if (ep.state === 'parked') out.parked_owners[ep.global_id] = ep.slot_id;
    });
    F.push(mkFrame('owners', ['s2'], 'parked_owners từ episodes state=parked: ' + JSON.stringify(out.parked_owners) + ' — consumer không tự suy ô đỗ.',
      { parked_owners: out.parked_owners }, [{ label: 'owners', value: Object.keys(out.parked_owners).length }],
      { phase: 'owners', inp: inp, out: dc(out) }));
    /* s3-s6 identity loop */
    var gids = Object.keys(inp.registry.identity_lifecycle).map(Number).sort(function (a, b) { return a - b; });
    var filtered = [];
    gids.forEach(function (gid) {
      var idt = inp.registry.identity_lifecycle[String(gid)];
      var lines = ['s3'];
      var expl, skipped = false;
      if (idt.state === 'exited' || idt.state === 'expired') {
        expl = 'gid' + gid + ' state="' + idt.state + '" → TERMINAL → bỏ khỏi snapshot.';
        filtered.push(gid); skipped = true;
      } else {
        var act = inp.registry.map_vehicles[String(gid)] || inp.registry.map_vehicles[gid] || {};
        var pos = act.position || idt.last_world;
        var okPos = pos && typeof pos === 'object' && typeof pos.x === 'number';
        lines = ['s3', 's4', 's5'];
        if (!okPos) { expl = 'gid' + gid + ': không có position (active.position/last_world đều thiếu) → bị lọc khỏi snapshot.'; filtered.push(gid); skipped = true; }
        else {
          var path = Array.isArray(idt.recent_observed_path) ? idt.recent_observed_path.slice(-12) : undefined;
          var v = {
            global_id: gid, state: idt.state,
            observed: !!act.position,
            position: { x: pos.x, y: pos.y, reference: inp.registry.world_unit },
            parked_slot_id: out.parked_owners[gid] || null,
            last_seen_time: idt.last_seen_time, last_seen_frame: idt.last_seen_frame,
            recent_observed_path: path
          };
          out.vehicles.push(v);
          expl = 'gid' + gid + ' → vehicle: observed=' + v.observed +
            (v.parked_slot_id ? ', parked_slot_id=' + v.parked_slot_id : '') +
            (path ? ', path tail=' + path.length : '');
          lines = ['s3', 's4', 's5', 's6'];
        }
      }
      F.push(mkFrame('v' + gid, lines, expl,
        { vehicles: dc(out.vehicles), filtered: dc(filtered) },
        [{ label: 'vehicles', value: out.vehicles.length }, { label: 'filtered', value: filtered.length }],
        { phase: 'vehicles', inp: inp, out: dc(out), hl: gid, filtered: dc(filtered) }));
    });
    /* s7 cameras */
    var ts = inp.camera_timestamps_ns || {};
    var clock = inp.applied_monotonic_ns != null ? inp.applied_monotonic_ns
      : Math.max.apply(null, Object.keys(ts).map(function (k) { return ts[k]; }).concat([0]));
    Object.keys(inp.camera_sizes || {}).forEach(function (cam) {
      var cap = ts[cam] || 0;
      var diff = clock - cap;
      out.cameras[cam] = {
        camera_id: cam, width: inp.camera_sizes[cam][0], height: inp.camera_sizes[cam][1],
        captured_at_monotonic_ns: cap,
        age_ms: Math.max(0, diff / 1e6),
        online: cap > 0 && diff >= 0 && diff <= 5e9
      };
    });
    F.push(mkFrame('cameras', ['s7'], 'clock=' + clock + ' ns → derive age_ms/online cho ' + Object.keys(out.cameras).length + ' camera.',
      { cameras: dc(out.cameras), clock_ns: clock },
      [{ label: 'clock', value: clock, unit: 'ns' }],
      { phase: 'cameras', inp: inp, out: dc(out) }));
    /* s8 assemble */
    out.meta = { schema_version: 2, runtime_id: inp.runtime_id, frame_index: inp.frame_index, source_mode: inp.source_mode || 'live' };
    F.push(mkFrame('assemble', ['s8'], 'Ghép 17 khóa snapshot v2; vehicles sort global_id: [' +
      out.vehicles.map(function (v) { return v.global_id; }).join(', ') + '].',
      { snapshot_keys: ['schema_version', 'runtime', 'timestamp', 'source_mode', 'coordinate_space', 'cameras', 'parking_slots', 'slot_layout', 'vehicles', 'pending_handoffs', 'parking_episodes', 'retired_global_ids', 'recent_events'] },
      [{ label: 'slots', value: out.slots.length }, { label: 'vehicles', value: out.vehicles.length }],
      { phase: 'done', inp: inp, out: dc(out) }, 1100));

    var result = {
      vehicle_gids: out.vehicles.map(function (v) { return v.global_id; }),
      parked: out.parked_owners,
      cameras: Object.keys(out.cameras).reduce(function (m, k) { m[k] = { age_ms: r2(out.cameras[k].age_ms), online: out.cameras[k].online }; return m; }, {}),
      slot_count: out.slots.length,
      layout_count: (inp.calibration && inp.calibration.parking_slots_world && Object.keys(inp.calibration.parking_slots_world).length) || 0,
      filtered_out: dc(filtered),
      path_tail: out.vehicles[0] && out.vehicles[0].recent_observed_path ? out.vehicles[0].recent_observed_path.length : 0
    };
    var expected = expectedFor(this, scenId, params, function (i2) {
      var e = { vehicle_gids: [], parked: {}, cameras: {}, slot_count: 0, layout_count: 0 };
      Object.keys(i2.parking_by_camera).forEach(function (c) { e.slot_count += Object.keys(i2.parking_by_camera[c]).length; });
      i2.parking_episodes.forEach(function (ep) { if (ep.state === 'parked') e.parked[ep.global_id] = ep.slot_id; });
      var mv = i2.registry.map_vehicles;
      Object.keys(i2.registry.identity_lifecycle).map(Number).forEach(function (g) {
        var idt = i2.registry.identity_lifecycle[String(g)];
        if (idt.state === 'exited' || idt.state === 'expired') { (e.filtered_out = e.filtered_out || []).push(g); return; }
        var act = mv[String(g)] || mv[g] || {};
        var pos = act.position || idt.last_world;
        if (!pos || typeof pos.x !== 'number') { (e.filtered_out = e.filtered_out || []).push(g); return; }
        e.vehicle_gids.push(g);
        if (Array.isArray(idt.recent_observed_path)) e.path_tail = Math.min(12, idt.recent_observed_path.length);
      });
      e.vehicle_gids.sort(function (a, b) { return a - b; });
      var t2 = i2.camera_timestamps_ns || {};
      var cl = i2.applied_monotonic_ns != null ? i2.applied_monotonic_ns : Math.max.apply(null, Object.keys(t2).map(function (k) { return t2[k]; }).concat([0]));
      Object.keys(i2.camera_sizes || {}).forEach(function (c) {
        var cp2 = t2[c] || 0, df = cl - cp2;
        e.cameras[c] = { age_ms: r2(Math.max(0, df / 1e6)), online: cp2 > 0 && df >= 0 && df <= 5e9 };
      });
      if (i2.calibration && i2.calibration.parking_slots_world) e.layout_count = Object.keys(i2.calibration.parking_slots_world).length;
      return e;
    });
    var checks = [
      chk('vehicle_gids sorted', result.vehicle_gids, expected.vehicle_gids),
      chk('parked_owners', result.parked, expected.parked),
      chk('cameras', result.cameras, expected.cameras),
      chk('slot_count', result.slot_count, expected.slot_count)
    ];
    if (expected.filtered_out !== undefined) checks.push(chk('filtered_out', result.filtered_out, expected.filtered_out));
    if (expected.path_tail !== undefined) checks.push(chk('path_tail ≤12', result.path_tail, expected.path_tail));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Snapshot v2 — producer pipeline', 'trái: input · phải: snapshot đang build');
    var out = s.out || {};
    /* cột trái: input */
    var lx = 16, ly = 60;
    T(ctx, 'INPUT', lx, ly, { c: p.muted, sz: 11, w: '700' });
    var names = ['registry', 'parking_by_camera', 'parking_episodes', 'camera_timestamps_ns', 'calibration'];
    names.forEach(function (n, i) {
      var on = s.phase !== 'done';
      BX(ctx, lx, ly + 8 + i * 26, 190, 20, on ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.01)', on && s.phase === n ? p.accent : p.grid);
      T(ctx, n, lx + 8, ly + 22 + i * 26, { c: p.text, sz: 11 });
    });
    /* mũi tên */
    AR(ctx, 212, ly + 60, 240, ly + 60, p.accent, 2);
    /* cột phải: output */
    var rx = 250, ry = 60;
    T(ctx, 'SNAPSHOT v2', rx, ry, { c: p.muted, sz: 11, w: '700' });
    var rows = [
      ['slots', out.slots ? out.slots.length : 0, 'slots'],
      ['parked_owners', out.parked_owners ? Object.keys(out.parked_owners).length : 0, 'owners'],
      ['vehicles', out.vehicles ? out.vehicles.length : 0, 'vehicles'],
      ['cameras', out.cameras ? Object.keys(out.cameras).length : 0, 'cameras'],
      ['schema', out.meta ? 'v2' : '—', 'done']
    ];
    rows.forEach(function (r, i) {
      var hl = (s.phase === r[2]) || (s.phase === 'done' && i < 4) ||
        (s.phase === 'vehicles' && r[0] === 'vehicles') ||
        (s.phase === 'owners' && r[0] === 'parked_owners');
      BX(ctx, rx, ry + 8 + i * 30, 220, 24, hl ? 'rgba(63,206,124,.08)' : 'rgba(255,255,255,.02)', hl ? p.success : p.grid);
      T(ctx, r[0], rx + 8, ry + 24 + i * 30, { c: hl ? p.success : p.muted, sz: 11.5 });
      T(ctx, r[1], rx + 196, ry + 24 + i * 30, { c: p.text, sz: 12, a: 'right', w: '700' });
    });
    /* vehicle cards */
    if (out.vehicles && out.vehicles.length) {
      var vy = ry + 8 + 5 * 30 + 12;
      T(ctx, 'vehicles[] (sort theo gid)', rx, vy, { c: p.muted, sz: 10.5 });
      out.vehicles.forEach(function (v, i) {
        var x = rx + i * 110;
        var hl = s.hl === v.global_id;
        BX(ctx, x, vy + 8, 100, 54, hl ? 'rgba(79,156,247,.12)' : 'rgba(255,255,255,.03)', hl ? p.accent : p.grid);
        T(ctx, 'gid ' + v.global_id, x + 8, vy + 26, { c: p.text, sz: 12, w: '700' });
        T(ctx, v.state + (v.observed ? ' • obs' : ''), x + 8, vy + 42, { c: p.muted, sz: 10 });
        if (v.parked_slot_id) PILL(ctx, x + 8, vy + 56, '→ ' + v.parked_slot_id, p.warning);
      });
    }
    if (s.filtered && s.filtered.length) {
      var fy = ry + 8 + 5 * 30 + 12;
      s.filtered.forEach(function (g, i) {
        PILL(ctx, 16 + i * 74, fy + 74, 'gid' + g + ' ✗', p.danger);
      });
      T(ctx, 'bị lọc (terminal/thiếu position)', 16 + s.filtered.length * 74 + 8, fy + 74, { c: p.muted, sz: 10.5 });
    }
  }
});

/* ---------- A2 camera-age-online-derivation ---------- */
LESSONS.push({
  id: 'camera-age-online-derivation', pack: PACK_ID,
  title: 'Suy ra age_ms/online từ monotonic ns',
  topic: 'Contract & freshness',
  summary: 'Biến hai mốc monotonic_ns per-camera thành chỉ số sức khỏe (age_ms, online) mà mọi consumer kiểm lại.',
  role: 'clock_ns − captured_at_monotonic_ns → age_ms (clamp ≥0) + online ⇔ captured>0 ∧ 0 ≤ diff ≤ 5e9.',
  inputTypes: [
    { name: 'camera_timestamps_ns', type: 'dict cam→ns', description: 'monotonic ns lúc capture' },
    { name: 'camera_sizes', type: 'dict cam→[w,h]', description: 'kích thước frame' },
    { name: 'clock_ns', type: 'int', description: 'applied_monotonic_ns hoặc max(ts)' }
  ],
  outputTypes: [
    { name: 'cameras', type: 'dict cam→{age_ms, online, captured_at_monotonic_ns}', description: 'health derive' }
  ],
  structures: [
    { name: 'camera_timestamps_ns', type: 'dict', description: 'chỉ có nghĩa cùng host' },
    { name: 'cameras', type: 'dict', description: 'health object' }
  ],
  complexity: { time: 'O(C)', space: 'O(C)', variables: 'C = số camera (production 2)', simulation: 'Demo 2–3 cam.' },
  codeRefs: [
    { path: 'backend/main_detect/src/techgar/runtime_contract.py', line: 120, endLine: 132, symbol: 'cameras dict-comprehension', note: '' },
    { path: 'backend/main_detect/two_camera.py', line: 2857, symbol: 'applied_monotonic_ns', note: 'call site' }
  ],
  pseudocode: [
    { id: 'a1', text: 'clock ← applied_monotonic_ns ?? max(ts, 0)' },
    { id: 'a2', text: 'mỗi cam: captured ← ts.get(cam, 0)' },
    { id: 'a3', text: 'age_ms ← max(0, (clock − captured)/1e6)' },
    { id: 'a4', text: 'online ← captured>0 ∧ 0 ≤ clock−captured ≤ 5e9' },
    { id: 'a5', text: 'emit object per cam' }
  ],
  edgeCases: [
    { title: 'captured=0', description: 'Camera chưa capture → online=false, age_ms = clock/1e6 rất lớn.' },
    { title: 'Timestamp tương lai', description: 'diff<0 → age clamp 0 nhưng online=false (online yêu cầu 0≤diff).' },
    { title: 'Cùng host', description: 'monotonic ns không so giữa 2 máy — consumer chỉ đọc age_ms/online đã tính.' }
  ],
  simplifications: [],
  related: ['snapshot-v2-build', 'live-freshness-contract'],
  aliases: [],
  parameters: [
    { key: 'online_window_ms', label: 'Cửa sổ online (ms)', type: 'number', min: 500, max: 30000, step: 500, default: 5000 }
  ],
  scenarios: [
    {
      id: 'normal', title: '3 camera — kể cả chưa từng capture', edgeCase: false,
      description: 'cam1/cam2 online trong cửa sổ; cam3 captured=0 → offline, age_ms rất lớn.',
      input: { clock_ns: 10100000000, camera_timestamps_ns: { cam1: 10000000000, cam2: 9940000000, cam3: 0 }, camera_sizes: { cam1: [1280, 720], cam2: [1280, 720], cam3: [640, 480] } },
      expected: { cam1: { age_ms: 100, online: true }, cam2: { age_ms: 160, online: true }, cam3: { age_ms: 10100, online: false } }
    },
    {
      id: 'edge', title: 'Timestamp tương lai + quá hạn', edgeCase: true,
      description: 'cam1 ts ở tương lai → age clamp 0 nhưng online=false; cam2 diff 6.2s > cửa sổ → offline.',
      input: { clock_ns: 10200000000, camera_timestamps_ns: { cam1: 10300000000, cam2: 4000000000 }, camera_sizes: { cam1: [1280, 720], cam2: [1280, 720] } },
      expected: { cam1: { age_ms: 0, online: false }, cam2: { age_ms: 6200, online: false } }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var win = (params.online_window_ms || 5000) * 1e6;
    var F = [], out = {};
    var clock = inp.clock_ns;
    F.push(mkFrame('clock', ['a1'], 'clock_ns = ' + clock + ' — applied_monotonic_ns hoặc max(ts).',
      { clock_ns: clock }, [{ label: 'clock', value: clock, unit: 'ns' }],
      { phase: 'clock', inp: inp, clock: clock, out: out }));
    Object.keys(inp.camera_sizes).forEach(function (cam, i) {
      var cap = inp.camera_timestamps_ns[cam] || 0;
      var diff = clock - cap;
      var age = Math.max(0, diff / 1e6);
      var online = cap > 0 && diff >= 0 && diff <= win;
      out[cam] = { camera_id: cam, captured_at_monotonic_ns: cap, age_ms: age, online: online };
      var why = cap <= 0 ? 'chưa từng capture' : (diff < 0 ? 'timestamp tương lai' : (diff > win ? 'quá hạn ' + r2(diff / 1e6) + 'ms>' + params.online_window_ms + 'ms' : 'trong cửa sổ'));
      F.push(mkFrame(cam, ['a2', 'a3', 'a4'], cam + ': captured=' + cap + ' → diff=' + r2(diff / 1e6) + 'ms → age_ms=' + r2(age) + ', online=' + online + ' (' + why + ').',
        { cameras: dc(out) },
        [{ label: 'age_ms', value: r2(age), unit: 'ms' }, { label: 'online', value: online }],
        { phase: 'cam', inp: inp, clock: clock, out: dc(out), hl: cam, win: win }));
    });
    F.push(mkFrame('emit', ['a5'], 'Emit cameras{} — consumer chỉ đọc age_ms/online, không tự so ns giữa host.',
      { cameras: dc(out) }, [], { phase: 'done', inp: inp, clock: clock, out: out }));
    var result = {};
    Object.keys(out).forEach(function (k) { result[k] = { age_ms: r2(out[k].age_ms), online: out[k].online }; });
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var w2 = (p2.online_window_ms || 5000) * 1e6, e = {};
      Object.keys(i2.camera_sizes).forEach(function (c) {
        var cp2 = i2.camera_timestamps_ns[c] || 0, df = i2.clock_ns - cp2;
        e[c] = { age_ms: r2(Math.max(0, df / 1e6)), online: cp2 > 0 && df >= 0 && df <= w2 };
      });
      return e;
    });
    var checks = Object.keys(result).map(function (k) { return chk(k + ' {age_ms,online}', result[k], expected[k]); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Timeline monotonic ns → health', 'vạch cam = captured · marker đỏ = clock · vùng xanh = cửa sổ online');
    var out = s.out || {}, cams = Object.keys(s.inp ? s.inp.camera_sizes : {});
    var clock = s.clock || 0;
    var win = s.win || 5e9;
    /* trục thời gian: min ts → clock+ε */
    var t0 = Math.min.apply(null, cams.map(function (c) { return (s.inp.camera_timestamps_ns[c] || clock); }).concat([clock]));
    var t1 = clock + 1;
    if (t1 <= t0) t1 = t0 + 1;
    var x0 = 60, x1 = env.width - 60;
    function sx(t) { return x0 + (t - t0) / (t1 - t0) * (x1 - x0); }
    /* vùng cửa sổ */
    var w0 = Math.max(t0, clock - win);
    BX(ctx, sx(w0), 54, sx(clock) - sx(w0), cams.length * 46 + 20, 'rgba(63,206,124,.06)', null, 4);
    cams.forEach(function (c, i) {
      var y = 90 + i * 46;
      LN(ctx, x0, y, x1, y, p.grid, 1);
      T(ctx, c, 16, y + 4, { c: p.muted, sz: 11.5 });
      var cap = s.inp.camera_timestamps_ns[c] || 0;
      var oc = out[c];
      var onl = oc ? oc.online : false;
      DOT(ctx, sx(Math.max(t0, cap)), y, 6, onl ? p.success : p.danger);
      if (cap > 0) {
        /* đoạn age */
        LN(ctx, sx(cap), y + 12, sx(clock), y + 12, onl ? p.success : p.warning, 2);
        T(ctx, 'age ' + (oc ? r2(oc.age_ms) : '?') + 'ms', sx(cap) + 4, y + 26, { c: p.muted, sz: 10 });
      } else {
        T(ctx, 'captured=0 — chưa từng capture', sx(t0) + 12, y - 8, { c: p.danger, sz: 10.5 });
      }
      if (s.hl === c) PILL(ctx, sx(clock) + 6, y - 10, 'đang tính', p.accent);
    });
    /* clock marker */
    var cy = 70, ch = cams.length * 46;
    LN(ctx, sx(clock), cy - 8, sx(clock), cy + ch + 8, p.danger, 2);
    PILL(ctx, sx(clock) - 34, cy - 16, 'clock_ns', p.danger);
  }
});

/* ---------- A3 live-freshness-contract ---------- */
LESSONS.push({
  id: 'live-freshness-contract', pack: PACK_ID,
  title: 'Kiểm freshness 4 điều kiện (hai consumer)',
  topic: 'Contract & freshness',
  summary: 'Cùng một rule được implement 2 lần (Python gate + TS frontend): schema v2, source_mode live, cameras online tươi, published_at trong cửa sổ.',
  role: 'Gate fail → skip snapshot; FE fail → báo lỗi tiếng Việt + đánh dấu unknown. Fail-closed cả hai phía.',
  inputTypes: [
    { name: 'snapshot', type: 'RuntimeSnapshot/dict', description: 'payload v2 từ A1' },
    { name: 'now', type: 'local clock', description: 'đồng hồ consumer' }
  ],
  outputTypes: [
    { name: 'verdict', type: 'bool | error string', description: 'gate trả False/True; FE trả null hoặc thông báo lỗi VN' }
  ],
  structures: [
    { name: 'cameras', type: 'dict', description: 'không được rỗng; mỗi cam online + age_ms ∈ [0,5000]' },
    { name: 'age_window', type: '[−1s, +5s]', description: 'now − published_at' }
  ],
  complexity: { time: 'O(C)', space: 'O(1)', variables: 'C = camera count', simulation: 'Biến thể published_at & camera health thay vì poll thật.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 103, endLine: 125, symbol: '_fresh_live', note: '+ runtime_id ở :403' },
    { path: 'frontend/src/domain/runtime.ts', line: 116, endLine: 141, symbol: 'liveRuntimeError', note: 'bản TS' }
  ],
  pseudocode: [
    { id: 'f1', text: 'schema_version == 2? (FE: sai → reject)' },
    { id: 'f2', text: 'source_mode == "live"? — replay/demo → reject' },
    { id: 'f3', text: 'cameras là dict không rỗng?' },
    { id: 'f4', text: 'mọi cam: online ∧ age_ms finite ∈ [0,5000]?' },
    { id: 'f5', text: 'age = now − published_at ∈ [−1.0, 5.0] giây?' },
    { id: 'f6', text: 'gate thêm: runtime_id truthy; parse lỗi → False (fail-closed)' }
  ],
  edgeCases: [
    { title: 'Clock lệch host', description: 'Runtime máy khác/NTP lệch >1s → reject toàn bộ — giả định cùng clock (rủi ro đã ghi).' },
    { title: 'Timezone sai', description: '"10:00:01.5+07:00" ≠ "10:00:01.5Z" — offset đổi instant → age 25200s → reject.' },
    { title: 'published_at hỏng', description: 'parse lỗi → gate False, FE reject — fail-closed.' }
  ],
  simplifications: [
    { sourceBehavior: 'Gate chạy trong poll loop, FE chạy mỗi snapshot', demoBehavior: 'So sánh các biến thể published_at/camera trên một snapshot base', reason: 'Dạy điều kiện + bẫy timezone thay vì timing thật.' }
  ],
  related: ['source-mode-live-gating', 'frame-cursor-monotonic-poll', 'camera-age-online-derivation'],
  aliases: ['live-runtime-validator'],
  parameters: [
    { key: 'max_age_s', label: 'Tuổi tối đa published (s)', type: 'number', min: 1, max: 30, step: 0.5, default: 5 },
    { key: 'future_tol_s', label: 'Dung sai tương lai (s)', type: 'number', min: 0, max: 5, step: 0.5, default: 1 }
  ],
  scenarios: [
    {
      id: 'normal', title: 'Accept — kể cả cùng instant khác offset', edgeCase: false,
      description: 'happy_z và same_instant+07 là CÙNG instant (parse offset đúng) → cả hai accept.',
      input: {
        now: '2026-10-04T10:00:02.000Z',
        base: { schema_version: 2, runtime_id: 'rt-001', source_mode: 'live', cameras: { cam1: { online: true, age_ms: 120 }, cam2: { online: true, age_ms: 0 } } },
        variants: [
          { id: 'happy_z', published_at: '2026-10-04T10:00:01.500Z' },
          { id: 'same_instant+07', published_at: '2026-10-04T17:00:01.500+07:00' }
        ]
      },
      expected: { happy_z: 'accept', 'same_instant+07': 'accept' }
    },
    {
      id: 'edge', title: 'Reject — sai múi giờ / tương lai / quá cũ / gate khác', edgeCase: true,
      description: 'wrong_tz nhìn giống giờ địa phương nhưng là instant khác → age 25200s reject; các gate còn lại reject đúng bước.',
      input: {
        now: '2026-10-04T10:00:02.000Z',
        base: { schema_version: 2, runtime_id: 'rt-001', source_mode: 'live', cameras: { cam1: { online: true, age_ms: 120 }, cam2: { online: true, age_ms: 0 } } },
        variants: [
          { id: 'wrong_tz', published_at: '2026-10-04T10:00:01.500+07:00' },
          { id: 'future_1.5s', published_at: '2026-10-04T10:00:03.500Z' },
          { id: 'old_7s', published_at: '2026-10-04T09:59:55.000Z' },
          { id: 'bad_schema', published_at: '2026-10-04T10:00:01.500Z', mutate: { schema_version: 1 } },
          { id: 'replay_mode', published_at: '2026-10-04T10:00:01.500Z', mutate: { source_mode: 'replay' } },
          { id: 'empty_cams', published_at: '2026-10-04T10:00:01.500Z', mutate: { cameras: {} } },
          { id: 'cam_offline', published_at: '2026-10-04T10:00:01.500Z', mutate: { cam2_offline: true } }
        ]
      },
      expected: { wrong_tz: 'reject:window', 'future_1.5s': 'reject:window', old_7s: 'reject:window', bad_schema: 'reject:schema', replay_mode: 'reject:source_mode', empty_cams: 'reject:cameras', cam_offline: 'reject:cam_health' }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var now = isoS(inp.now);
    var maxAge = params.max_age_s != null ? params.max_age_s : 5;
    var futTol = params.future_tol_s != null ? params.future_tol_s : 1;
    var F = [], verdicts = {};

    function evalSnap(snap) {
      /* trả {verdict:'accept'|'reject:gateN', detail} */
      if (snap.schema_version !== 2) return { verdict: 'reject:schema', detail: 'schema_version=' + snap.schema_version };
      if (snap.source_mode !== 'live') return { verdict: 'reject:source_mode', detail: 'source_mode=' + snap.source_mode };
      var cams = snap.cameras;
      if (!cams || typeof cams !== 'object' || !Object.keys(cams).length) return { verdict: 'reject:cameras', detail: 'cameras rỗng' };
      for (var k in cams) {
        var c = cams[k];
        if (c.online !== true || typeof c.age_ms !== 'number' || !isFinite(c.age_ms) || c.age_ms < 0 || c.age_ms > 5000)
          return { verdict: 'reject:cam_health', detail: k + ' online=' + c.online + ' age=' + c.age_ms };
      }
      var pt = isoS(snap.published_at);
      var age = now - pt;
      if (!isFinite(pt) || age < -futTol || age > maxAge)
        return { verdict: 'reject:window', detail: 'age=' + r2(age) + 's ∉ [−' + futTol + ', ' + maxAge + ']' };
      if (!snap.runtime_id) return { verdict: 'reject:runtime_id', detail: 'runtime_id rỗng' };
      return { verdict: 'accept', detail: 'age=' + r2(age) + 's ∈ cửa sổ' };
    }

    inp.variants.forEach(function (v, i) {
      var snap = dc(inp.base);
      snap.published_at = v.published_at;
      if (v.mutate) {
        if (v.mutate.schema_version !== undefined) snap.schema_version = v.mutate.schema_version;
        if (v.mutate.source_mode) snap.source_mode = v.mutate.source_mode;
        if (v.mutate.cameras) snap.cameras = v.mutate.cameras;
        if (v.mutate.cam2_offline) snap.cameras.cam2 = { online: false, age_ms: 9999 };
      }
      var r = evalSnap(snap);
      verdicts[v.id] = r.verdict;
      var lines = r.verdict === 'accept' ? ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']
        : r.verdict === 'reject:schema' ? ['f1']
        : r.verdict === 'reject:source_mode' ? ['f1', 'f2']
        : r.verdict === 'reject:cameras' ? ['f1', 'f2', 'f3']
        : r.verdict === 'reject:cam_health' ? ['f1', 'f2', 'f3', 'f4']
        : ['f1', 'f2', 'f3', 'f4', 'f5'];
      F.push(mkFrame(v.id, lines, v.id + ' → ' + r.verdict + ' — ' + r.detail +
        (v.id === 'wrong_tz' ? ' (cùng chữ "10:00:01.5" nhưng +07:00 đổi instant → 7h lệch)' : ''),
        { variant: v.id, verdict: r.verdict, detail: r.detail, verdicts: dc(verdicts) },
        [{ label: 'verdict', value: r.verdict }],
        { phase: 'eval', inp: inp, now: now, verdicts: dc(verdicts), hl: v.id, maxAge: maxAge, futTol: futTol }));
    });
    F.push(mkFrame('summary', ['f1'], 'Verdict toàn bộ biến thể: ' + JSON.stringify(verdicts) + ' — cùng rule ở gate(Python) và FE(TS).',
      { verdicts: verdicts }, [], { phase: 'done', inp: inp, now: now, verdicts: verdicts, maxAge: maxAge, futTol: futTol }));

    var result = verdicts;
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var e = {};
      var n2 = isoS(i2.now), ma = p2.max_age_s != null ? p2.max_age_s : 5, ft = p2.future_tol_s != null ? p2.future_tol_s : 1;
      i2.variants.forEach(function (v) {
        var sn = dc(i2.base); sn.published_at = v.published_at;
        if (v.mutate) {
          if (v.mutate.schema_version !== undefined) sn.schema_version = v.mutate.schema_version;
          if (v.mutate.source_mode) sn.source_mode = v.mutate.source_mode;
          if (v.mutate.cameras) sn.cameras = v.mutate.cameras;
          if (v.mutate.cam2_offline) sn.cameras.cam2 = { online: false, age_ms: 9999 };
        }
        var vv;
        if (sn.schema_version !== 2) vv = 'reject:schema';
        else if (sn.source_mode !== 'live') vv = 'reject:source_mode';
        else if (!sn.cameras || !Object.keys(sn.cameras).length) vv = 'reject:cameras';
        else {
          vv = 'accept';
          for (var k in sn.cameras) {
            var c = sn.cameras[k];
            if (c.online !== true || typeof c.age_ms !== 'number' || !isFinite(c.age_ms) || c.age_ms < 0 || c.age_ms > 5000) { vv = 'reject:cam_health'; break; }
          }
          if (vv === 'accept') {
            var pt2 = isoS(sn.published_at), a2 = n2 - pt2;
            if (!isFinite(pt2) || a2 < -ft || a2 > ma) vv = 'reject:window';
            else if (!sn.runtime_id) vv = 'reject:runtime_id';
          }
        }
        e[v.id] = vv;
      });
      return e;
    });
    var checks = Object.keys(result).map(function (k) { return chk(k, result[k], expected[k]); });
    /* invariant: cùng instant (offset khác) phải cùng verdict */
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Cửa sổ freshness — 6 gate xếp hàng', 'xanh: pass · đỏ: reject tại gate');
    var verdicts = s.verdicts || {};
    var variants = (s.inp && s.inp.variants) || [];
    var gates = ['schema', 'source_mode', 'cameras', 'cam_health', 'window', 'runtime_id'];
    /* checklist các gate */
    var gx = 16, gy = 60;
    gates.forEach(function (g, i) {
      T(ctx, 'G' + (i + 1) + ' ' + g, gx, gy + i * 22, { c: p.muted, sz: 11 });
    });
    variants.forEach(function (v, vi) {
      var x = gx + 150 + vi * 96;
      T(ctx, v.id, x, gy - 10, { c: s.hl === v.id ? p.accent : p.muted, sz: 10.5, w: s.hl === v.id ? '700' : '400' });
      var vd = verdicts[v.id];
      gates.forEach(function (g, gi) {
        var pass = vd === 'accept' || (vd && vd !== 'reject:' + g && gates.indexOf(vd.replace('reject:', '')) > gi);
        var failed = vd === 'reject:' + g;
        var c = vd == null ? p.grid : failed ? p.danger : (pass && (vd === 'accept' || gates.indexOf(vd.replace('reject:', '')) > gi)) ? p.success : p.grid;
        DOT(ctx, x + 8, gy + gi * 22 - 4, 5, c);
      });
      if (vd) {
        var ok = vd === 'accept';
        PILL(ctx, x - 6, gy + gates.length * 22 + 4, ok ? 'ACCEPT' : vd.replace('reject:', '✗ '), ok ? p.success : p.danger);
      }
    });
    /* timeline age window */
    var wy = gy + gates.length * 22 + 50;
    var now = s.now || 0, ma = s.maxAge || 5, ft = s.futTol || 1;
    var wx0 = 60, wx1 = env.width - 60;
    var span = 12; /* hiển thị ±12s quanh now */
    function sx(t) { return wx0 + (t - (now - span)) / (2 * span) * (wx1 - wx0); }
    LN(ctx, wx0, wy, wx1, wy, p.grid, 1);
    BX(ctx, sx(now - ma), wy - 12, sx(now + ft) - sx(now - ma), 24, 'rgba(63,206,124,.10)', p.success, 4);
    T(ctx, 'cửa sổ [now−' + ma + 's, now+' + ft + 's]', sx(now - ma) + 4, wy - 16, { c: p.success, sz: 10 });
    LN(ctx, sx(now), wy - 14, sx(now), wy + 14, p.danger, 1.5);
    T(ctx, 'now', sx(now) + 4, wy - 16, { c: p.danger, sz: 10 });
    variants.forEach(function (v) {
      if (!v.published_at) return;
      var pt = isoS(v.published_at);
      if (!isFinite(pt)) return;
      var vd = verdicts[v.id];
      var within = pt >= now - ma && pt <= now + ft;
      DOT(ctx, sx(pt), wy, 5, within ? (vd === 'accept' ? p.success : p.warning) : p.danger);
      if (s.hl === v.id) PILL(ctx, sx(pt) + 6, wy - 22, v.id, p.accent);
    });
  }
});

/* ---------- A4 source-mode-live-gating ---------- */
LESSONS.push({
  id: 'source-mode-live-gating', pack: PACK_ID,
  title: 'Cờ --live-mode quyết định source_mode',
  topic: 'Contract & freshness',
  summary: 'Một bit trạng thái điều khiển toàn chuỗi: replay có --live-mode được nhận như camera thật; thiếu cờ → nhãn "replay" → gate/FE reject.',
  role: 'source_mode = "live" nếu live_mode OR không có replay; ngược lại "replay". Đây là điểm nghẽn E2E số 1 trong runbook.',
  inputTypes: [
    { name: 'args.live_mode', type: 'bool', description: 'cờ CLI --live-mode' },
    { name: 'replay', type: 'ReplaySession|null', description: 'session replay nếu có' },
    { name: 'args.replay_realtime', type: 'bool', description: 'pace theo timestamp ghi (độc lập)' }
  ],
  outputTypes: [
    { name: 'source_mode', type: '"live"|"replay"', description: 'nhãn trong snapshot (A1 bước 10)' },
    { name: 'consumer verdict', type: 'accept/reject', description: 'A3 bước 2' }
  ],
  structures: [{ name: 'flags', type: 'bool ×2', description: 'live_mode và replay_realtime độc lập' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '—', simulation: 'Toggle 2 cờ; pacing tính due.' },
  codeRefs: [
    { path: 'backend/main_detect/two_camera.py', line: 2856, symbol: 'source_mode=...', note: '' },
    { path: 'backend/main_detect/two_camera.py', line: 1746, endLine: 1750, symbol: '--live-mode arg', note: '' },
    { path: 'backend/main_detect/two_camera.py', line: 2496, endLine: 2499, symbol: 'replay-realtime pacing', note: '' }
  ],
  pseudocode: [
    { id: 'g1', text: 'if live_mode OR replay is None → source_mode="live"' },
    { id: 'g2', text: 'else → "replay"' },
    { id: 'g3', text: '(phụ) --replay-realtime: due = wall_started + (src_now − src_started)' },
    { id: 'g4', text: 'consumer: A3-f2 reject nếu source_mode != "live"' }
  ],
  edgeCases: [
    { title: 'Docs thiếu --live-mode', description: 'Runbook §6 replay thiếu cờ → session không sinh — lỗi docs thật, không phải bug code.' },
    { title: 'live+replay cùng', description: '--live-mode + replay vẫn nhãn "live"; published_at=now → freshness pass.' },
    { title: '2 cờ độc lập', description: '--replay-realtime chỉ chỉnh nhịp phát, không đổi nhãn source_mode.' }
  ],
  simplifications: [],
  related: ['live-freshness-contract', 'replay-timestamp-pairing'],
  aliases: [],
  parameters: [
    { key: 'live_mode', label: '--live-mode', type: 'boolean', default: false },
    { key: 'replay_realtime', label: '--replay-realtime', type: 'boolean', default: true }
  ],
  scenarios: [
    {
      id: 'normal', title: 'Replay thiếu --live-mode → reject', edgeCase: false,
      description: 'live_mode=false + có replay → source_mode="replay" → A3 reject: "Nguồn dữ liệu không phải camera realtime".',
      input: { replay: 'session_2026_09_05', pacing: { wall_started: 1000, src_started_s: 0, src_now_s: 60 } },
      expected: { source_mode: 'replay', gate_verdict: 'reject:source_mode', due_s: 1060 }
    },
    {
      id: 'edge', title: '--live-mode bật trên replay → nhận như live', edgeCase: true,
      defaultParams: { live_mode: true },
      description: 'live_mode=true → source_mode="live" dù đang replay → pass gate 2; banner demo-mode.',
      input: { replay: 'session_2026_09_05', pacing: { wall_started: 1000, src_started_s: 0, src_now_s: 60 } },
      expected: { source_mode: 'live', gate_verdict: 'accept', due_s: 1060 }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var live = !!params.live_mode;
    var hasReplay = !!inp.replay;
    var mode = (live || !hasReplay) ? 'live' : 'replay';
    var verdict = mode === 'live' ? 'accept' : 'reject:source_mode';
    var pace = inp.pacing || {};
    var due = pace.wall_started + (pace.src_now_s - pace.src_started_s);
    var F = [];
    F.push(mkFrame('flags', ['g1', 'g2'],
      'live_mode=' + live + ', replay=' + (hasReplay ? '"' + inp.replay + '"' : 'None') +
      ' → source_mode="' + mode + '"' + (mode === 'live' && hasReplay ? ' — replay được nhận như live (demo-mode)' : ''),
      { live_mode: live, replay: hasReplay ? inp.replay : null, source_mode: mode },
      [{ label: 'source_mode', value: mode }],
      { phase: 'mode', live: live, hasReplay: hasReplay, mode: mode, realtime: !!params.replay_realtime }));
    F.push(mkFrame('verdict', ['g4'],
      'Consumer gate/FE bước A3-f2: source_mode != "live" → ' + (verdict === 'accept' ? 'PASS, tiếp tục freshness' : 'REJECT — "Nguồn dữ liệu không phải camera realtime"') + '.',
      { gate_verdict: verdict },
      [{ label: 'gate verdict', value: verdict }],
      { phase: 'verdict', live: live, hasReplay: hasReplay, mode: mode, verdict: verdict }));
    if (params.replay_realtime) {
      F.push(mkFrame('pacing', ['g3'],
        '--replay-realtime: due = ' + pace.wall_started + ' + (' + pace.src_now_s + ' − ' + pace.src_started_s + ') = ' + due + 's — ngủ tới wall ' + due + ' (nhịp độc lập với nhãn).',
        { due_s: due },
        [{ label: 'due', value: due, unit: 's' }],
        { phase: 'pacing', live: live, hasReplay: hasReplay, mode: mode, verdict: verdict, realtime: true, pace: pace, due: due }));
    } else {
      F.push(mkFrame('pacing-off', ['g3'],
        'Không --replay-realtime → bỏ nhánh pacing: due=null, replay phát nhanh nhất CPU cho phép (không ngủ theo timestamp ghi). Nhãn source_mode và verdict consumer KHÔNG đổi — 2 cờ độc lập.',
        { due_s: null },
        [{ label: 'due', value: 'null — không pace' }],
        { phase: 'pacing-off', live: live, hasReplay: hasReplay, mode: mode, verdict: verdict, realtime: false }));
    }
    var result = { source_mode: mode, gate_verdict: verdict, due_s: params.replay_realtime ? due : null };
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var m2 = (p2.live_mode || !i2.replay) ? 'live' : 'replay';
      var pc = i2.pacing || {};
      return { source_mode: m2, gate_verdict: m2 === 'live' ? 'accept' : 'reject:source_mode', due_s: p2.replay_realtime ? pc.wall_started + (pc.src_now_s - pc.src_started_s) : null };
    });
    var checks = [chk('source_mode', result.source_mode, expected.source_mode), chk('gate_verdict', result.gate_verdict, expected.gate_verdict), chk('due_s', result.due_s, expected.due_s)];
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Flag → source_mode → verdict consumer', '');
    /* toggles */
    var x = 30, y = 80;
    [['--live-mode', s.live], ['--replay-realtime', s.realtime !== false]].forEach(function (t2, i) {
      var on = t2[1];
      BX(ctx, x + i * 190, y - 22, 170, 34, on ? 'rgba(63,206,124,.12)' : 'rgba(255,255,255,.03)', on ? p.success : p.grid, 8);
      DOT(ctx, x + i * 190 + 18, y - 5, 6, on ? p.success : p.muted);
      T(ctx, t2[0], x + i * 190 + 34, y, { c: on ? p.text : p.muted, sz: 13, w: '600' });
    });
    BX(ctx, x + 380, y - 22, 190, 34, 'rgba(255,255,255,.03)', p.grid, 8);
    T(ctx, 'replay: ' + (s.hasReplay ? 'có session' : 'None'), x + 394, y, { c: p.muted, sz: 12 });
    /* arrow + mode chip */
    AR(ctx, x + 30, y + 30, x + 30, y + 62, p.accent, 2);
    var mc = s.mode === 'live' ? p.success : p.warning;
    BX(ctx, x, y + 66, 230, 40, 'rgba(0,0,0,.3)', mc, 8);
    T(ctx, 'source_mode = "' + (s.mode || '?') + '"', x + 14, y + 91, { c: mc, sz: 15, w: '700' });
    if (s.mode === 'live' && s.hasReplay) PILL(ctx, x + 240, y + 80, 'demo-mode (replay→live)', p.warning);
    /* consumer cards */
    var cy = y + 140;
    [['Gate :8000', s.verdict], ['Frontend', s.verdict]].forEach(function (t2, i) {
      var ok = t2[1] === 'accept';
      var c = s.phase === 'mode' ? p.grid : (ok ? p.success : p.danger);
      BX(ctx, x + i * 270, cy, 250, 60, 'rgba(255,255,255,.03)', c, 8);
      T(ctx, t2[0], x + i * 270 + 12, cy + 20, { c: p.muted, sz: 11 });
      T(ctx, s.phase === 'mode' ? '…' : (ok ? 'PASS freshness' : 'REJECT — không phải camera realtime'), x + i * 270 + 12, cy + 42, { c: c, sz: 12, w: '600' });
    });
    /* pacing bar */
    if (s.phase === 'pacing' && s.pace) {
      var py = cy + 96;
      T(ctx, 'pacing --replay-realtime', x, py, { c: p.muted, sz: 11 });
      var p0 = s.pace.wall_started, p1 = s.due;
      var px0 = x + 30, px1 = env.width - 60;
      var k = (px1 - px0) / Math.max(1, p1 - p0 + 10);
      LN(ctx, px0, py + 30, px1, py + 30, p.grid, 2);
      DOT(ctx, px0, py + 30, 6, p.accent); T(ctx, 'wall_start ' + p0 + 's', px0 - 8, py + 52, { c: p.muted, sz: 10 });
      DOT(ctx, px0 + (p1 - p0) * k, py + 30, 7, p.success); T(ctx, 'due ' + p1 + 's', px0 + (p1 - p0) * k - 10, py + 52, { c: p.success, sz: 10 });
      AR(ctx, px0 + 20, py + 30, px0 + (p1 - p0) * k - 8, py + 30, p.warning, 1.5);
    }
    if (s.phase === 'pacing-off') {
      var oy = cy + 96;
      BX(ctx, x, oy + 14, 420, 30, 'rgba(255,255,255,.03)', p.grid, 7);
      T(ctx, 'pacing OFF — phát nhanh tối đa, due=null', x + 12, oy + 34, { c: p.muted, sz: 12 });
    }
  }
});

/* ---------- A5 frame-cursor-monotonic-poll ---------- */
LESSONS.push({
  id: 'frame-cursor-monotonic-poll', pack: PACK_ID,
  title: 'Cursor frame_index monotone + poll/retry/dedupe',
  topic: 'Contract & freshness',
  summary: 'Polling 4–5Hz qua HTTP không có ordering guarantee — cursor frame_index chặn xử lý lùi; cùng frame vẫn áp episode mới rồi return.',
  role: 'Gate: stale drop, same-frame episode-only, runtime restart reset cursor. FE: runtime_id đổi → reset, frame lùi → throw, stall 5s → "không có frame mới".',
  inputTypes: [
    { name: 'polls[]', type: 'array snapshot', description: '{frame_index, runtime_id, vehicles, parking_episodes}' },
    { name: 'cursor', type: 'int|null', description: 'last_frame_index' }
  ],
  outputTypes: [
    { name: 'verdict per poll', type: 'process|episode-only|drop', description: '+ cursor mới' }
  ],
  structures: [
    { name: 'last_frame_index', type: 'int|null', description: 'cursor gate' },
    { name: 'runtimeCursorRef', type: '{runtimeId,frameIndex}', description: 'cursor FE' },
    { name: 'pendingSnapshot/retryAfter', type: 'Promise|ms', description: 'FE dedupe + retry 2s' }
  ],
  complexity: { time: 'O(1)/poll', space: 'O(1)', variables: 'ngoài xử lý snapshot', simulation: 'Chuỗi poll cố định; bỏ fetch/timeout thật.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 426, endLine: 454, symbol: 'frame_index cursor', note: '' },
    { path: 'backend/gate_session_controller.py', line: 893, endLine: 906, symbol: 'poll loop + retry', note: '' },
    { path: 'frontend/src/app/App.tsx', line: 272, endLine: 287, symbol: 'requireLiveRuntime', note: 'FE cursor' },
    { path: 'frontend/src/api/runtimeApi.ts', line: 4, endLine: 36, symbol: 'pendingSnapshot dedupe', note: 'retry 2s' }
  ],
  pseudocode: [
    { id: 'c1', text: 'frame_index ← int() nếu số else None' },
    { id: 'c2', text: 'same_frame ← frame_index == last' },
    { id: 'c3', text: 'frame_index < last → drop (stale)' },
    { id: 'c4', text: 'last ← frame_index; remember snapshot; alias+episodes' },
    { id: 'c5', text: 'same_frame → return (episode đã áp, skip motion evidence)' },
    { id: 'c6', text: 'process vehicles[] (crossing/parked)' },
    { id: 'c7', text: 'poll: timeout 3s; lỗi → sleep ≥1s; ok → sleep poll' },
    { id: 'c8', text: 'FE: runtime đổi → reset cursor; frame lùi → throw; >5s không frame mới → throw' },
    { id: 'c9', text: 'FE fetch: retryAfter → reject nhanh; pendingSnapshot → share' }
  ],
  edgeCases: [
    { title: 'Runtime restart', description: 'runtime_id mới → gate reset toàn bộ cursor/positions — tránh kẹt cursor đời cũ.' },
    { title: 'frame_index không số', description: 'None → không dedup được (vẫn process) — legacy tolerance.' },
    { title: 'Mất frame 5s', description: 'Poll 200 OK nhưng frame_index đứng yên → FE báo "không có frame mới trong 5 giây".' }
  ],
  simplifications: [
    { sourceBehavior: 'HTTP poll thật với timeout/retry', demoBehavior: 'Chuỗi snapshot cố định; chỉ mô phỏng verdict cursor', reason: 'Dạy ordering/idempotent — không cần network.' }
  ],
  related: ['live-freshness-contract', 'parking-episode-apply', 'canonical-runtime-id-consumer'],
  aliases: ['frame-cursor-guard', 'runtime-request-coalesce'],
  parameters: [
    { key: 'poll_s', label: 'Poll interval (s)', type: 'number', min: 0.1, max: 2, step: 0.05, default: 0.25 },
    { key: 'stall_s', label: 'Ngưỡng "không frame mới" (s)', type: 'number', min: 1, max: 30, step: 1, default: 5 }
  ],
  scenarios: [
    {
      id: 'normal', title: 'Chuỗi 5 poll — process / episode-only / stale', edgeCase: false,
      description: 'f10 process → f10 same-frame chỉ áp episode → f11 → f10 lùi → drop → f11 same.',
      input: {
        runtime_id: 'rt-1',
        polls: [
          { frame_index: 10, vehicles: [{ global_id: 5, position: { x: 400, y: 60 }, observed: true }] },
          { frame_index: 10, parking_episodes: [{ parking_episode_id: 'ep-1', global_id: 5, slot_id: 'D01', state: 'parked', applied_frame_idx: 10, evidence_frame_idx: 9, applied_timestamp_s: 5, revision: 1 }], vehicles: [] },
          { frame_index: 11, vehicles: [{ global_id: 5, position: { x: 410, y: 62 }, observed: true }] },
          { frame_index: 10, vehicles: [{ global_id: 5, position: { x: 0, y: 0 }, observed: true }] },
          { frame_index: 11, vehicles: [{ global_id: 5, position: { x: 410, y: 63 }, observed: true }] }
        ]
      },
      expected: { verdicts: ['process', 'episode-only', 'process', 'drop', 'episode-only'], last: 11 }
    },
    {
      id: 'edge', title: 'Runtime restart reset + frame không số', edgeCase: true,
      description: 'runtime_id đổi → reset cursor (frame nhỏ hơn vẫn process); frame_index "abc" → None → vẫn process (không dedup).',
      input: {
        runtime_id: 'rt-1',
        polls: [
          { frame_index: 40, vehicles: [] },
          { runtime_id: 'rt-2', frame_index: 12, vehicles: [{ global_id: 7, position: { x: 1, y: 1 }, observed: true }] },
          { runtime_id: 'rt-2', frame_index: 'abc', vehicles: [{ global_id: 7, position: { x: 2, y: 1 }, observed: true }] },
          { runtime_id: 'rt-2', frame_index: 'abc', vehicles: [] }
        ]
      },
      expected: { verdicts: ['process', 'process(runtime-reset)', 'process(no-cursor)', 'process(no-cursor)'], last: 12 }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], last = null, runtime = inp.runtime_id;
    var verdicts = [];
    inp.polls.forEach(function (snap, i) {
      var rid = snap.runtime_id || inp.runtime_id;
      var fi = typeof snap.frame_index === 'number' && isFinite(snap.frame_index) ? snap.frame_index : null;
      var same = fi !== null && fi === last;
      var reset = rid !== runtime;
      var verdict, lines = ['c1'], expl;
      if (reset) {
        runtime = rid; last = null;
        verdict = 'process(runtime-reset)';
        expl = 'runtime_id ' + rid + ' ≠ ' + (snap._prevRuntime || 'trước') + ' → RESET cursor toàn bộ (gate :411-424) → process dù frame nhỏ.';
        lines = ['c4', 'c6', 'c8'];
      } else if (fi === null) {
        verdict = 'process(no-cursor)';
        expl = 'frame_index không phải số → None → không dedup được — vẫn process (legacy tolerance).';
        lines = ['c1', 'c6'];
      } else if (last !== null && fi < last) {
        verdict = 'drop';
        expl = 'frame_index ' + fi + ' < cursor ' + last + ' → drop stale — không đụng vehicles (evidence cũ bị source_time skip phía B3).';
        lines = ['c1', 'c3'];
      } else if (same) {
        verdict = 'episode-only';
        expl = 'same_frame (' + fi + ' == ' + last + ') → vẫn áp parking_episodes (D1) rồi return — KHÔNG đếm crossing/parked evidence.';
        lines = ['c1', 'c2', 'c4', 'c5'];
      } else {
        verdict = 'process';
        expl = 'frame ' + fi + ' > cursor ' + (last == null ? 'None' : last) + ' → remember + xử lý ' + ((snap.vehicles || []).length) + ' vehicle.';
        lines = ['c1', 'c4', 'c6'];
      }
      if (verdict === 'drop') { /* không update */ }
      else if (fi !== null) { last = fi; }
      verdicts.push(verdict);
      F.push(mkFrame('poll' + (i + 1), lines, 'poll' + (i + 1) + ': ' + expl,
        { poll: i + 1, frame_index: snap.frame_index, cursor: last, verdict: verdict, verdicts: dc(verdicts) },
        [{ label: 'fi', value: snap.frame_index }, { label: 'cursor', value: last == null ? 'None' : last }, { label: 'verdict', value: verdict }],
        { phase: 'poll', idx: i, polls: inp.polls, verdicts: dc(verdicts), cursor: last, hl: i, runtime: runtime },
        Math.round((params.poll_s || 0.25) * 2000))); /* poll_s → nhịp phát demo */
    });
    F.push(mkFrame('done', ['c7', 'c9'], 'Cuối chuỗi: cursor=' + last + '. FE side: frame lùi sẽ throw "frame cũ hơn"; stall >' + (params.stall_s || 5) + 's → "không có frame mới".',
      { last: last, verdicts: verdicts }, [{ label: 'cursor cuối', value: last }],
      { phase: 'done', polls: inp.polls, verdicts: verdicts, cursor: last }));
    var result = { verdicts: verdicts, last: last };
    var expected = expectedFor(this, scenId, params, function (i2) {
      var l2 = null, rt = i2.runtime_id, vs = [];
      i2.polls.forEach(function (sn) {
        var r2id = sn.runtime_id || i2.runtime_id;
        var f2 = typeof sn.frame_index === 'number' && isFinite(sn.frame_index) ? sn.frame_index : null;
        if (r2id !== rt) { rt = r2id; l2 = null; vs.push('process(runtime-reset)'); if (f2 !== null) l2 = f2; return; }
        if (f2 === null) { vs.push('process(no-cursor)'); return; }
        if (l2 !== null && f2 < l2) { vs.push('drop'); return; }
        if (f2 === l2) { vs.push('episode-only'); return; }
        vs.push('process'); l2 = f2;
      });
      return { verdicts: vs, last: l2 };
    });
    var checks = [chk('verdicts', result.verdicts, expected.verdicts), chk('cursor cuối', result.last, expected.last)];
    /* invariant: verdict ∈ tập hợp hợp lệ */
    checks.push({ label: 'verdict hợp lệ', pass: result.verdicts.every(function (v) { return /^(process|drop|episode-only)/.test(v); }), actual: result.verdicts, expected: 'process|drop|episode-only' });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Conveyor snapshot → cursor gate', 'xanh process · vàng episode-only · đỏ drop · tím reset');
    var polls = s.polls || [], vds = s.verdicts || [];
    var cw = Math.min(120, (env.width - 60) / Math.max(1, polls.length) - 8);
    var y = 110;
    var cx = s.cursor == null ? 'None' : s.cursor;
    PILL(ctx, env.width - 150, 50, 'cursor = ' + cx, p.accent);
    polls.forEach(function (sn, i) {
      var x = 24 + i * (cw + 10);
      var vd = vds[i];
      var c = vd === 'process' ? p.success : vd === 'episode-only' ? p.warning : vd === 'drop' ? p.danger : vd ? p.accent : p.grid;
      var hl = s.hl === i;
      BX(ctx, x, y, cw, 74, hl ? 'rgba(79,156,247,.12)' : 'rgba(255,255,255,.03)', hl ? p.accent : c, 8);
      T(ctx, 'poll ' + (i + 1), x + 8, y + 18, { c: p.muted, sz: 10 });
      T(ctx, 'fi=' + String(sn.frame_index), x + 8, y + 36, { c: p.text, sz: 13, w: '700' });
      var nv = (sn.vehicles || []).length, ne = (sn.parking_episodes || []).length;
      T(ctx, nv + ' veh' + (ne ? ' · ' + ne + ' ep' : ''), x + 8, y + 52, { c: p.muted, sz: 10 });
      if (sn.runtime_id) T(ctx, sn.runtime_id, x + 8, y + 66, { c: '#c99cff', sz: 9.5 });
      if (vd) PILL(ctx, x + 4, y + 88, vd, c);
      if (i < polls.length - 1) AR(ctx, x + cw + 2, y + 37, x + cw + 8, y + 37, p.grid, 1.5);
    });
    /* FE hints */
    var fy = y + 130;
    T(ctx, 'FE (requireLiveRuntime): runtime đổi → reset cursor · frame lùi → throw · stall ' + '→ "không có frame mới"', 24, fy, { c: p.muted, sz: 11 });
    T(ctx, 'FE fetch: pendingSnapshot share + retryAfter 2s khi lỗi', 24, fy + 18, { c: p.muted, sz: 11 });
  }
});

/* =================================================================
 * NHÓM B — Crossing hình học & continuity (B1–B6)
 * ================================================================= */
var ENTRY_GATE = { p1: { x: 39.6688, y: 8.9029 }, p2: { x: 38.8685, y: -5.9998 }, direction: 'positive' };
var EXIT_GATE = { p1: { x: 50.8338, y: 63.3703 }, p2: { x: 49.3925, y: 51.4338 }, direction: 'negative' };

/* ---------- B1 segment-intersection-orientation ---------- */
LESSONS.push({
  id: 'segment-intersection-orientation', pack: PACK_ID,
  title: 'Giao cắt đoạn bằng 4 orientation',
  topic: 'Crossing cổng',
  summary: 'Nguyên thủy hình học quyết định "đoạn di chuyển p1→p2 của xe có cắt đoạn cổng p3→p4 không" — 4 cross-product, tích ≤0.',
  role: 'orient(a,b,c) = (b.x−a.x)(c.y−a.y) − (b.y−a.y)(c.x−a.x); return o1·o2 ≤ 0 AND o3·o4 ≤ 0.',
  inputTypes: [
    { name: 'p1,p2', type: 'point', description: 'đoạn di chuyển của xe' },
    { name: 'p3,p4', type: 'point', description: 'đoạn vạch cổng' }
  ],
  outputTypes: [{ name: 'intersect', type: 'bool', description: 'true kể cả chạm đầu mút (≤0)' }],
  structures: [{ name: 'orientations', type: '4 scalar', description: 'cross product có dấu' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '4 phép nhân trừ mỗi orientation', simulation: 'Giữ nguyên — pure math.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 229, endLine: 239, symbol: 'check_line_intersection', note: 'closure orientation' }
  ],
  pseudocode: [
    { id: 'o1', text: 'orient(a,b,c) = (b.x−a.x)(c.y−a.y) − (b.y−a.y)(c.x−a.x)' },
    { id: 'o2', text: 'o1..o4 = orient(p1,p2,p3), orient(p1,p2,p4), orient(p3,p4,p1), orient(p3,p4,p2)' },
    { id: 'o3', text: 'return o1·o2 ≤ 0 AND o3·o4 ≤ 0' }
  ],
  edgeCases: [
    { title: 'Chạm đầu mút', description: '≤0 chứ không <0 — endpoint nằm đúng vạch (dyadic .5 → residual = 0 chính xác) vẫn tính cắt.' },
    { title: 'Float residual ±1e-14', description: 'Điểm nằm trên vạch với tọa độ không dyadic → residual lật dấu tích → False dù toán học nằm trên — quirk thật của implementation, demo giữ nguyên.' },
    { title: 'Collinear overlap', description: 'Toán học mọi orient=0 → True, nhưng fixture cụ thể trả False do residual — phụ thuộc tọa độ, không suy rộng.' }
  ],
  simplifications: [],
  related: ['directed-crossing-direction', 'measured-path-entry-rescue'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Cắt thật vs không cắt', edgeCase: false,
      description: 'cross (35,0)→(45,0) cắt vạch; miss (35,0)→(38,0) không tới.',
      input: { gate: { p1: { x: 40, y: 9 }, p2: { x: 39, y: -6 } }, moves: [
        { id: 'cross', p: [{ x: 35, y: 0 }, { x: 45, y: 0 }] },
        { id: 'miss', p: [{ x: 35, y: 0 }, { x: 38, y: 0 }] }
      ] },
      expected: { cross: true, miss: false }
    },
    {
      id: 'edge', title: 'Touch endpoint + collinear float-quirk', edgeCase: true,
      description: 'touch: endpoint (39.5,1.5) nằm đúng vạch t=0.5 dyadic → orient=0.0 chính xác → True; collinear: 2 điểm nằm trên đường nhưng residual float → False.',
      input: { gate: { p1: { x: 40, y: 9 }, p2: { x: 39, y: -6 } }, moves: [
        { id: 'touch', p: [{ x: 35, y: 0 }, { x: 39.5, y: 1.5 }] },
        { id: 'collinear', p: [{ x: 39.9, y: 7.5 }, { x: 39.3, y: -1.5 }] }
      ] },
      expected: { touch: true, collinear: false }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], verdicts = {};
    inp.moves.forEach(function (mv) {
      var ix = segIntersect(mv.p[0], mv.p[1], inp.gate.p1, inp.gate.p2);
      verdicts[mv.id] = ix.intersect;
      var expl = mv.id + ': o1=' + r2(ix.o1) + ' o2=' + r2(ix.o2) + ' o3=' + r2(ix.o3) + ' o4=' + r2(ix.o4) +
        ' → ' + (ix.intersect ? 'INTERSECT' : 'không cắt');
      if (mv.id === 'collinear') expl += ' — quirk float: residual ±1e-14 lật dấu tích dù 2 điểm nằm trên đường.';
      if (mv.id === 'touch') expl += ' — endpoint trên vạch (dyadic) → orient = 0.0 chính xác.';
      F.push(mkFrame(mv.id, ['o1', 'o2', 'o3'], expl,
        { move: mv.id, orientations: { o1: ix.o1, o2: ix.o2, o3: ix.o3, o4: ix.o4 }, verdict: ix.intersect, verdicts: dc(verdicts) },
        [{ label: 'o1', value: r2(ix.o1) }, { label: 'o2', value: r2(ix.o2) },
         { label: 'o3', value: r2(ix.o3) }, { label: 'o4', value: r2(ix.o4) },
         { label: 'verdict', value: ix.intersect }],
        { phase: 'eval', gate: inp.gate, moves: inp.moves, cur: mv, verdicts: dc(verdicts), o: ix }));
    });
    F.push(mkFrame('done', ['o3'], 'Verdict: ' + JSON.stringify(verdicts),
      { verdicts: verdicts }, [], { phase: 'done', gate: inp.gate, moves: inp.moves, verdicts: verdicts }));
    var result = verdicts;
    var expected = expectedFor(this, scenId, params, function (i2) {
      var e = {};
      i2.moves.forEach(function (mv) { e[mv.id] = segIntersect(mv.p[0], mv.p[1], i2.gate.p1, i2.gate.p2).intersect; });
      return e;
    });
    var checks = Object.keys(result).map(function (k) { return chk(k, result[k], expected[k]); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Bản đồ vạch cổng + đoạn di chuyển', 'xanh dương: gate · vàng: move đang xét');
    var bounds = { x0: 30, y0: -8, x1: 50, y1: 12 };
    var m = wfit(bounds, 30, 60, env.width * 0.55, env.height - 90);
    /* grid */
    for (var gx = Math.ceil(bounds.x0); gx <= bounds.x1; gx += 5)
      LN(ctx, m.tx(gx), m.ty(bounds.y0), m.tx(gx), m.ty(bounds.y1), p.grid, .5);
    for (var gy = Math.ceil(bounds.y0); gy <= bounds.y1; gy += 5)
      LN(ctx, m.tx(bounds.x0), m.ty(gy), m.tx(bounds.x1), m.ty(gy), p.grid, .5);
    gateSeg(ctx, m, s.gate, '#4f9cf7', 'gate');
    (s.moves || []).forEach(function (mv) {
      var isCur = s.cur && s.cur.id === mv.id;
      var c = isCur ? p.warning : 'rgba(255,255,255,.25)';
      AR(ctx, m.tx(mv.p[0].x), m.ty(mv.p[0].y), m.tx(mv.p[1].x), m.ty(mv.p[1].y), c, isCur ? 2.5 : 1.5);
      DOT(ctx, m.tx(mv.p[0].x), m.ty(mv.p[0].y), 3, c);
      if (s.verdicts && s.verdicts[mv.id] !== undefined) {
        PILL(ctx, m.tx(mv.p[0].x), m.ty(mv.p[0].y) - 14, mv.id + '=' + s.verdicts[mv.id], s.verdicts[mv.id] ? p.success : p.danger);
      } else if (isCur) {
        PILL(ctx, m.tx(mv.p[0].x), m.ty(mv.p[0].y) - 14, mv.id, p.warning);
      }
    });
    /* bảng orientation */
    if (s.o) {
      var rows = [['o1', r2(s.o.o1)], ['o2', r2(s.o.o2)], ['o3', r2(s.o.o3)], ['o4', r2(s.o.o4)]];
      var tx = env.width * 0.62, ty = 80;
      T(ctx, 'orientations (dấu quyết định)', tx, ty - 12, { c: p.muted, sz: 11 });
      rows.forEach(function (r, i) {
        var neg = r[1] < 0;
        BX(ctx, tx, ty + i * 30, 170, 24, 'rgba(255,255,255,.03)', neg ? p.danger : (r[1] === 0 ? p.warning : p.success), 6);
        T(ctx, r[0], tx + 8, ty + i * 30 + 16, { c: p.muted, sz: 11 });
        T(ctx, String(r[1]), tx + 150, ty + i * 30 + 16, { c: neg ? p.danger : (r[1] === 0 ? p.warning : p.success), sz: 12, a: 'right', w: '700' });
      });
      var vd = s.cur && s.verdicts ? s.verdicts[s.cur.id] : null;
      if (vd !== null && vd !== undefined) {
        BX(ctx, tx, ty + 4 * 30 + 8, 170, 34, vd ? 'rgba(63,206,124,.12)' : 'rgba(242,85,90,.12)', vd ? p.success : p.danger, 8);
        T(ctx, vd ? 'INTERSECT' : 'NO INTERSECT', tx + 85, ty + 4 * 30 + 30, { c: vd ? p.success : p.danger, sz: 13, a: 'center', w: '700' });
      }
    }
  }
});

/* ---------- B2 directed-crossing-direction ---------- */
LESSONS.push({
  id: 'directed-crossing-direction', pack: PACK_ID,
  title: 'Chiều cắt qua cross product + direction',
  topic: 'Crossing cổng',
  summary: 'Biến giao cắt hình học thành sự kiện có hướng — cùng một vạch, đi vào ≠ đi ra. d = v×g, so dấu với direction trong config.',
  role: 'v = new−old, g = p2−p1, d = v.x·g.y − v.y·g.x; |d|<1e-9 → False; positive → d>0, negative → d<0.',
  inputTypes: [
    { name: 'p_old, p_new', type: 'point', description: 'đoạn di chuyển' },
    { name: 'gate{p1,p2,direction}', type: 'gate', description: 'direction ∈ {positive,negative} từ config' }
  ],
  outputTypes: [{ name: 'accept', type: 'bool', description: 'cắt đúng chiều' }],
  structures: [
    { name: 'v,g', type: 'vector2D', description: 'vector move và vector gate' },
    { name: 'd', type: 'scalar có dấu', description: 'cross 2D v×g' }
  ],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '—', simulation: 'Giữ nguyên — pure math.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 242, endLine: 256, symbol: 'get_crossing_direction', note: 'gate config direction từ gate_zones.json' }
  ],
  pseudocode: [
    { id: 'd1', text: '!check_line_intersection → False' },
    { id: 'd2', text: 'v ← new−old; g ← g.p2−g.p1; d ← v.x·g.y − v.y·g.x' },
    { id: 'd3', text: '|d| < 1e-9 → False (song song/trùng phương)' },
    { id: 'd4', text: 'positive → d>0; negative → d<0' }
  ],
  edgeCases: [
    { title: 'Trùng phương vạch', description: 'd≈0 → reject — đúng logic nhưng làm lỡ exit nếu path nằm đúng trên vạch (file-mode).' },
    { title: 'Dấu phụ thuộc thứ tự p1→p2', description: 'Đổi đầu vạch đảo nghĩa positive — vì vậy direction nằm trong config, không suy ra được.' },
    { title: 'Đi ngược chiều', description: 'Quay đầu sau khi vào → reject → không tạo/xóa session.' }
  ],
  simplifications: [],
  related: ['entry-session-creation', 'exit-crossing-session-delete', 'gate-config-validate-save', 'segment-intersection-orientation'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Đi vào vs đi ra — cùng vạch entry positive', edgeCase: false,
      description: 'into: (44,1)→(36,1) cho d=+119.22 accept; outof ngược → d=−119.22 reject.',
      input: { gate: dc(ENTRY_GATE), cases: [
        { id: 'into', old: { x: 44, y: 1 }, nw: { x: 36, y: 1 } },
        { id: 'outof', old: { x: 36, y: 1 }, nw: { x: 44, y: 1 } }
      ] },
      expected: { into: true, outof: false }
    },
    {
      id: 'edge', title: 'Collinear trên vạch + song song lệch', edgeCase: true,
      description: 'collinear_on_gate: 2 điểm nằm đúng đường gate (v=0.6·g) → intersect=False (residual) ∧ |d|<1e-9 — loại kép; parallel_off: v=g nguyên vẹn nhưng lệch đường → không cắt.',
      input: { gate: dc(ENTRY_GATE), cases: [
        { id: 'collinear_on_gate', old: { x: 39.50874, y: 5.92236 }, nw: { x: 39.02856, y: -3.01926 } },
        { id: 'parallel_off', old: { x: 44, y: 8 }, nw: { x: 43.1997, y: -6.9027 } }
      ] },
      expected: { collinear_on_gate: false, parallel_off: false }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], verdicts = {};
    inp.cases.forEach(function (cs) {
      var r = crossDir(cs.old, cs.nw, inp.gate);
      verdicts[cs.id] = r.ok;
      var reason = !r.intersect ? 'không cắt vạch (bước 1)'
        : Math.abs(r.d) < 1e-9 ? '|d|≈0 trùng phương'
        : (inp.gate.direction === 'positive' ? (r.d > 0 ? 'd>0 khớp positive' : 'd<0 sai chiều positive')
          : (r.d < 0 ? 'd<0 khớp negative' : 'd>0 sai chiều negative'));
      F.push(mkFrame(cs.id, ['d1', 'd2', 'd3', 'd4'],
        cs.id + ': intersect=' + r.intersect + ', d=' + r2(r.d) + ' → ' + (r.ok ? 'ACCEPT' : 'reject') + ' — ' + reason + '.',
        { case: cs.id, intersect: r.intersect, d: r.d, verdict: r.ok, verdicts: dc(verdicts) },
        [{ label: 'intersect', value: r.intersect }, { label: 'd', value: r2(r.d) }, { label: 'accept', value: r.ok }],
        { phase: 'eval', gate: inp.gate, cases: inp.cases, cur: cs, verdicts: dc(verdicts), d: r.d, ix: r.intersect }));
    });
    F.push(mkFrame('done', ['d4'], 'Verdict: ' + JSON.stringify(verdicts) + ' — direction thuộc config, không suy từ hình học.',
      { verdicts: verdicts }, [], { phase: 'done', gate: inp.gate, cases: inp.cases, verdicts: verdicts }));
    var result = verdicts;
    var expected = expectedFor(this, scenId, params, function (i2) {
      var e = {};
      i2.cases.forEach(function (cs) { e[cs.id] = crossDir(cs.old, cs.nw, i2.gate).ok; });
      return e;
    });
    var checks = Object.keys(result).map(function (k) { return chk(k, result[k], expected[k]); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Vạch có hướng + vector di chuyển', 'mũi tên tím: hướng "positive" của gate (từ config)');
    var g = s.gate;
    var xs = [g.p1.x, g.p2.x], ys = [g.p1.y, g.p2.y];
    (s.cases || []).forEach(function (c) { xs.push(c.old.x, c.nw.x); ys.push(c.old.y, c.nw.y); });
    var bounds = { x0: Math.min.apply(null, xs) - 4, y0: Math.min.apply(null, ys) - 4, x1: Math.max.apply(null, xs) + 4, y1: Math.max.apply(null, ys) + 4 };
    var narrow = env.width < 520;
    /* map chiếm phần lớn canvas; panel/legend tách hàng riêng bên dưới (mobile) hoặc cột phải (desktop) */
    var mapW = narrow ? env.width - 32 : env.width * 0.58;
    var mapH = narrow ? env.height * 0.56 : env.height - 80;
    var m = wfit(bounds, 16, 52, mapW, mapH);
    gateSeg(ctx, m, g, '#4f9cf7', 'gate ' + g.direction);
    /* normal arrow hiển thị "positive side" */
    var gv = { x: g.p2.x - g.p1.x, y: g.p2.y - g.p1.y };
    var gl = Math.hypot(gv.x, gv.y) || 1;
    var nx = -gv.y / gl, ny = gv.x / gl;
    var mx = (g.p1.x + g.p2.x) / 2, my = (g.p1.y + g.p2.y) / 2;
    var tipX = m.tx(mx - nx * 3), tipY = m.ty(my - ny * 3);
    AR(ctx, m.tx(mx), m.ty(my), tipX, tipY, '#c99cff', 2);
    T(ctx, 'phía d>0', Math.max(6, Math.min(tipX + 4, env.width - 56)), Math.max(58, Math.min(tipY, 52 + mapH)), { c: '#c99cff', sz: 10 });
    /* vector các case — không dán nhãn trên điểm để tránh chồng */
    (s.cases || []).forEach(function (c) {
      var isCur = s.cur && s.cur.id === c.id;
      var col = isCur ? p.warning : 'rgba(255,255,255,.28)';
      AR(ctx, m.tx(c.old.x), m.ty(c.old.y), m.tx(c.nw.x), m.ty(c.nw.y), col, isCur ? 2.5 : 1.5);
      DOT(ctx, m.tx(c.old.x), m.ty(c.old.y), 3, col);
    });
    /* hàng verdict — mỗi case một pill, tách hàng rõ */
    var lx = narrow ? 16 : 16 + mapW + 20, ly = narrow ? 52 + mapH + 24 : 76;
    if (!narrow) T(ctx, 'verdicts', lx, ly - 8, { c: p.muted, sz: 11 });
    var pillY = narrow ? ly : ly + 12;
    (s.cases || []).forEach(function (c, ci) {
      var vd = s.verdicts && s.verdicts[c.id];
      var isCur = s.cur && s.cur.id === c.id;
      var txt = c.id + (vd !== undefined ? '=' + vd : '');
      var col = vd !== undefined ? (vd ? p.success : p.danger) : (isCur ? p.warning : p.muted);
      var pw = txt.length * 6.4 + 14;
      if (narrow) {
        /* mobile: xếp ngang, wrap xuống hàng nếu tràn */
        if (lx + pw > env.width - 8) { lx = 16; pillY += 24; }
        PILL(ctx, lx, pillY, txt, col);
        lx += pw + 10;
      } else {
        PILL(ctx, lx, pillY + ci * 26, txt, col);
      }
    });
    /* panel d — cột phải desktop / dòng text dưới cùng mobile */
    if (s.cur) {
      if (narrow) {
        T(ctx, 'd = ' + (s.d == null ? '—' : r2(s.d)) + ' · gate: ' + g.direction + ' · |d|≥1e-9?',
          16, pillY + 24, { c: s.d > 0 ? p.success : (s.d < 0 ? p.danger : p.warning), sz: 12, w: '600' });
      } else {
        var bx = 16 + mapW + 20, by = 150, bw = Math.min(210, env.width - bx - 12);
        BX(ctx, bx, by, bw, 54, 'rgba(255,255,255,.03)', p.grid, 8);
        T(ctx, 'v × g có dấu', bx + 12, by + 16, { c: p.muted, sz: 10 });
        T(ctx, 'd = ' + (s.d == null ? '—' : r2(s.d)), bx + 12, by + 36, { c: s.d > 0 ? p.success : (s.d < 0 ? p.danger : p.warning), sz: 15, w: '700' });
        T(ctx, 'gate: ' + g.direction, bx + 12, by + 48, { c: p.muted, sz: 10 });
      }
    }
  }
});

/* ---------- B3 observation-continuity-window ---------- */
LESSONS.push({
  id: 'observation-continuity-window', pack: PACK_ID,
  title: 'Cửa sổ liên tục ≤1s (hai clock)',
  topic: 'Crossing cổng',
  summary: 'Chỉ evidence liên tục mới tính crossing — hai clock: local monotonic (poll) và source_time (frame thật); stale source bị skip không update.',
  role: 'observed ∧ prev≠None ∧ (now−prev_obs)≤1s ∧ (0<source_gap≤1s) → continuous; source_time ≤ prev_src → continue (không update gì).',
  inputTypes: [
    { name: 'vehicle{observed,last_seen_time}', type: 'object', description: 'per poll' },
    { name: 'prev_position/observed_at/source_time', type: 'state', description: 'baseline của lần trước' },
    { name: 'now', type: 'local monotonic', description: 'đồng hồ controller' }
  ],
  outputTypes: [
    { name: 'observation_is_continuous', type: 'bool', description: 'đủ điều kiện xét crossing' }
  ],
  structures: [
    { name: 'previous_positions', type: 'map gid→point', description: '' },
    { name: 'prev_observed_at / prev_source', type: 'map gid→float', description: 'hai clock riêng' }
  ],
  complexity: { time: 'O(1)/xe', space: 'O(1)', variables: '—', simulation: 'Chuỗi poll cố định với clock inject.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 473, endLine: 493, symbol: 'observation_is_continuous', note: '' },
    { path: 'backend/gate_session_controller.py', line: 537, endLine: 543, symbol: 'cập nhật baseline', note: '' }
  ],
  pseudocode: [
    { id: 'w1', text: 'source_time ← float(last_seen_time) nếu finite else None' },
    { id: 'w2', text: 'observed ∧ source_time ≤ prev_source → continue (stale, không update)' },
    { id: 'w3', text: 'source_is_cont ← source_time=None OR 0 < gap ≤ 1.0' },
    { id: 'w4', text: 'obs_is_cont ← observed ∧ prev_pos≠None ∧ prev_obs≠None ∧ (now−prev_obs)≤1.0 ∧ source_is_cont' },
    { id: 'w5', text: 'observed → cập nhật prev_pos/obs_at/source; source None → xóa prev_source' }
  ],
  edgeCases: [
    { title: 'observed=false không update', description: 'Lần thấy lại sau >1s → discontinuous → crossing bị bỏ qua (nguyên nhân lỡ exit).' },
    { title: 'source_time=None', description: 'Snapshot thiếu last_seen_time → source_is_cont mặc định true → chỉ còn rào local 1s.' },
    { title: 'Teleport vẫn continuous', description: 'Không có rào quãng đường — nhảy xa vẫn pass nếu clock ổn; nếu đoạn teleport cắt vạch đúng chiều → crossing giả (rủi ro đã ghi).' }
  ],
  simplifications: [],
  related: ['entry-session-creation', 'exit-crossing-session-delete', 'frame-cursor-monotonic-poll'],
  aliases: [],
  parameters: [
    { key: 'max_gap_s', label: 'Cửa sổ liên tục (s)', type: 'number', min: 0.25, max: 5, step: 0.25, default: 1 }
  ],
  scenarios: [
    {
      id: 'normal', title: '5 poll — baseline/stale-skip/discontinuous/continuous', edgeCase: false,
      description: 'Xe cắt cổng ở poll2; poll3 source_time lặp → stale-skip không update; poll4 local gap 1.75s → discontinuous nhưng vẫn update baseline.',
      input: {
        gate: dc(ENTRY_GATE),
        polls: [
          { t_local: 10.0, observed: true, last_seen_time: 50.0, position: { x: 44, y: 1 } },
          { t_local: 10.25, observed: true, last_seen_time: 50.2, position: { x: 36, y: 1 } },
          { t_local: 10.5, observed: true, last_seen_time: 50.2, position: { x: 30, y: 1 } },
          { t_local: 12.0, observed: true, last_seen_time: 50.4, position: { x: 20, y: 1 } },
          { t_local: 12.25, observed: true, last_seen_time: 50.6, position: { x: 10, y: 1 } }
        ]
      },
      expected: {
        verdicts: ['baseline', 'continuous(crossing into)', 'stale-skip', 'discontinuous(update)', 'continuous'],
        prev_after: [{ obs_at: 10.0, src: 50.0 }, { obs_at: 10.25, src: 50.2 }, { obs_at: 10.25, src: 50.2 }, { obs_at: 12.0, src: 50.4 }, { obs_at: 12.25, src: 50.6 }]
      }
    },
    {
      id: 'edge', title: 'observed=false gap + teleport không rào', edgeCase: true,
      description: 'poll2 observed=false → không update baseline; poll4 teleport xa nhưng clock ổn → vẫn continuous (không có rào quãng đường — rủi ro thật).',
      input: {
        gate: dc(ENTRY_GATE),
        polls: [
          { t_local: 10.0, observed: true, last_seen_time: 50.0, position: { x: 44, y: 1 } },
          { t_local: 10.5, observed: false, last_seen_time: 50.2, position: null },
          { t_local: 10.75, observed: true, last_seen_time: 50.3, position: { x: 40, y: 1 } },
          { t_local: 11.0, observed: true, last_seen_time: 50.4, position: { x: 200, y: 1 } }
        ]
      },
      expected: {
        verdicts: ['baseline', 'not-observed(skip update)', 'continuous', 'continuous(teleport — không rào quãng đường)'],
        prev_after: [{ obs_at: 10.0, src: 50.0 }, { obs_at: 10.0, src: 50.0 }, { obs_at: 10.75, src: 50.3 }, { obs_at: 11.0, src: 50.4 }]
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var gap = params.max_gap_s != null ? params.max_gap_s : 1.0;
    var F = [], prev = { pos: null, obs_at: null, src: null };
    var verdicts = [], prevs = [];
    inp.polls.forEach(function (pv, i) {
      var st = typeof pv.last_seen_time === 'number' && isFinite(pv.last_seen_time) ? pv.last_seen_time : null;
      var now = pv.t_local;
      var verdict, lines, expl;
      if (pv.observed && st !== null && prev.src !== null && st <= prev.src) {
        verdict = 'stale-skip'; lines = ['w1', 'w2'];
        expl = 'source_time ' + st + ' ≤ prev_src ' + prev.src + ' → continue — KHÔNG update gì (baseline giữ nguyên).';
      } else if (!pv.observed) {
        verdict = 'not-observed(skip update)'; lines = ['w1', 'w4'];
        expl = 'observed=false → obs_is_cont=false và baseline KHÔNG update (prev giữ ' + prev.obs_at + ').';
      } else {
        var localGap = prev.obs_at === null ? null : now - prev.obs_at;
        var srcGap = st !== null && prev.src !== null ? st - prev.src : null;
        var srcCont = st === null || (prev.src !== null && srcGap !== null && srcGap > 0 && srcGap <= gap);
        var cont = pv.observed && prev.pos !== null && prev.obs_at !== null && localGap !== null && localGap <= gap && srcCont;
        var tp = prev.pos && pv.position && (Math.abs(pv.position.x - prev.pos.x) > 50 || Math.abs(pv.position.y - prev.pos.y) > 50);
        if (prev.obs_at === null) {
          verdict = 'baseline'; expl = 'prev=None → đặt baseline, không xét crossing.';
        } else if (cont) {
          verdict = 'continuous';
          var cr = pv.position && prev.pos ? crossDir(prev.pos, pv.position, inp.gate) : null;
          if (cr && cr.ok) verdict += '(crossing ' + (cr.d > 0 ? 'into' : 'outof') + ')';
          if (tp) verdict += '(teleport — không rào quãng đường)';
          expl = 'local_gap=' + r2(localGap) + 's ≤ ' + gap + ' ∧ src_gap=' + (srcGap == null ? 'None' : r2(srcGap)) + ' → continuous' +
            (cr && cr.ok ? ' → đoạn ' + JSON.stringify(prev.pos) + '→' + JSON.stringify(pv.position) + ' CẮT vạch' : '');
          if (tp) expl += ' — nhảy xa nhưng không có rào quãng đường → vẫn continuous.';
        } else {
          verdict = 'discontinuous(update)';
          expl = 'local_gap=' + r2(localGap) + 's > ' + gap + ' (hoặc src_gap lỗi) → discontinuous — baseline vẫn update vì observed.';
        }
        lines = ['w1', 'w3', 'w4'];
      }
      verdicts.push(verdict);
      /* update baseline chỉ khi observed (và không stale-skip) */
      if (pv.observed && verdict !== 'stale-skip') {
        prev = { pos: pv.position, obs_at: now, src: st === null ? prev.src : st };
        if (st === null) prev.src = prev.src;
      }
      prevs.push(dc(prev));
      F.push(mkFrame('poll' + (i + 1), lines.concat(['w5']), 'poll' + (i + 1) + ' @' + now + 's: ' + verdict + ' — ' + expl,
        { poll: i + 1, t: now, verdict: verdict, prev: dc(prev), verdicts: dc(verdicts), prevs: dc(prevs) },
        [{ label: 'local gap', value: prev.obs_at != null && verdict !== 'baseline' ? r2(now - prev.obs_at) : '—', unit: 's' },
         { label: 'verdict', value: verdict }],
        { phase: 'poll', idx: i, polls: inp.polls, gate: inp.gate, verdicts: dc(verdicts), prev: dc(prev), hl: i, gap: gap }));
    });
    F.push(mkFrame('done', ['w5'], 'Bảng verdict: ' + verdicts.join(' | ') + '. Baseline cập nhật kể cả khi discontinuous — chỉ stale-skip giữ nguyên.',
      { verdicts: verdicts }, [], { phase: 'done', polls: inp.polls, verdicts: verdicts }));
    var result = { verdicts: verdicts, prev_after: prevs.map(function (p) { return { obs_at: p.obs_at, src: p.src }; }) };
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var g = p2.max_gap_s != null ? p2.max_gap_s : 1.0;
      var pr = { pos: null, obs_at: null, src: null }, vs = [], pa = [];
      i2.polls.forEach(function (pv) {
        var st = typeof pv.last_seen_time === 'number' && isFinite(pv.last_seen_time) ? pv.last_seen_time : null;
        var v;
        if (pv.observed && st !== null && pr.src !== null && st <= pr.src) v = 'stale-skip';
        else if (!pv.observed) v = 'not-observed(skip update)';
        else if (pr.obs_at === null) v = 'baseline';
        else {
          var lg = pv.t_local - pr.obs_at;
          var sg = st !== null && pr.src !== null ? st - pr.src : null;
          var scont = st === null || (pr.src !== null && sg !== null && sg > 0 && sg <= g);
          var cont = pv.observed && pr.pos !== null && lg <= g && scont;
          if (cont) {
            v = 'continuous';
            var cr = crossDir(pr.pos, pv.position, i2.gate);
            if (cr.ok) v += '(crossing ' + (cr.d > 0 ? 'into' : 'outof') + ')';
            if (Math.abs(pv.position.x - pr.pos.x) > 50 || Math.abs(pv.position.y - pr.pos.y) > 50) v += '(teleport — không rào quãng đường)';
          } else v = 'discontinuous(update)';
        }
        vs.push(v);
        if (pv.observed && v !== 'stale-skip') pr = { pos: pv.position, obs_at: pv.t_local, src: st };
        pa.push({ obs_at: pr.obs_at, src: pr.src });
      });
      return { verdicts: vs, prev_after: pa };
    });
    var checks = [chk('verdicts', result.verdicts, expected.verdicts), chk('prev sau từng poll', result.prev_after, expected.prev_after)];
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Hai clock: local monotonic vs source_time', 'gap ≤ ngưỡng → xanh · stale → cam · discont → đỏ');
    var polls = s.polls || [], vds = s.verdicts || [];
    var cw = Math.min(150, (env.width - 40) / Math.max(1, polls.length) - 8);
    var y = 80;
    polls.forEach(function (pv, i) {
      var x = 20 + i * (cw + 8);
      var vd = vds[i] || '';
      var c = vd.indexOf('continuous') === 0 || vd.indexOf('crossing') >= 0 ? p.success
        : vd.indexOf('stale') === 0 ? p.warning
        : vd.indexOf('baseline') === 0 ? p.accent
        : vd.indexOf('not-observed') === 0 ? p.muted
        : vd ? p.danger : p.grid;
      var hl = s.hl === i;
      BX(ctx, x, y, cw, 88, hl ? 'rgba(79,156,247,.12)' : 'rgba(255,255,255,.03)', hl ? p.accent : c, 8);
      T(ctx, 'poll ' + (i + 1), x + 8, y + 16, { c: p.muted, sz: 10 });
      T(ctx, 't=' + pv.t_local + 's', x + 8, y + 34, { c: p.text, sz: 12, w: '700' });
      T(ctx, 'src=' + (pv.last_seen_time == null ? 'None' : pv.last_seen_time), x + 8, y + 50, { c: p.muted, sz: 10.5 });
      T(ctx, pv.observed ? 'observed' : 'NOT observed', x + 8, y + 66, { c: pv.observed ? p.success : p.muted, sz: 10.5 });
      if (vd) T(ctx, vd.split('(')[0], x + 8, y + 82, { c: c, sz: 9.5, w: '700' });
    });
    /* map mini đoạn di chuyển */
    var pts = [];
    polls.forEach(function (pv) { if (pv.position) pts.push(pv.position); });
    if (pts.length >= 2 && s.gate) {
      var xs = pts.map(function (q) { return q.x; }).concat([s.gate.p1.x, s.gate.p2.x]);
      var ys = pts.map(function (q) { return q.y; }).concat([s.gate.p1.y, s.gate.p2.y]);
      var b = { x0: Math.min.apply(null, xs) - 4, y0: Math.min.apply(null, ys) - 6, x1: Math.max.apply(null, xs) + 4, y1: Math.max.apply(null, ys) + 6 };
      var m = wfit(b, 30, y + 120, env.width * 0.45, env.height - y - 150);
      gateSeg(ctx, m, s.gate, '#4f9cf7', 'entry');
      for (var i = 1; i < polls.length; i++) {
        var a = polls[i - 1].position, b2 = polls[i].position;
        if (!a || !b2) continue;
        AR(ctx, m.tx(a.x), m.ty(a.y), m.tx(b2.x), m.ty(b2.y), 'rgba(240,169,60,.55)', 1.5);
      }
      polls.forEach(function (pv, i) {
        if (!pv.position) return;
        DOT(ctx, m.tx(pv.position.x), m.ty(pv.position.y), i === s.hl ? 6 : 4, i === s.hl ? p.warning : '#e8ecf4');
      });
    }
  }
});

/* ---------- B4 entry-session-creation ---------- */
LESSONS.push({
  id: 'entry-session-creation', pack: PACK_ID,
  title: 'Entry crossing → tạo session idempotent',
  topic: 'Crossing cổng',
  summary: 'Sự kiện vật lý "xe cắt cổng vào đúng chiều" → session logic duy nhất per (gid, runtime); dedup scan trả sessionId cũ khi cắt lại.',
  role: 'direct = obs_is_cont ∧ crossed_valid; rescued = observed ∧ no-session ∧ measured_path_rescue. create_session dedup cùng gid+runtime mở.',
  inputTypes: [
    { name: 'vehicle{global_id,position,observed,recent_observed_path}', type: 'object', description: '' },
    { name: 'previous_position', type: 'point|null', description: 'baseline B3' },
    { name: 'entry_gate', type: 'gate', description: 'direction positive' },
    { name: 'runtime_id', type: 'str', description: 'dedup scope' }
  ],
  outputTypes: [
    { name: 'session_id', type: 'str', description: 'mới hoặc hiện có (idempotent)' }
  ],
  structures: [
    { name: 'session', type: 'dict ~18 field', description: 'WAITING_FOR_SCAN, revision=1, qrExpiresAt=+120s' },
    { name: 'sessions store', type: 'dict sid→session', description: 'dedup scan O(N)' }
  ],
  complexity: { time: 'O(N_sessions) dedup + O(P log P) rescue', space: 'O(N)', variables: 'N sessions, P ≤ 12 path mẫu', simulation: 'token giả cố định thay secrets CSPRNG.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 498, endLine: 521, symbol: 'direct/rescued entry → create_session', note: '' },
    { path: 'backend/session_manager.py', line: 255, endLine: 313, symbol: 'create_session', note: 'dedup :273-281, token :283' }
  ],
  pseudocode: [
    { id: 'e1', text: 'direct ← obs_is_cont ∧ crossed_in_valid_direction(prev,pos,entry)' },
    { id: 'e2', text: 'rescued ← observed ∧ session=None ∧ measured_path_rescue ≠ None' },
    { id: 'e3', text: 'direct ∨ rescued ∧ session=None → sid = create_session(gid, runtime)' },
    { id: 'e4', text: 'create_session: quét sessions — mở cùng gid+runtime → trả sid cũ (idempotent)' },
    { id: 'e5', text: 'else sid = token_urlsafe(12); ghi WAITING_FOR_SCAN rev=1 qrExpiresAt=+120s' }
  ],
  edgeCases: [
    { title: 'Cắt 2 lần', description: 'Xe lùi-vào-lại → dedup trả cùng sid → không nhân bản QR.' },
    { title: 'Session runtime khác', description: 'runtimeId khác → _matches_runtime false → tạo session mới; runtimeId=None khớp mọi runtime.' },
    { title: 'GID đổi sau merge', description: 'Session gắn gid cũ được remap ở D3 trước khi dedup tìm gid mới.' }
  ],
  simplifications: [
    { sourceBehavior: 'secrets.token_urlsafe(12) CSPRNG ~16 ký tự', demoBehavior: 'Token giả cố định "demo-token-…" — phần được mô phỏng là dedup/FSM', reason: 'Không claim port CSPRNG.' }
  ],
  related: ['session-state-machine', 'qr-token-issuance-ttl', 'measured-path-entry-rescue'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Crossing đúng chiều → tạo session', edgeCase: false,
      description: 'poll2 (44,1)→(36,1) cắt entry positive → tạo sid WAITING_FOR_SCAN; poll3 không cắt.',
      input: {
        runtime_id: 'rt-1', gate: dc(ENTRY_GATE),
        polls: [
          { vehicle: { global_id: 5, observed: true, position: { x: 44, y: 1 } }, cont: false },
          { vehicle: { global_id: 5, observed: true, position: { x: 36, y: 1 }, recent_observed_path: [] }, cont: true },
          { vehicle: { global_id: 5, observed: true, position: { x: 30, y: 1 } }, cont: true }
        ]
      },
      expected: { session_count: 1, sid_of_gid5: 'demo-token-s5', events: ['baseline', 'created', 'none'] }
    },
    {
      id: 'edge', title: 'Dedup idempotent — repoll cùng crossing', edgeCase: true,
      description: 'Re-poll cùng frame/crossing → dedup trả cùng sid, created_count vẫn 1; runtime khác → session mới.',
      input: {
        runtime_id: 'rt-1', gate: dc(ENTRY_GATE),
        polls: [
          { vehicle: { global_id: 5, observed: true, position: { x: 44, y: 1 } }, cont: false },
          { vehicle: { global_id: 5, observed: true, position: { x: 36, y: 1 }, recent_observed_path: [] }, cont: true },
          { vehicle: { global_id: 5, observed: true, position: { x: 44, y: 1 }, recent_observed_path: [] }, cont: true, repoll: true },
          { vehicle: { global_id: 5, observed: true, position: { x: 36, y: 1 }, recent_observed_path: [] }, cont: true, repoll: true },
          { vehicle: { global_id: 5, observed: true, position: { x: 44, y: 1 } }, cont: false, runtime_id: 'rt-2' },
          { vehicle: { global_id: 5, observed: true, position: { x: 36, y: 1 }, recent_observed_path: [] }, cont: true, runtime_id: 'rt-2' }
        ]
      },
      expected: { session_count: 2, sid_of_gid5_rt1: 'demo-token-s5', sid_of_gid5_rt2: 'demo-token-s5-rt-2', events: ['baseline', 'created', 'repoll-pos', 'dedup-same-sid', 'baseline-rt2', 'new-runtime-created'] }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], sessions = {}, created = 0;
    var prevByRt = {}; /* coordinator reset per runtime — rt mới → prev mới */
    var events = [], sidOf = {};
    var sidCounter = 0;
    function newSid(gid, rt) { return 'demo-token-s' + gid + (rt === 'rt-1' ? '' : '-' + rt); }
    inp.polls.forEach(function (pv, i) {
      var v = pv.vehicle, rt = pv.runtime_id || inp.runtime_id;
      var prev = prevByRt[rt] || null;
      var direct = pv.cont && prev && crossDir(prev, v.position, inp.gate).ok;
      var sid = null;
      /* find open session gid+runtime */
      for (var k in sessions) {
        var s = sessions[k];
        if (s.globalVehicleId === v.global_id && s.runtimeId === rt && s.state !== 'CLOSED') sid = k;
      }
      var event, expl = '';
      var lines = ['e1'];
      if (!pv.cont && !prev) {
        event = rt === inp.runtime_id ? 'baseline' : 'baseline-rt2';
        expl = 'prev=None (' + rt + ' — coordinator reset theo runtime) → baseline, không xét.';
      }
      else if (direct && !sid) {
        sid = newSid(v.global_id, rt); sidCounter++;
        sessions[sid] = { sessionId: sid, globalVehicleId: v.global_id, runtimeId: rt, state: 'WAITING_FOR_SCAN', revision: 1, qrExpiresAt: '+120s' };
        created++;
        event = pv.runtime_id ? 'new-runtime-created' : 'created';
        expl = 'direct ✓ ∧ chưa có session → create_session → ' + sid + ' (WAITING_FOR_SCAN rev1 +120s).';
        lines = ['e1', 'e3', 'e4', 'e5'];
      } else if (direct && sid) {
        event = 'dedup-same-sid';
        expl = 'direct ✓ nhưng session mở cùng gid+runtime đã có → trả sid cũ ' + sid + ' (idempotent, không nhân bản).';
        lines = ['e1', 'e4'];
      } else if (pv.repoll) {
        event = 'repoll-pos';
        expl = 're-poll: đoạn di chuyển ' + JSON.stringify(prev) + '→' + JSON.stringify(v.position) + ' không phải crossing mới.';
        lines = ['e1'];
      } else {
        event = 'none';
        expl = 'đoạn ' + JSON.stringify(prev) + '→' + JSON.stringify(v.position) + ' không cắt vạch đúng chiều.';
        lines = ['e1'];
      }
      sidOf[v.global_id + '@' + rt] = sid;
      events.push(event);
      prevByRt[rt] = v.position;
      F.push(mkFrame('poll' + (i + 1), lines, 'poll' + (i + 1) + ': ' + expl,
        { event: event, sessions: dc(sessions), created: created, sid: sid },
        [{ label: 'event', value: event }, { label: 'sessions', value: Object.keys(sessions).length }, { label: 'created', value: created }],
        { phase: 'poll', idx: i, polls: inp.polls, gate: inp.gate, sessions: dc(sessions), cur: v, prev: dc(prev), hl: i }));
    });
    F.push(mkFrame('done', ['e4'], 'Kết: ' + created + ' session tạo, ' + Object.keys(sessions).length + ' trong store.',
      { sessions: sessions, created: created }, [],
      { phase: 'done', polls: inp.polls, gate: inp.gate, sessions: sessions }));
    var rt1 = inp.runtime_id;
    var result = {
      session_count: Object.keys(sessions).length,
      sid_of_gid5: sidOf['5@' + rt1] || null,
      sid_of_gid5_rt1: sidOf['5@rt-1'] || null,
      sid_of_gid5_rt2: sidOf['5@rt-2'] || null,
      events: events
    };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    /* expected đã pin trong scenario; giữ nguyên khi có params-default */
    var checks = [
      chk('session_count', result.session_count, expected.session_count),
      chk('events', result.events, expected.events)
    ];
    if (expected.sid_of_gid5 !== undefined) checks.push(chk('sid gid5', result.sid_of_gid5, expected.sid_of_gid5));
    if (expected.sid_of_gid5_rt2 !== undefined) checks.push(chk('sid gid5@rt-2', result.sid_of_gid5_rt2, expected.sid_of_gid5_rt2));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Vạch entry + thẻ session', 'cắt đúng chiều → session xuất hiện bên phải');
    var m = wfit({ x0: 28, y0: -8, x1: 50, y1: 12 }, 24, 60, env.width * 0.42, env.height - 110);
    gateSeg(ctx, m, s.gate, '#4f9cf7', 'entry (+)');
    var pts = (s.polls || []).map(function (pv) { return pv.vehicle.position; });
    for (var i = 1; i < pts.length; i++)
      AR(ctx, m.tx(pts[i - 1].x), m.ty(pts[i - 1].y), m.tx(pts[i].x), m.ty(pts[i].y), 'rgba(240,169,60,.5)', 1.5);
    pts.forEach(function (pt, i) {
      DOT(ctx, m.tx(pt.x), m.ty(pt.y), i === s.hl ? 6 : 3.5, i === s.hl ? p.warning : 'rgba(255,255,255,.5)');
    });
    /* session cards */
    var sx = env.width * 0.55, sy = 70;
    T(ctx, 'SESSIONS (store)', sx, sy - 14, { c: p.muted, sz: 11, w: '700' });
    var sess = s.sessions || {};
    var keys = Object.keys(sess);
    if (!keys.length) T(ctx, '(trống — chưa có crossing)', sx, sy + 12, { c: p.muted, sz: 11 });
    keys.forEach(function (k, i) {
      var se = sess[k];
      BX(ctx, sx, sy + i * 78, env.width * 0.4, 68, 'rgba(63,206,124,.07)', p.success, 8);
      T(ctx, se.sessionId, sx + 10, sy + i * 78 + 20, { c: p.text, sz: 12, w: '700', f: 'monospace' });
      T(ctx, 'gid=' + se.globalVehicleId + ' · ' + se.runtimeId + ' · rev' + se.revision, sx + 10, sy + i * 78 + 38, { c: p.muted, sz: 10.5 });
      PILL(ctx, sx + 10, sy + i * 78 + 52, se.state, p.accent);
    });
  }
});

/* ---------- B5 measured-path-entry-rescue ---------- */
LESSONS.push({
  id: 'measured-path-entry-rescue', pack: PACK_ID,
  title: 'Cứu entry bằng recent_observed_path',
  topic: 'Crossing cổng',
  summary: 'Track tentative vài frame → GID xuất hiện sau khi xe đã cắt — rescue quét quỹ đạo đo thật (manager-export, không Kalman) để khôi phục crossing đã lỡ.',
  role: 'Cặp liền kề (a,b) trong path: gap ≤1s ∧ cùng cam+track ∧ recency ≤1s ∧ cắt vạch đúng chiều → rescue (p1,p2).',
  inputTypes: [
    { name: 'recent_observed_path', type: 'array', description: '{timestamp_s,frame_index,camera_id,local_track_id,position} ≤12 mẫu cuối' },
    { name: 'gate', type: 'gate', description: 'entry direction' },
    { name: 'current_source_time', type: 'float', description: 'recency window' }
  ],
  outputTypes: [
    { name: 'rescue pair', type: '(a,b)|null', description: 'cặp mẫu chứng minh crossing đã lỡ' }
  ],
  structures: [
    { name: 'path samples', type: 'list', description: 'sort theo (ts, frame_index); chỉ measured trail' }
  ],
  complexity: { time: 'O(P log P + P) ≈ O(1) với P≤12', space: 'O(P)', variables: 'P path mẫu ≤12', simulation: 'Giữ nguyên logic sort+guard.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 259, endLine: 309, symbol: '_recent_measured_entry_crossing', note: 'cùng cam+track :300-301' }
  ],
  pseudocode: [
    { id: 'r1', text: 'raw_path không list / <2 → None' },
    { id: 'r2', text: 'giữ 12 mẫu cuối; parse mẫu đúng kiểu' },
    { id: 'r3', text: 'sort theo (ts, frame_index)' },
    { id: 'r4', text: 'cặp (a,b): 0 < b.ts−a.ts ≤ 1.0' },
    { id: 'r5', text: 'a.cam == b.cam ∧ a.track == b.track' },
    { id: 'r6', text: '|b.ts − current_source_time| ≤ 1.0 (recency theo điểm cuối)' },
    { id: 'r7', text: 'crossed_in_valid_direction(a.pos,b.pos,gate) → trả cặp' }
  ],
  edgeCases: [
    { title: 'Cùng camera + cùng track', description: 'Chặn cross-camera jump và đổi local ID — cam/track khác → loại.' },
    { title: 'Recency theo điểm cuối', description: 'Mẫu b cách current_source_time >1s → loại — chỉ cứu crossing vừa xảy ra.' },
    { title: 'Input xáo trộn', description: 'Code tự sort → chấp nhận path không theo thứ tự đến.' }
  ],
  simplifications: [],
  related: ['entry-session-creation', 'directed-crossing-direction', 'observation-continuity-window'],
  aliases: [],
  parameters: [
    { key: 'max_gap_s', label: 'Gap tối đa giữa mẫu (s)', type: 'number', min: 0.25, max: 3, step: 0.25, default: 1 },
    { key: 'recency_s', label: 'Recency so với source_time (s)', type: 'number', min: 0.25, max: 3, step: 0.25, default: 1 }
  ],
  scenarios: [
    {
      id: 'normal', title: 'Cặp cùng cam/track vượt 4 guard → rescue', edgeCase: false,
      description: '49→50 không cắt; 50→50.2 cùng cam1#7 cắt → rescue; 50.2→50.3 khác cam → loại.',
      input: {
        current_source_time: 50.4, gate: dc(ENTRY_GATE),
        recent_observed_path: [
          { timestamp_s: 50.0, frame_index: 40, camera_id: 'cam1', local_track_id: 7, position: { x: 44, y: 1 } },
          { timestamp_s: 50.2, frame_index: 41, camera_id: 'cam1', local_track_id: 7, position: { x: 36, y: 1 } },
          { timestamp_s: 50.3, frame_index: 42, camera_id: 'cam2', local_track_id: 2, position: { x: 33, y: 1 } },
          { timestamp_s: 49.0, frame_index: 39, camera_id: 'cam1', local_track_id: 7, position: { x: 47, y: 1 } }
        ]
      },
      expected: { rescue: ['50@cam1#7→50.2'], rejected: { '49@cam1#7→50': 'không cắt đúng chiều', '50.2@cam1#7→50.3': 'khác cam/track' } }
    },
    {
      id: 'edge', title: 'Recency hết hạn → None', edgeCase: true,
      description: 'current_source_time=51.6 → mọi cặp recency >1s → không rescue; cùng path y hệt.',
      input: {
        current_source_time: 51.6, gate: dc(ENTRY_GATE),
        recent_observed_path: [
          { timestamp_s: 50.0, frame_index: 40, camera_id: 'cam1', local_track_id: 7, position: { x: 44, y: 1 } },
          { timestamp_s: 50.2, frame_index: 41, camera_id: 'cam1', local_track_id: 7, position: { x: 36, y: 1 } },
          { timestamp_s: 50.3, frame_index: 42, camera_id: 'cam2', local_track_id: 2, position: { x: 33, y: 1 } },
          { timestamp_s: 49.0, frame_index: 39, camera_id: 'cam1', local_track_id: 7, position: { x: 47, y: 1 } }
        ]
      },
      expected: { rescue: [], rejected_all: 'recency > 1.0s' }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var gap = params.max_gap_s != null ? params.max_gap_s : 1.0;
    var rec = params.recency_s != null ? params.recency_s : 1.0;
    var cst = inp.current_source_time;
    var path = dc(inp.recent_observed_path).slice(-12).filter(function (s2) {
      return s2 && typeof s2.timestamp_s === 'number' && s2.position && typeof s2.position.x === 'number';
    }).sort(function (a, b) { return a.timestamp_s - b.timestamp_s || a.frame_index - b.frame_index; });
    var F = [];
    F.push(mkFrame('sorted', ['r1', 'r2', 'r3'], 'Sort ' + path.length + ' mẫu theo (ts,frame): [' + path.map(function (s2) { return s2.timestamp_s + '@' + s2.camera_id + '#' + s2.local_track_id; }).join(', ') + ']',
      { sorted: path.map(function (s2) { return { ts: s2.timestamp_s, cam: s2.camera_id, track: s2.local_track_id }; }) },
      [{ label: 'samples', value: path.length }],
      { phase: 'scan', path: path, gate: inp.gate, cst: cst, checks: {} }));
    var rescue = [], rejected = {}, checksMap = {};
    for (var i = 0; i < path.length - 1; i++) {
      var a = path[i], b = path[i + 1];
      var key = a.timestamp_s + '@' + a.camera_id + '#' + a.local_track_id + '→' + b.timestamp_s;
      var g1 = b.timestamp_s - a.timestamp_s > 0 && b.timestamp_s - a.timestamp_s <= gap;
      var g2 = a.camera_id === b.camera_id && a.local_track_id === b.local_track_id;
      var g3 = Math.abs(b.timestamp_s - cst) <= rec;
      var cr = crossDir(a.position, b.position, inp.gate);
      var g4 = cr.ok;
      var pass = g1 && g2 && g3 && g4;
      checksMap[key] = { g1: g1, g2: g2, g3: g3, g4: g4, pass: pass, d: cr.d, ix: cr.intersect };
      var failWhy = !g1 ? 'gap ' + r2(b.timestamp_s - a.timestamp_s) + 's' : !g2 ? 'khác cam/track' : !g3 ? 'recency ' + r2(Math.abs(b.timestamp_s - cst)) + 's' : !g4 ? 'không cắt đúng chiều (d=' + r2(cr.d) + ', ix=' + cr.intersect + ')' : '';
      if (pass) rescue.push(key); else rejected[key] = failWhy;
      F.push(mkFrame('pair' + i, ['r4', 'r5', 'r6', 'r7'],
        'Cặp ' + a.timestamp_s + '→' + b.timestamp_s + ': g1 ' + (g1 ? '✓' : '✗') + ' · g2 ' + (g2 ? '✓' : '✗') + ' · g3 ' + (g3 ? '✓' : '✗') + ' · g4 ' + (g4 ? '✓' : '✗') +
        ' → ' + (pass ? 'RESCUE ✓' : 'loại — ' + failWhy),
        { pair: key, gates: checksMap[key], rescue: dc(rescue), rejected: dc(rejected) },
        [{ label: 'gap', value: r2(b.timestamp_s - a.timestamp_s), unit: 's' },
         { label: 'recency', value: r2(Math.abs(b.timestamp_s - cst)), unit: 's' },
         { label: 'verdict', value: pass ? 'rescue' : 'reject' }],
        { phase: 'scan', path: path, gate: inp.gate, cst: cst, checks: dc(checksMap), curPair: key }));
    }
    F.push(mkFrame('done', ['r7'], rescue.length ? 'Rescue: ' + rescue.join(', ') : 'Không cặp nào đủ 4 guard → None.',
      { rescue: rescue, rejected: rejected }, [],
      { phase: 'done', path: path, gate: inp.gate, cst: cst, checks: checksMap }));
    var result = { rescue: rescue, rejected: rejected };
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var g = p2.max_gap_s != null ? p2.max_gap_s : 1.0, rc = p2.recency_s != null ? p2.recency_s : 1.0;
      var pt = dc(i2.recent_observed_path).slice(-12).filter(function (s2) {
        return s2 && typeof s2.timestamp_s === 'number' && s2.position && typeof s2.position.x === 'number';
      }).sort(function (a, b) { return a.timestamp_s - b.timestamp_s || a.frame_index - b.frame_index; });
      var rs = [], rj = {};
      for (var j = 0; j < pt.length - 1; j++) {
        var a2 = pt[j], b2 = pt[j + 1];
        var k2 = a2.timestamp_s + '@' + a2.camera_id + '#' + a2.local_track_id + '→' + b2.timestamp_s;
        var ok = (b2.timestamp_s - a2.timestamp_s > 0 && b2.timestamp_s - a2.timestamp_s <= g) &&
          a2.camera_id === b2.camera_id && a2.local_track_id === b2.local_track_id &&
          Math.abs(b2.timestamp_s - i2.current_source_time) <= rc &&
          crossDir(a2.position, b2.position, i2.gate).ok;
        if (ok) rs.push(k2);
        else {
          var why = !(b2.timestamp_s - a2.timestamp_s > 0 && b2.timestamp_s - a2.timestamp_s <= g) ? 'gap'
            : !(a2.camera_id === b2.camera_id && a2.local_track_id === b2.local_track_id) ? 'khác cam/track'
            : !(Math.abs(b2.timestamp_s - i2.current_source_time) <= rc) ? 'recency ' + r2(Math.abs(b2.timestamp_s - i2.current_source_time)) + 's'
            : 'không cắt đúng chiều';
          rj[k2] = why === 'không cắt đúng chiều' ? 'không cắt đúng chiều' : why;
        }
      }
      return { rescue: rs, rejected: rj };
    });
    var checks = [chk('rescue pairs', result.rescue, expected.rescue)];
    /* rejected reason có thể khác chi tiết failWhy — chỉ check khi expected pin sẵn fields */
    if (expected.rejected && Object.keys(expected.rejected).length && paramsDefault(this, scenId, params)) {
      checks.push(chk('rejected keys', Object.keys(result.rejected).sort(), Object.keys(expected.rejected).sort()));
    }
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Ghost trail theo (cam,track) + pair guard', 'cặp đủ 4 điều kiện → đoạn xanh lá qua vạch');
    var path = s.path || [];
    var pts = path.map(function (s2) { return s2.position; }).concat([s.gate ? s.gate.p1 : null, s.gate ? s.gate.p2 : null]).filter(Boolean);
    if (pts.length) {
      var b = { x0: Math.min.apply(null, pts.map(function (q) { return q.x; })) - 4, y0: Math.min.apply(null, pts.map(function (q) { return q.y; })) - 6, x1: Math.max.apply(null, pts.map(function (q) { return q.x; })) + 4, y1: Math.max.apply(null, pts.map(function (q) { return q.y; })) + 6 };
      var m = wfit(b, 30, 60, env.width * 0.48, env.height - 110);
      if (s.gate) gateSeg(ctx, m, s.gate, '#4f9cf7', 'entry (+)');
      var colors = ['#f0a93c', '#4f9cf7', '#3fce7c', '#c99cff', '#f2555a'];
      var keyOf = function (s2) { return s2.camera_id + '#' + s2.local_track_id; };
      var cmap = {};
      path.forEach(function (s2) {
        if (!cmap[keyOf(s2)]) cmap[keyOf(s2)] = colors[Object.keys(cmap).length % colors.length];
      });
      /* segments theo pair check */
      for (var i = 0; i < path.length - 1; i++) {
        var a = path[i], b2 = path[i + 1];
        var k = a.timestamp_s + '@' + a.camera_id + '#' + a.local_track_id + '→' + b2.timestamp_s;
        var ck = s.checks && s.checks[k];
        var col = ck ? (ck.pass ? p.success : 'rgba(242,85,90,.4)') : 'rgba(255,255,255,.3)';
        AR(ctx, m.tx(a.position.x), m.ty(a.position.y), m.tx(b2.position.x), m.ty(b2.position.y), col, ck && ck.pass ? 3 : 1.5);
      }
      path.forEach(function (s2, i) {
        DOT(ctx, m.tx(s2.position.x), m.ty(s2.position.y), 4.5, cmap[keyOf(s2)]);
        T(ctx, s2.timestamp_s + '', m.tx(s2.position.x) + 6, m.ty(s2.position.y) - 6, { c: p.muted, sz: 9 });
      });
      /* legend cam#track */
      var ly = env.height - 26;
      Object.keys(cmap).forEach(function (k, i) {
        DOT(ctx, 30 + i * 110, ly, 5, cmap[k]);
        T(ctx, k, 40 + i * 110, ly + 4, { c: p.muted, sz: 10.5 });
      });
    }
    /* pair guard table */
    if (s.checks) {
      var rows = Object.keys(s.checks).map(function (k) {
        var c = s.checks[k];
        return [k, c.g1 ? '✓' : '✗', c.g2 ? '✓' : '✗', c.g3 ? '✓' : '✗', c.g4 ? '✓' : '✗', c.pass ? 'RESCUE' : '—'];
      });
      var tx = env.width * 0.52, ty = 70;
      T(ctx, 'pair | gap | cam+track | recency | direction | verdict', tx, ty - 10, { c: p.muted, sz: 10 });
      segTable(ctx, tx, ty, ['cặp', 'g1', 'g2', 'g3', 'g4', ''], rows, [120, 26, 26, 26, 26, 58], 20, {
        cellStyle: function (ri, ci, cell) {
          if (ci === 5) return { c: cell === 'RESCUE' ? p.success : p.muted, w: '700' };
          if (ci > 0) return { c: cell === '✓' ? p.success : p.danger };
          return { c: s.curPair === rows[ri][0] ? p.accent : p.text, sz: 9.5 };
        }
      });
    }
  }
});

/* ---------- B6 exit-crossing-session-delete ---------- */
LESSONS.push({
  id: 'exit-crossing-session-delete', pack: PACK_ID,
  title: 'Exit crossing → xóa session',
  topic: 'Crossing cổng',
  summary: 'Xe cắt vạch exit đúng chiều ∧ đang được quan sát liên tục → session bị xóa cứng (record mất luôn) — FE GET → 404 → kết thúc UI.',
  role: 'obs_is_cont ∧ session≠None ∧ crossed_in_valid_direction(prev,pos,exit) → delete_session_by_global_id + cleanup cursor; KHÔNG có measured-path rescue cho exit.',
  inputTypes: [
    { name: 'previous/position', type: 'point', description: 'đoạn di chuyển' },
    { name: 'exit_gate', type: 'gate', description: 'direction negative' },
    { name: 'session', type: 'dict|null', description: 'đã tìm theo gid' }
  ],
  outputTypes: [
    { name: 'deleted_session', type: 'dict|null', description: 'record trả về + cleanup' }
  ],
  structures: [
    { name: 'coordinator maps', type: 'dict per-gid', description: 'previous_positions, _parked/_departure_candidates, _last_observed_at…' }
  ],
  complexity: { time: 'O(N_sessions) find+delete', space: 'O(N)', variables: 'N sessions trong file store', simulation: 'Giữ nguyên.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 523, endLine: 535, symbol: 'exit branch', note: 'continue — không update previous' },
    { path: 'backend/session_manager.py', line: 585, endLine: 595, symbol: 'delete_session_by_global_id', note: '' }
  ],
  pseudocode: [
    { id: 'x1', text: 'obs_is_cont ∧ session≠None ∧ crossed_in_valid_direction(prev,pos,exit_gate)' },
    { id: 'x2', text: 'deleted ← delete_session_by_global_id(gid, runtime_id)' },
    { id: 'x3', text: 'xóa previous_positions/_candidates/_last_observed của gid; continue — không update prev' }
  ],
  edgeCases: [
    { title: 'Không có rescue cho exit', description: 'Bất đối xứng có chủ đích: entry có measured-path rescue, exit không → stall >1s/mất quan sát → session sống mãi (đã thấy session 1 tháng).' },
    { title: 'Delete bất kể state', description: 'WAITING_FOR_SCAN chưa claim cũng bị xóa nếu xe ra — đúng vật lý.' },
    { title: 'observed=false jump', description: 'Xe biến mất ra ngoài vạch → không delete → session ma.' }
  ],
  simplifications: [],
  related: ['entry-session-creation', 'session-state-machine', 'directed-crossing-direction'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Cắt exit negative → delete + cleanup', edgeCase: false,
      description: '(48,57)→(52,58) cắt vạch exit tại ≈(50.1,57.5), d=−46.30<0 khớp negative → delete s-5.',
      input: {
        gate: dc(EXIT_GATE),
        session: { sessionId: 's-5', state: 'EXIT_NAVIGATION', globalVehicleId: 5, runtimeId: 'rt-1' },
        polls: [
          { vehicle: { global_id: 5, observed: true, position: { x: 48, y: 57 } }, cont: false },
          { vehicle: { global_id: 5, observed: true, position: { x: 52, y: 58 } }, cont: true },
          { vehicle: { global_id: 5, observed: false, position: { x: 40, y: 60 } }, cont: true }
        ]
      },
      expected: { deleted: 's-5', remaining: 0, d_sign: 'negative', events: ['baseline', 'deleted', 'gone'] }
    },
    {
      id: 'edge', title: 'Sai chiều / mất quan sát → session ma sống', edgeCase: true,
      description: 'Đảo chiều d=+49.19 → reject; observed=false → không delete → session tồn tại (R4).',
      input: {
        gate: dc(EXIT_GATE),
        session: { sessionId: 's-5', state: 'EXIT_NAVIGATION', globalVehicleId: 5, runtimeId: 'rt-1' },
        polls: [
          { vehicle: { global_id: 5, observed: true, position: { x: 52, y: 57 } }, cont: false },
          { vehicle: { global_id: 5, observed: true, position: { x: 48, y: 58 } }, cont: true },
          { vehicle: { global_id: 5, observed: false, position: { x: 30, y: 60 } }, cont: true }
        ]
      },
      expected: { deleted: null, remaining: 1, d_sign: 'positive', events: ['baseline', 'rejected-wrong-dir', 'not-observed-alive'] }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], sessions = {}, prev = null, deleted = null;
    sessions[inp.session.sessionId] = dc(inp.session);
    var events = [], dSeen = null;
    inp.polls.forEach(function (pv, i) {
      var v = pv.vehicle;
      var sess = sessions['s-' + v.global_id] || Object.keys(sessions).map(function (k) { return sessions[k]; }).filter(function (s2) { return s2.globalVehicleId === v.global_id; })[0] || null;
      var ev, expl, lines = ['x1'];
      var cr = prev && pv.cont ? crossDir(prev, v.position, inp.gate) : null;
      if (cr && v.observed && pv.cont && sess && cr.ok) {
        deleted = sess.sessionId; dSeen = cr.d;
        delete sessions[deleted];
        ev = 'deleted';
        expl = 'obs_cont ∧ cắt vạch d=' + r2(cr.d) + ' khớp ' + inp.gate.direction + ' → DELETE ' + deleted + ' + cleanup cursor (continue — không update prev).';
        lines = ['x1', 'x2', 'x3'];
      } else if (cr && !cr.ok && cr.intersect) {
        ev = 'rejected-wrong-dir';
        expl = 'cắt vạch nhưng d=' + r2(cr.d) + ' trái dấu ' + inp.gate.direction + ' → reject, session sống.';
        dSeen = cr.d;
      } else if (!v.observed) {
        ev = sess ? 'not-observed-alive' : 'gone';
        expl = 'observed=false → ' + (sess ? 'không delete — session ma sống (không có rescue cho exit)' : 'không còn session');
      } else if (!prev) {
        ev = 'baseline';
        expl = 'prev=None → baseline.';
      } else {
        ev = 'none';
        expl = 'không cắt vạch.';
      }
      events.push(ev);
      if (ev !== 'deleted') prev = v.position;
      F.push(mkFrame('poll' + (i + 1), lines, 'poll' + (i + 1) + ': ' + (expl || ev),
        { event: ev, sessions: dc(sessions), d: cr ? cr.d : null, prev: dc(prev) },
        [{ label: 'd', value: cr ? r2(cr.d) : '—' }, { label: 'sessions còn', value: Object.keys(sessions).length }],
        { phase: 'poll', idx: i, polls: inp.polls, gate: inp.gate, sessions: dc(sessions), cur: v, deleted: dc(deleted), hl: i, cr: cr }));
    });
    F.push(mkFrame('done', ['x3'], 'Kết: deleted=' + (deleted || 'none') + ', còn ' + Object.keys(sessions).length + ' session. Exit không có rescue — stall/mất quan sát → session sống mãi.',
      { deleted: deleted, sessions: sessions }, [],
      { phase: 'done', polls: inp.polls, gate: inp.gate, sessions: sessions, deleted: deleted }));
    var result = {
      deleted: deleted, remaining: Object.keys(sessions).length,
      d_sign: dSeen == null ? null : (dSeen < 0 ? 'negative' : 'positive'),
      events: events
    };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [
      chk('deleted', result.deleted, expected.deleted),
      chk('remaining', result.remaining, expected.remaining),
      chk('events', result.events, expected.events)
    ];
    if (expected.d_sign !== undefined) checks.push(chk('d_sign', result.d_sign, expected.d_sign));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Vạch exit (đỏ) — delete cứng', 'session nổ/biến mất khi cắt đúng chiều; không có rescue cho exit');
    var g = s.gate;
    var pts = (s.polls || []).map(function (pv) { return pv.vehicle.position; }).filter(Boolean);
    var xs = pts.map(function (q) { return q.x; }).concat([g.p1.x, g.p2.x]);
    var ys = pts.map(function (q) { return q.y; }).concat([g.p1.y, g.p2.y]);
    var b = { x0: Math.min.apply(null, xs) - 6, y0: Math.min.apply(null, ys) - 6, x1: Math.max.apply(null, xs) + 6, y1: Math.max.apply(null, ys) + 6 };
    var m = wfit(b, 24, 60, env.width * 0.42, env.height - 110);
    gateSeg(ctx, m, g, '#f2555a', 'exit (−)');
    for (var i = 1; i < pts.length; i++)
      AR(ctx, m.tx(pts[i - 1].x), m.ty(pts[i - 1].y), m.tx(pts[i].x), m.ty(pts[i].y), 'rgba(240,169,60,.5)', 1.5);
    pts.forEach(function (pt, i) {
      DOT(ctx, m.tx(pt.x), m.ty(pt.y), i === s.hl ? 6 : 3.5, i === s.hl ? p.warning : 'rgba(255,255,255,.5)');
    });
    /* session zone */
    var sx = env.width * 0.55, sy = 80;
    T(ctx, 'SESSION', sx, sy - 16, { c: p.muted, sz: 11, w: '700' });
    var sess = s.sessions || {}, keys = Object.keys(sess);
    if (keys.length) {
      var se = sess[keys[0]];
      BX(ctx, sx, sy, env.width * 0.38, 76, 'rgba(63,206,124,.08)', p.success, 8);
      T(ctx, se.sessionId + ' · ' + se.state, sx + 12, sy + 24, { c: p.text, sz: 13, w: '700' });
      T(ctx, 'gid=' + se.globalVehicleId + ' · ' + se.runtimeId, sx + 12, sy + 44, { c: p.muted, sz: 11 });
      T(ctx, 'đang sống', sx + 12, sy + 62, { c: p.muted, sz: 10.5 });
    } else {
      BX(ctx, sx, sy, env.width * 0.38, 76, 'rgba(242,85,90,.08)', p.danger, 8);
      T(ctx, s.deleted ? s.deleted + ' — DELETED' : '— trống —', sx + 12, sy + 30, { c: p.danger, sz: 14, w: '700' });
      T(ctx, 'record mất luôn → FE GET → 404', sx + 12, sy + 52, { c: p.muted, sz: 11 });
    }
    if (s.cr && s.cr.intersect) {
      PILL(ctx, sx, sy + 96, 'd = ' + r2(s.cr.d) + (s.cr.ok ? ' ✓ khớp ' + s.gate.direction : ' ✗ trái dấu'), s.cr.ok ? p.success : p.danger);
    }
  }
});

/* =================================================================
 * NHÓM C — Session store & lifecycle (C1–C6)
 * ================================================================= */

/* ---------- C1 session-state-machine ---------- */
var FSM_STATES = ['WAITING_FOR_SCAN', 'SELECTING_SPOT', 'NAVIGATING_TO_SPOT', 'RELOCATING', 'PARKED', 'EXIT_NAVIGATION'];
function fsmApply(sess, act) {
  /* trả {state, rev, changed, error, note} — port session_manager transitions */
  var s2 = dc(sess);
  var st = s2.state, out = { changed: false, error: null, note: '' };
  if (act.op === 'claim') {
    if (st === 'WAITING_FOR_SCAN' && !s2.claimed) { s2.state = 'SELECTING_SPOT'; s2.claimed = true; out.changed = true; out.note = 'WAITING_FOR_SCAN → SELECTING_SPOT + claimed'; }
    else if (s2.claimed) { out.note = 'claimed rồi → no-op idempotent'; }
    else { out.error = 'InvalidSessionState'; out.note = st + ' chưa claimed → InvalidSessionState'; }
  } else if (act.op === 'select') {
    if (FSM_STATES.indexOf(st) < 0 || st === 'WAITING_FOR_SCAN') { out.error = 'InvalidSessionState'; out.note = st + ' không trong tập select được'; }
    else if (act.spotId) {
      s2.targetSpotId = act.spotId;
      s2.state = s2.actualParkedSpotId ? 'RELOCATING' : 'NAVIGATING_TO_SPOT';
      out.changed = true;
      out.note = 'spot ' + act.spotId + ' → ' + s2.state + (s2.actualParkedSpotId ? ' (đang đỗ ' + s2.actualParkedSpotId + ' → RELOCATING)' : '');
    } else {
      s2.targetSpotId = null;
      s2.state = s2.actualParkedSpotId ? 'PARKED' : 'SELECTING_SPOT';
      out.changed = true;
      out.note = 'spotId=null → ' + s2.state;
    }
  } else if (act.op === 'set_parked') {
    if (act.episodeId && s2.parkingEpisodeId === act.episodeId) {
      s2.actualParkedSpotId = act.spot || s2.actualParkedSpotId;
      if (s2.state === 'SELECTING_SPOT') { s2.state = 'PARKED'; out.changed = true; }
      out.note = 'episodeId trùng → nhánh rollback: restore actualParkedSpotId (không kiểm EXIT)';
      if (!out.changed && s2.state === 'PARKED' && s2.parkedSpotId === act.spot) out.note += ' — cùng spot → changed=false';
    } else if (st === 'EXIT_NAVIGATION') {
      out.error = 'InvalidSessionState';
      out.note = 'EXIT_NAVIGATION cấm set_parked (episodeId khác → không vào nhánh rollback)';
    } else if (s2.parkedSpotId === act.spot && s2.state === 'PARKED') {
      out.note = 'idempotent cùng spot → giữ nguyên';
    } else {
      s2.state = 'PARKED';
      s2.parkedSpotId = act.spot;
      s2.actualParkedSpotId = act.spot;
      s2.parkingEpisodeId = act.episodeId;
      s2.targetSpotId = null;
      out.changed = true;
      out.note = '→ PARKED ' + act.spot + ' (episode ' + act.episodeId + ')';
    }
  } else if (act.op === 'departure_episode') {
    if (s2.parkingEpisodeId === act.episodeId) {
      s2.actualParkedSpotId = null;
      if (s2.state === 'PARKED') s2.state = 'SELECTING_SPOT';
      out.changed = true;
      out.note = 'departure khớp parkingEpisodeId → clear actual + PARKED→SELECTING';
    } else { out.note = 'episodeId lệch → no-op'; }
  } else if (act.op === 'set_exit') {
    if (st === 'EXIT_NAVIGATION') { out.note = 'đã EXIT_NAV → no-op (có thể update activeTrackId)'; }
    else if (st === 'WAITING_FOR_SCAN') { out.error = 'InvalidSessionState'; out.note = 'WAITING_FOR_SCAN không trong tập set_exit'; }
    else { s2.state = 'EXIT_NAVIGATION'; s2.targetSpotId = null; out.changed = true; out.note = '→ EXIT_NAVIGATION, clear target'; }
  }
  if (out.changed && !out.error) s2.revision = (s2.revision || 1) + 1;
  out.session = s2;
  return out;
}
LESSONS.push({
  id: 'session-state-machine', pack: PACK_ID,
  title: 'FSM 6 trạng thái + transition guards',
  topic: 'Session lifecycle',
  summary: 'FSM authoritative phía backend — UI/FE chỉ là trigger; transition sai bị InvalidSessionState/SessionConflict chặn.',
  role: 'create→WAITING_FOR_SCAN; claim→SELECTING_SPOT; select→NAVIGATING/RELOCATING (hay bỏ chọn); set_parked→PARKED (rollback/idempotent/EXIT-guard); departure; set_exit; exit crossing → delete.',
  inputTypes: [
    { name: 'action', type: '{op, spotId?, episodeId?}', description: 'claim/select/set_parked/departure_episode/set_exit' },
    { name: 'session', type: 'dict ~18 field', description: 'state + revision + ids' }
  ],
  outputTypes: [{ name: 'session′|error', type: 'dict|InvalidSessionState', description: 'revision+1 khi changed' }],
  structures: [
    { name: 'session', type: 'dict', description: 'state, claimed, targetSpotId, parkedSpotId, actualParkedSpotId, parkingEpisodeId, revision…' },
    { name: 'states', type: '6', description: 'CLOSED tồn tại trong find-filter nhưng không transition ghi (dead state)' }
  ],
  complexity: { time: 'O(1)/transition (find O(N))', space: 'O(1)', variables: '—', simulation: 'Port đúng nhánh guard của session_manager.' },
  codeRefs: [
    { path: 'backend/session_manager.py', line: 255, endLine: 468, symbol: 'create/claim/select/set_parked/departure/set_exit', note: '' },
    { path: 'backend/session_manager.py', line: 57, endLine: 59, symbol: 'InvalidSessionState', note: '' }
  ],
  pseudocode: [
    { id: 't1', text: 'claim: WAITING_FOR_SCAN→SELECTING_SPOT+claimed; đã claimed→no-op; khác→InvalidSessionState' },
    { id: 't2', text: 'select(spot): actual?RELOCATING:NAVIGATING + target; spot=null→actual?PARKED:SELECTING' },
    { id: 't3', text: 'set_parked: episodeId trùng→rollback restore actual (không check EXIT); EXIT→Invalid; cùng spot→idempotent' },
    { id: 't4', text: 'departure(ep): chỉ khi parkingEpisodeId==ep → clear actual, PARKED→SELECTING' },
    { id: 't5', text: 'set_exit: PARKED/EXIT_NAV/SELECTING/NAVIGATING/RELOCATING→EXIT_NAV, clear target; EXIT_NAV→no-op' },
    { id: 't6', text: 'exit crossing (B6) → delete_session — xóa record, không qua state' }
  ],
  edgeCases: [
    { title: 'Rollback không kiểm EXIT', description: 'episodeId trùng parkingEpisodeId → nhánh rollback restore actualParkedSpotId dù đang EXIT_NAV — có chủ đích giữ intent driver.' },
    { title: 'CLOSED dead state', description: 'Tồn tại trong find-filters nhưng không transition nào ghi — chỉ delete xóa record.' },
    { title: 'Claim sau khi claimed', description: 'claimed=true → no-op idempotent; state không-WAITING + claimed=false → InvalidSessionState.' }
  ],
  simplifications: [],
  related: ['revision-optimistic-concurrency', 'spot-reservation-availability', 'parking-episode-apply', 'entry-session-creation'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Chuỗi hành động đời xe — vào→đỗ→re-park→departure→exit', edgeCase: false,
      description: 'claim→select A01→set_parked ep-1→dup (rollback changed=false)→departure→select B02 (actual=null→NAVIGATING)→set_exit→set_parked chặn.',
      input: {
        initial: { sessionId: 's-1', state: 'WAITING_FOR_SCAN', globalVehicleId: 5, revision: 1, claimed: false },
        actions: [
          { op: 'claim' }, { op: 'select', spotId: 'A01' }, { op: 'set_parked', spot: 'A01', episodeId: 'ep-1' },
          { op: 'set_parked', spot: 'A01', episodeId: 'ep-1' }, { op: 'departure_episode', episodeId: 'ep-1' },
          { op: 'select', spotId: 'B02' }, { op: 'set_exit' }, { op: 'set_parked', spot: 'B02', episodeId: 'ep-2' }
        ]
      },
      expected: {
        states: ['SELECTING_SPOT', 'NAVIGATING_TO_SPOT', 'PARKED', 'PARKED', 'SELECTING_SPOT', 'NAVIGATING_TO_SPOT', 'EXIT_NAVIGATION', 'EXIT_NAVIGATION'],
        revisions: [2, 3, 4, 4, 5, 6, 7, 7],
        errors: [null, null, null, null, null, null, null, 'InvalidSessionState']
      }
    },
    {
      id: 'edge', title: 'Bỏ chọn + rollback giữa EXIT + dead CLOSED', edgeCase: true,
      description: 'select null → về SELECTING; set_parked C05 rồi exit → departure ep-1 khớp parkingEpisodeId → clear actual, state giữ EXIT_NAV (asymmetry: chỉ áp khi khớp episode).',
      input: {
        initial: { sessionId: 's-2', state: 'SELECTING_SPOT', globalVehicleId: 7, revision: 2, claimed: true },
        actions: [
          { op: 'select', spotId: 'C05' }, { op: 'select', spotId: null },
          { op: 'set_parked', spot: 'C05', episodeId: 'ep-1' },
          { op: 'set_exit' },
          { op: 'departure_episode', episodeId: 'ep-1' }
        ]
      },
      expected: {
        states: ['NAVIGATING_TO_SPOT', 'SELECTING_SPOT', 'PARKED', 'EXIT_NAVIGATION', 'EXIT_NAVIGATION'],
        revisions: [3, 4, 5, 6, 7],
        errors: [null, null, null, null, null]
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var sess = inp.initial;
    var F = [], states = [], revs = [], errs = [];
    F.push(mkFrame('init', ['t1'], 'Session ban đầu: ' + sess.state + ' rev' + sess.revision + ' gid=' + sess.globalVehicleId + '.',
      { session: dc(sess) }, [{ label: 'state', value: sess.state }, { label: 'rev', value: sess.revision }],
      { phase: 'fsm', session: dc(sess), hl: sess.state, hist: [] }));
    var hist = [];
    inp.actions.forEach(function (act, i) {
      var before = dc(sess);
      var r = fsmApply(sess, act);
      if (!r.error) sess = r.session;
      else sess = before;
      states.push(sess.state); revs.push(sess.revision); errs.push(r.error);
      hist.push({ act: act.op + (act.spotId !== undefined ? '(' + (act.spotId == null ? 'null' : act.spotId) + ')' : act.episodeId ? '(' + act.episodeId + ')' : ''), state: sess.state, rev: sess.revision, err: r.error });
      var ln = act.op === 'claim' ? 't1' : act.op === 'select' ? 't2' : act.op === 'set_parked' ? 't3' : act.op === 'departure_episode' ? 't4' : 't5';
      F.push(mkFrame('a' + (i + 1), [ln],
        act.op + (act.spotId !== undefined ? ' ' + JSON.stringify(act.spotId) : act.episodeId ? ' ' + act.episodeId : '') +
        ': ' + (r.error ? '✗ ' + r.error + ' — ' : '') + r.note +
        ' → ' + sess.state + ' rev' + sess.revision + (r.changed ? '' : ' (changed=false, giữ rev)'),
        { session: dc(sess), error: r.error, changed: r.changed },
        [{ label: 'state', value: sess.state }, { label: 'rev', value: sess.revision }, { label: 'err', value: r.error || '—' }],
        { phase: 'fsm', session: dc(sess), hl: sess.state, hist: dc(hist), curAct: act, error: r.error }));
    });
    F.push(mkFrame('done', ['t6'], 'FSM kết thúc ' + sess.state + ' rev' + sess.revision + '. CLOSED không transition nào ghi — chỉ exit-crossing delete record.',
      { session: sess, hist: hist }, [], { phase: 'done', session: sess, hist: hist }));
    var result = { states: states, revisions: revs, errors: errs };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [chk('states', result.states, expected.states), chk('revisions', result.revisions, expected.revisions), chk('errors', result.errors, expected.errors)];
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'FSM 6 trạng thái + DELETED ghost', 'nút sáng = state hiện tại · bảng phải = lịch sử action');
    var pos = {
      WAITING_FOR_SCAN: { x: 90, y: 90 }, SELECTING_SPOT: { x: 260, y: 90 },
      NAVIGATING_TO_SPOT: { x: 430, y: 90 }, PARKED: { x: 260, y: 210 },
      RELOCATING: { x: 430, y: 210 }, EXIT_NAVIGATION: { x: 90, y: 210 }
    };
    /* edges */
    var E = [
      ['WAITING_FOR_SCAN', 'SELECTING_SPOT', 'claim'], ['SELECTING_SPOT', 'NAVIGATING_TO_SPOT', 'select'],
      ['NAVIGATING_TO_SPOT', 'PARKED', 'set_parked'], ['PARKED', 'SELECTING_SPOT', 'departure'],
      ['PARKED', 'RELOCATING', 'select (đang đỗ)'], ['NAVIGATING_TO_SPOT', 'EXIT_NAVIGATION', 'set_exit'],
      ['PARKED', 'EXIT_NAVIGATION', 'set_exit'], ['SELECTING_SPOT', 'EXIT_NAVIGATION', 'set_exit'],
      ['RELOCATING', 'PARKED', 'set_parked'], ['RELOCATING', 'EXIT_NAVIGATION', 'set_exit']
    ];
    E.forEach(function (e) {
      var a = pos[e[0]], b = pos[e[1]];
      LN(ctx, a.x, a.y + (a.y < b.y ? 22 : -22), b.x, b.y + (a.y < b.y ? -22 : 22), 'rgba(255,255,255,.15)', 1.2);
    });
    Object.keys(pos).forEach(function (k) {
      var q = pos[k], hl = s.hl === k;
      BX(ctx, q.x - 78, q.y - 20, 156, 40, hl ? 'rgba(63,206,124,.14)' : 'rgba(255,255,255,.03)', hl ? p.success : p.grid, 10);
      T(ctx, k.replace(/_/g, ' '), q.x, q.y + 4, { c: hl ? p.success : p.muted, sz: 11, a: 'center', w: hl ? '700' : '400' });
    });
    /* DELETED ghost */
    BX(ctx, 90 - 60, 300, 120, 34, 'rgba(242,85,90,.06)', p.danger, 8);
    T(ctx, 'DELETED (B6)', 90, 321, { c: p.danger, sz: 10.5, a: 'center' });
    if (s.error) PILL(ctx, 470, 306, '✗ ' + s.error, p.danger);
    /* session JSON mini */
    var sess = s.session || {};
    var jx = 560, jy = 66;
    T(ctx, 'session', jx, jy - 8, { c: p.muted, sz: 11, w: '700' });
    var keys = ['state', 'revision', 'claimed', 'targetSpotId', 'parkedSpotId', 'actualParkedSpotId', 'parkingEpisodeId'];
    keys.forEach(function (k, i) {
      var v = sess[k];
      T(ctx, k, jx, jy + 10 + i * 19, { c: p.muted, sz: 10.5 });
      T(ctx, v === undefined ? '—' : JSON.stringify(v), jx + 150, jy + 10 + i * 19, { c: v == null ? p.muted : p.text, sz: 10.5 });
    });
    /* history */
    var hy = jy + 10 + keys.length * 19 + 14;
    (s.hist || []).slice(-6).forEach(function (h, i) {
      T(ctx, h.act + ' → ' + h.state + ' r' + h.rev + (h.err ? ' ✗' : ''), jx, hy + i * 17, { c: h.err ? p.danger : p.muted, sz: 10 });
    });
  }
});

/* ---------- C2 qr-token-issuance-ttl ---------- */
LESSONS.push({
  id: 'qr-token-issuance-ttl', pack: PACK_ID,
  title: 'QR token + TTL 120s + kiosk pick .at(-1)',
  topic: 'Session lifecycle',
  summary: 'Hàng đợi QR "một xe mới nhất hiển thị" — backend filter+sort+expiry, kiosk chọn phần tử cuối và tự đếm ngược. Claim KHÔNG kiểm hạn.',
  role: 'qrExpiresAt=createdAt+120s; waiting = state==WAITING_FOR_SCAN ∧ !claimed ∧ runtime match ∧ now<expiry, sort createdAt asc; kiosk poll .at(-1); claim guard theo state, không đọc expiry.',
  inputTypes: [
    { name: 'sessions', type: 'dict', description: 'store hiện tại' },
    { name: 'now', type: 'ISO/monotonic', description: 'đồng hồ consumer' }
  ],
  outputTypes: [
    { name: 'waiting[]', type: 'list sort createdAt', description: 'cho kiosk' },
    { name: 'claim verdict', type: 'session|error', description: 'bất kể expiry' }
  ],
  structures: [
    { name: 'token', type: 'str ~16 ký tự', description: 'urlsafe CSPRNG (demo: chuỗi giả cố định)' },
    { name: 'qrExpiresAt', type: 'ISO', description: 'createdAt + 120s; legacy thiếu → fallback cùng công thức' }
  ],
  complexity: {
    time: 'list_waiting O(N + W log W); kiosk pick O(W); claim O(N)+O(1)', space: 'O(N)',
    variables: 'N sessions, W waiting', simulation: 'Token giả cố định thay secrets; QR bitmap là placeholder — phần mô phỏng là TTL/sort/pick.'
  },
  codeRefs: [
    { path: 'backend/session_manager.py', line: 29, symbol: 'QR_DISPLAY_SECONDS=120.0', note: '' },
    { path: 'backend/session_manager.py', line: 200, endLine: 217, symbol: 'list_waiting_sessions', note: '' },
    { path: 'backend/session_manager.py', line: 355, endLine: 368, symbol: 'claim_session — không check expiry', note: '' },
    { path: 'frontend/src/components/EntryQRKiosk.tsx', line: 36, endLine: 39, symbol: '.at(-1) pick', note: '' }
  ],
  pseudocode: [
    { id: 'q1', text: 'create: qrExpiresAt = createdAt + 120s (legacy thiếu → fallback cùng công thức)' },
    { id: 'q2', text: 'waiting ← state==WAITING ∧ !claimed ∧ runtime match ∧ now<expiry, sort createdAt asc' },
    { id: 'q3', text: 'kiosk: waiting.at(-1) → vé mới nhất; timer ẩn khi hết' },
    { id: 'q4', text: 'claim: guard theo state — KHÔNG đọc qrExpiresAt' }
  ],
  edgeCases: [
    { title: 'Hết hạn chỉ ẩn khỏi kiosk', description: 'claim_session vẫn chấp nhận session quá hạn → SELECTING_SPOT — behavior thật, docs cũ ghi 10s sai (cả hai phía 120s).' },
    { title: 'Nhiều xe liên tiếp', description: 'Kiosk chỉ hiện QR mới nhất (.at(-1)); QR cũ vẫn quét được tới hết hạn riêng.' },
    { title: 'Race claim', description: 'Hai kiosk cùng thấy QR mới nhất; người thứ hai claim session đã claimed → no-op idempotent.' }
  ],
  simplifications: [
    { sourceBehavior: 'secrets.token_urlsafe(12) + qrcode.toDataURL render bitmap', demoBehavior: 'Token giả cố định + QR placeholder', reason: 'Phần dạy là TTL/sort/pick/claim — không port CSPRNG/QR ECC.' }
  ],
  related: ['entry-session-creation', 'session-state-machine', 'canonical-runtime-id-consumer'],
  aliases: ['qr-visibility-window'],
  parameters: [
    { key: 'now_offset_s', label: 'now offset (s, từ base 10:00:00Z)', type: 'number', min: 0, max: 240, step: 5, default: 100 },
    { key: 'ttl_s', label: 'QR TTL (s)', type: 'number', min: 10, max: 300, step: 10, default: 120 }
  ],
  scenarios: [
    {
      id: 'normal', title: '3 vé waiting — kiosk chọn mới nhất', edgeCase: false,
      description: 's-old (còn 20s) / s-mid / s-new → waiting sort asc → .at(-1) = s-new; s-done bị lọc (claimed+SELECTING).',
      input: {
        now_base: '2026-10-04T10:00:00.000Z',
        sessions: [
          { sessionId: 's-old', state: 'WAITING_FOR_SCAN', claimed: false, createdAt: '2026-10-04T10:00:00.000Z', qrExpiresAt: '2026-10-04T10:02:00.000Z', globalVehicleId: 3, runtimeId: 'rt-1' },
          { sessionId: 's-mid', state: 'WAITING_FOR_SCAN', claimed: false, createdAt: '2026-10-04T10:00:50.000Z', qrExpiresAt: '2026-10-04T10:02:50.000Z', globalVehicleId: 5, runtimeId: 'rt-1' },
          { sessionId: 's-new', state: 'WAITING_FOR_SCAN', claimed: false, createdAt: '2026-10-04T10:01:30.000Z', qrExpiresAt: '2026-10-04T10:03:30.000Z', globalVehicleId: 7, runtimeId: 'rt-1' },
          { sessionId: 's-done', state: 'SELECTING_SPOT', claimed: true, createdAt: '2026-10-04T10:01:35.000Z', qrExpiresAt: '2026-10-04T10:03:35.000Z', globalVehicleId: 9, runtimeId: 'rt-1' }
        ],
        claims: [{ sessionId: 's-new' }]
      },
      expected: { waiting: ['s-old', 's-mid', 's-new'], kiosk: 's-new', claim_s_new: 'SELECTING_SPOT' }
    },
    {
      id: 'edge', title: 'Vé hết hạn vẫn claim được', edgeCase: true,
      defaultParams: { now_offset_s: 130 },
      description: 'now=10:02:10Z → s-old hết hạn (ẩn khỏi kiosk); claim("s-old") vẫn → SELECTING_SPOT — expiry không chặn claim.',
      input: {
        now_base: '2026-10-04T10:00:00.000Z',
        sessions: [
          { sessionId: 's-old', state: 'WAITING_FOR_SCAN', claimed: false, createdAt: '2026-10-04T10:00:00.000Z', qrExpiresAt: '2026-10-04T10:02:00.000Z', globalVehicleId: 3, runtimeId: 'rt-1' },
          { sessionId: 's-mid', state: 'WAITING_FOR_SCAN', claimed: false, createdAt: '2026-10-04T10:00:50.000Z', qrExpiresAt: '2026-10-04T10:02:50.000Z', globalVehicleId: 5, runtimeId: 'rt-1' },
          { sessionId: 's-new', state: 'WAITING_FOR_SCAN', claimed: false, createdAt: '2026-10-04T10:01:30.000Z', qrExpiresAt: '2026-10-04T10:03:30.000Z', globalVehicleId: 7, runtimeId: 'rt-1' },
          { sessionId: 's-done', state: 'SELECTING_SPOT', claimed: true, createdAt: '2026-10-04T10:01:35.000Z', qrExpiresAt: '2026-10-04T10:03:35.000Z', globalVehicleId: 9, runtimeId: 'rt-1' }
        ],
        claims: [{ sessionId: 's-old' }]
      },
      expected: { waiting: ['s-mid', 's-new'], kiosk: 's-new', claim_s_old: 'SELECTING_SPOT (quá hạn vẫn claim)' }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var base = isoS(inp.now_base);
    var now = base + (params.now_offset_s != null ? params.now_offset_s : 100);
    var ttl = params.ttl_s != null ? params.ttl_s : 120;
    var F = [];
    /* waiting filter */
    var rows = inp.sessions.map(function (s2) {
      var exp = s2.qrExpiresAt ? isoS(s2.qrExpiresAt) : isoS(s2.createdAt) + ttl;
      var cre = isoS(s2.createdAt);
      var okState = s2.state === 'WAITING_FOR_SCAN';
      var okClaim = !s2.claimed;
      var okExp = now < exp;
      return { s: s2, cre: cre, exp: exp, left: exp - now, inWaiting: okState && okClaim && okExp, why: !okState ? 'state≠WAITING' : !okClaim ? 'claimed' : !okExp ? 'hết hạn' : 'ok' };
    });
    var waiting = rows.filter(function (r) { return r.inWaiting; }).sort(function (a, b) { return a.cre - b.cre; }).map(function (r) { return r.s.sessionId; });
    var kiosk = waiting.length ? waiting[waiting.length - 1] : null;
    rows.forEach(function (r, i) {
      F.push(mkFrame('filter-' + r.s.sessionId, ['q1', 'q2'],
        r.s.sessionId + ': state=' + r.s.state + ', claimed=' + r.s.claimed + ', còn ' + r2(r.left) + 's → ' + (r.inWaiting ? 'IN waiting' : 'loại (' + r.why + ')'),
        { waiting: dc(waiting), row: r.s.sessionId },
        [{ label: 'left', value: r2(r.left), unit: 's' }, { label: 'waiting', value: r.inWaiting }],
        { phase: 'filter', rows: rows.map(function (r2) { return { id: r2.s.sessionId, state: r2.s.state, claimed: r2.s.claimed, cre: r2.cre, exp: r2.exp, left: r2.left, inWaiting: r2.inWaiting, why: r2.why }; }), now: now, base: base, ttl: ttl, hl: r.s.sessionId, kiosk: kiosk }));
    });
    F.push(mkFrame('kiosk', ['q3'], 'kiosk .at(-1) → ' + (kiosk || 'không có vé') + ' — chỉ QR mới nhất hiển thị; vé cũ quét được tới hết hạn riêng.',
      { waiting: waiting, kiosk: kiosk },
      [{ label: 'kiosk', value: kiosk || '—' }],
      { phase: 'kiosk', rows: rows.map(function (r2) { return { id: r2.s.sessionId, state: r2.s.state, claimed: r2.s.claimed, cre: r2.cre, exp: r2.exp, left: r2.left, inWaiting: r2.inWaiting, why: r2.why }; }), now: now, base: base, ttl: ttl, kiosk: kiosk }));
    /* claims */
    var claimRes = {};
    (inp.claims || []).forEach(function (c) {
      var s2 = null;
      inp.sessions.forEach(function (x) { if (x.sessionId === c.sessionId) s2 = x; });
      var exp = s2.qrExpiresAt ? isoS(s2.qrExpiresAt) : isoS(s2.createdAt) + ttl;
      var expired = now >= exp;
      var ok = s2 && (s2.state === 'WAITING_FOR_SCAN' && !s2.claimed);
      claimRes[c.sessionId] = ok ? 'SELECTING_SPOT' + (expired ? ' (quá hạn vẫn claim)' : '') : 'claim-fail';
      F.push(mkFrame('claim-' + c.sessionId, ['q4'],
        'claim(' + c.sessionId + ') @' + r2(now - base) + 's: ' + (expired ? 'qrExpiresAt đã qua ' + r2(now - exp) + 's — ' : '') +
        'claim KHÔNG đọc expiry → guard theo state: ' + claimRes[c.sessionId] + '.',
        { claims: dc(claimRes) },
        [{ label: 'claim', value: claimRes[c.sessionId] }],
        { phase: 'claim', rows: rows.map(function (r2) { return { id: r2.s.sessionId, state: r2.s.state, claimed: r2.s.claimed, cre: r2.cre, exp: r2.exp, left: r2.left, inWaiting: r2.inWaiting, why: r2.why }; }), now: now, base: base, ttl: ttl, kiosk: kiosk, claimId: c.sessionId }));
    });
    var result = { waiting: waiting, kiosk: kiosk };
    Object.keys(claimRes).forEach(function (k) { result['claim_' + k] = claimRes[k]; });
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var b2 = isoS(i2.now_base), n2 = b2 + (p2.now_offset_s != null ? p2.now_offset_s : 100);
      var t2 = p2.ttl_s != null ? p2.ttl_s : 120;
      var w = i2.sessions.filter(function (s2) {
        var ex = s2.qrExpiresAt ? isoS(s2.qrExpiresAt) : isoS(s2.createdAt) + t2;
        return s2.state === 'WAITING_FOR_SCAN' && !s2.claimed && n2 < ex;
      }).sort(function (a, b) { return isoS(a.createdAt) - isoS(b.createdAt); }).map(function (s2) { return s2.sessionId; });
      var e = { waiting: w, kiosk: w.length ? w[w.length - 1] : null };
      (i2.claims || []).forEach(function (c) {
        var s2 = null;
        i2.sessions.forEach(function (x) { if (x.sessionId === c.sessionId) s2 = x; });
        var ex2 = s2.qrExpiresAt ? isoS(s2.qrExpiresAt) : isoS(s2.createdAt) + t2;
        var ok2 = s2 && s2.state === 'WAITING_FOR_SCAN' && !s2.claimed;
        e['claim_' + c.sessionId] = ok2 ? 'SELECTING_SPOT' + (n2 >= ex2 ? ' (quá hạn vẫn claim)' : '') : 'claim-fail';
      });
      return e;
    });
    var checks = [chk('waiting', result.waiting, expected.waiting), chk('kiosk pick', result.kiosk, expected.kiosk)];
    Object.keys(result).forEach(function (k) { if (k.indexOf('claim_') === 0 && expected[k] !== undefined) checks.push(chk(k, result[k], expected[k])); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Lane vé QR — thanh expiry chạy ngược', 'KIOSK SHOWING gắn vé mới nhất · vé hết hạn mờ');
    var rows = s.rows || [];
    var x0 = 40, x1 = env.width - 60, ty = 70, rh = 46;
    var tMax = s.ttl || 120;
    rows.forEach(function (r, i) {
      var y = ty + i * rh;
      var off = !r.inWaiting;
      var leftFrac = Math.max(0, Math.min(1, r.left / tMax));
      /* vé card */
      BX(ctx, x0, y, 130, 36, off ? 'rgba(255,255,255,.015)' : 'rgba(79,156,247,.10)', s.hl === r.id ? p.accent : (off ? p.grid : '#4f9cf7'), 6);
      T(ctx, r.id, x0 + 10, y + 15, { c: off ? p.muted : p.text, sz: 11.5, w: '700' });
      T(ctx, r.state.replace('WAITING_FOR_SCAN', 'WAITING').replace('SELECTING_SPOT', 'SELECTING'), x0 + 10, y + 29, { c: p.muted, sz: 9 });
      /* expiry bar */
      var bx = x0 + 150, bw = x1 - x0 - 150;
      BX(ctx, bx, y + 10, bw, 14, 'rgba(255,255,255,.04)', p.grid, 7);
      if (r.left > 0) BX(ctx, bx, y + 10, bw * leftFrac, 14, r.left < 25 ? 'rgba(242,85,90,.5)' : 'rgba(63,206,124,.45)', null, 7);
      T(ctx, (r.left > 0 ? 'còn ' + r2(r.left) + 's' : 'HẾT HẠN'), bx + bw * leftFrac + 6, y + 21, { c: r.left > 0 ? p.text : p.danger, sz: 10 });
      if (s.kiosk === r.id && r.inWaiting) PILL(ctx, bx + bw - 130, y - 6, '● KIOSK SHOWING', p.warning);
      if (s.claimId === r.id) PILL(ctx, x0 - 0, y + 38, 'claim → SELECTING_SPOT (expiry không chặn)', p.warning);
    });
    T(ctx, 'waiting = [' + rows.filter(function (r) { return r.inWaiting; }).map(function (r) { return r.id; }).join(', ') + ']  ·  sort createdAt asc → .at(-1) = vé mới nhất', x0, ty + rows.length * rh + 22, { c: p.muted, sz: 11 });
  }
});

/* ---------- C3 revision-optimistic-concurrency ---------- */
LESSONS.push({
  id: 'revision-optimistic-concurrency', pack: PACK_ID,
  title: 'expected_revision + actionReceipts idempotent',
  topic: 'Session lifecycle',
  summary: 'Chống lost-update giữa nhiều client mà không cần transaction — mỗi POST mang "tôi đang đọc revision nào" + "hành động này là duy nhất".',
  role: 'receipt khớp → return nguyên (không mutate); receipt sai signature → SessionConflict; expected≠revision → REVISION_CONFLICT kèm session; changed → revision+1 (kể cả chỉ ghi receipt).',
  inputTypes: [
    { name: 'session_id', type: 'str', description: '' },
    { name: 'expected_revision?', type: 'int', description: 'revision client đang đọc' },
    { name: 'action_id? + signature', type: 'str', description: 'idempotency key + nội dung action' }
  ],
  outputTypes: [
    { name: 'session′', type: 'dict', description: 'hoặc SessionConflict(current) / SessionNotFound' }
  ],
  structures: [
    { name: 'actionReceipts', type: 'map action_id→signature cap 32', description: 'receipt cũ hơn 32 → coi như mới' },
    { name: 'before/after diff', type: 'field set', description: 'changed trừ updatedAt/revision' }
  ],
  complexity: { time: 'O(N) load + O(F) diff + O(R≤32) receipt; save O(F_total)', space: 'O(N)', variables: '—', simulation: 'Giữ nguyên 5 bước mutate.' },
  codeRefs: [
    { path: 'backend/session_manager.py', line: 316, endLine: 352, symbol: '_mutate_session', note: '' },
    { path: 'backend/gate_session_controller.py', line: 807, endLine: 835, symbol: '409 REVISION_CONFLICT body kèm session', note: '' },
    { path: 'frontend/src/hooks/useVehicleSession.ts', line: 157, endLine: 160, symbol: 'expected_revision + action_id=uuid', note: '' }
  ],
  pseudocode: [
    { id: 'm1', text: 'lock; session thiếu → SessionNotFound' },
    { id: 'm2', text: 'action_id ∈ receipts: signature khác → Conflict; khớp → return nguyên (không mutate)' },
    { id: 'm3', text: 'expected_revision ≠ session.revision → SessionConflict(current)' },
    { id: 'm4', text: 'before=copy; mutate; action_id → receipts[id]=signature (giữ 32 gần nhất)' },
    { id: 'm5', text: 'changed (trừ updatedAt/revision) → revision+1 + save; else giữ rev' }
  ],
  edgeCases: [
    { title: 'Receipt mới luôn bump rev', description: 'Ghi actionReceipts làm changed=True → POST action_id mới bump rev kể cả mutate no-op; retry cùng action_id thoát bước 2 → không bump.' },
    { title: 'Cùng action_id đổi ý định', description: 'signature select:A01 → đổi sang select:B02 → conflict rõ, không âm thầm đổi.' },
    { title: 'Cap 32', description: 'action_id cũ hơn 32 receipt gần nhất → coi như mới → có thể mutate lại — cửa sổ idempotency hữu hạn.' }
  ],
  simplifications: [],
  related: ['session-state-machine', 'spot-reservation-availability', 'atomic-session-store'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Dedup + signature-conflict + revision-conflict', edgeCase: false,
      description: 'u-1 mutate→rev4; retry u-1 → return nguyên; u-1 đổi spot → conflict; u-2 → rev5; u-3 expected=4 → REVISION_CONFLICT.',
      input: {
        initial: { sessionId: 's-1', state: 'SELECTING_SPOT', globalVehicleId: 5, revision: 3, claimed: true, actionReceipts: {} },
        ops: [
          { op: 'select', spotId: 'A01', expected_revision: 3, action_id: 'u-1' },
          { op: 'select', spotId: 'A01', expected_revision: 3, action_id: 'u-1' },
          { op: 'select', spotId: 'B02', expected_revision: 3, action_id: 'u-1' },
          { op: 'select', spotId: 'B02', expected_revision: 4, action_id: 'u-2' },
          { op: 'select', spotId: 'C03', expected_revision: 4, action_id: 'u-3' }
        ]
      },
      expected: {
        verdicts: ['mutate→rev4', 'dedup→rev4', 'conflict:signature', 'mutate→rev5', 'conflict:revision'],
        receipts: { 'u-1': 'select:A01', 'u-2': 'select:B02' }
      }
    },
    {
      id: 'edge', title: 'Receipt cap 32 — action cũ mutate lại', edgeCase: true,
      description: 'Sau 33 action khác, action_id u-1 đã trôi khỏi cap → replay u-1 được coi như mới → mutate lại (cửa sổ idempotency hữu hạn).',
      input: {
        initial: { sessionId: 's-1', state: 'SELECTING_SPOT', globalVehicleId: 5, revision: 3, claimed: true, actionReceipts: {} },
        ops: (function () {
          var a = [{ op: 'select', spotId: 'A01', expected_revision: 3, action_id: 'u-1' }];
          for (var i = 0; i < 33; i++) a.push({ op: 'noop-touch', tag: 'filler-' + i, expected_revision: 'auto', action_id: 'f-' + i });
          a.push({ op: 'select', spotId: 'B02', expected_revision: 'auto', action_id: 'u-1' });
          return a;
        })()
      },
      expected: {
        verdicts_head: ['mutate→rev4'], verdicts_tail: 'mutate→rev(receipt mới)',
        note: 'u-1 trôi cap 32 → replay mutate lại'
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var sess = inp.initial;
    sess.actionReceipts = sess.actionReceipts || {};
    var F = [], verdicts = [];
    inp.ops.forEach(function (op, i) {
      var sig = op.op + ':' + (op.spotId !== undefined ? op.spotId : (op.tag || ''));
      var er = op.expected_revision === 'auto' ? sess.revision : op.expected_revision;
      var verdict, expl, lines;
      if (op.action_id && sess.actionReceipts[op.action_id] !== undefined) {
        if (sess.actionReceipts[op.action_id] === sig) {
          verdict = 'dedup→rev' + sess.revision;
          expl = 'action_id ' + op.action_id + ' signature khớp → return nguyên, KHÔNG mutate.';
          lines = ['m2'];
        } else {
          verdict = 'conflict:signature';
          expl = 'action_id ' + op.action_id + ' đã ghi signature "' + sess.actionReceipts[op.action_id] + '" ≠ "' + sig + '" → SessionConflict.';
          lines = ['m2'];
        }
      } else if (er !== sess.revision) {
        verdict = 'conflict:revision';
        expl = 'expected_revision=' + er + ' ≠ session.revision=' + sess.revision + ' → REVISION_CONFLICT + body session hiện tại.';
        lines = ['m3'];
      } else {
        /* mutate */
        var before = dc(sess);
        if (op.op === 'select') {
          sess.targetSpotId = op.spotId;
          sess.state = sess.actualParkedSpotId ? 'RELOCATING' : 'NAVIGATING_TO_SPOT';
        }
        if (op.action_id) {
          sess.actionReceipts[op.action_id] = sig;
          var ids = Object.keys(sess.actionReceipts);
          if (ids.length > 32) delete sess.actionReceipts[ids[0]];
        }
        var changed = !deepEq(
          (function (s2) { var c = dc(s2); delete c.revision; delete c.updatedAt; return c; })(before),
          (function (s2) { var c = dc(s2); delete c.revision; delete c.updatedAt; return c; })(sess));
        if (changed) sess.revision = (sess.revision || 1) + 1;
        verdict = 'mutate→rev' + sess.revision;
        expl = op.op + ' → mutate; action_id mới ghi receipt → changed → rev ' + sess.revision +
          (op.op === 'select' ? '; target=' + op.spotId : '') + '.';
        lines = ['m4', 'm5'];
      }
      verdicts.push(verdict);
      F.push(mkFrame('op' + (i + 1), lines,
        (op.action_id || 'no-id') + ' · ' + op.op + (op.spotId !== undefined ? ' ' + op.spotId : '') + ' (exp=' + er + '): ' + expl,
        { session: dc(sess), verdict: verdict, op: op },
        [{ label: 'verdict', value: verdict }, { label: 'rev', value: sess.revision }, { label: 'receipts', value: Object.keys(sess.actionReceipts).length }],
        { phase: 'op', idx: i, ops: inp.ops, verdicts: dc(verdicts), session: dc(sess), hl: i }));
    });
    F.push(mkFrame('done', ['m5'], 'Kết: rev=' + sess.revision + ', receipts=' + Object.keys(sess.actionReceipts).length + ' (cap 32).',
      { session: sess, verdicts: verdicts }, [], { phase: 'done', ops: inp.ops, verdicts: verdicts, session: sess }));
    var result = { verdicts: verdicts, receipts: dc(sess.actionReceipts) };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [];
    if (expected.verdicts) checks.push(chk('verdicts', result.verdicts, expected.verdicts));
    if (expected.verdicts_head) checks.push(chk('verdict đầu', result.verdicts.slice(0, expected.verdicts_head.length), expected.verdicts_head));
    if (expected.verdicts_tail) checks.push(chk('verdict cuối', /^mutate→rev/.test(result.verdicts[result.verdicts.length - 1]) ? 'mutate→rev(receipt mới)' : result.verdicts[result.verdicts.length - 1], expected.verdicts_tail));
    if (expected.receipts) checks.push(chk('receipts', result.receipts, expected.receipts));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Hai client → hộp khóa → revision counter', 'vàng: request đang xét · xanh: receipt đã ghi');
    var ops = s.ops || [], vds = s.verdicts || [];
    var sess = s.session || {};
    /* revision counter */
    BX(ctx, 24, 60, 140, 70, 'rgba(63,206,124,.08)', p.success, 10);
    T(ctx, 'revision', 94, 82, { c: p.muted, sz: 11, a: 'center' });
    T(ctx, String(sess.revision == null ? '—' : sess.revision), 94, 116, { c: p.success, sz: 30, a: 'center', w: '800' });
    /* receipts */
    var rx = 190, ry = 60;
    T(ctx, 'actionReceipts (cap 32)', rx, ry - 8, { c: p.muted, sz: 10.5 });
    BX(ctx, rx, ry, 230, 70, 'rgba(255,255,255,.03)', p.grid, 8);
    var rec = sess.actionReceipts || {}, rkeys = Object.keys(rec).slice(-5);
    rkeys.forEach(function (k, i) {
      T(ctx, k + ' → ' + rec[k], rx + 10, ry + 16 + i * 12, { c: p.accent, sz: 9.5, f: 'monospace' });
    });
    if (!rkeys.length) T(ctx, '(trống)', rx + 10, ry + 24, { c: p.muted, sz: 10 });
    /* ops list */
    var oy = 150, step = Math.min(24, (env.height - oy - 30) / Math.max(1, ops.length));
    ops.forEach(function (op, i) {
      var y = oy + i * step;
      var vd = vds[i];
      var c = vd == null ? p.grid : vd.indexOf('conflict') === 0 ? p.danger : vd.indexOf('dedup') === 0 ? p.warning : p.success;
      var hl = s.hl === i;
      if (hl) LN(ctx, 24, y + 10, 44, y + 10, p.accent, 2);
      T(ctx, (op.action_id || '·') + ' ' + op.op + (op.spotId !== undefined ? ':' + op.spotId : ''), 50, y + 13, { c: hl ? p.text : p.muted, sz: 10.5 });
      if (vd) PILL(ctx, env.width - 190, y + 13, vd, c);
    });
    /* state */
    PILL(ctx, 24, env.height - 20, 'state: ' + (sess.state || '—') + ' · target: ' + (sess.targetSpotId || '—'), p.accent);
  }
});

/* ---------- C4 spot-reservation-availability ---------- */
LESSONS.push({
  id: 'spot-reservation-availability', pack: PACK_ID,
  title: 'Chuỗi 4-gate validate chọn ô',
  topic: 'Session lifecycle',
  summary: 'Rào 4 lớp trước khi gán targetSpotId — đúng runtime, không session khác giữ, runtime tươi (local monotonic ≤5s), ô thật sự trống.',
  role: 'runtime mismatch → 409; reservation (NAVIGATING/RELOCATING giữ spot) → 409 SPOT_RESERVED; availability None (>5s hoặc fresh fail hoặc slot không có) → 503 RUNTIME_UNAVAILABLE; occupied → 409.',
  inputTypes: [
    { name: 'session', type: 'dict', description: '{runtimeId, sessionId}' },
    { name: 'spot_id', type: 'str', description: 'ô muốn chọn' },
    { name: 'latest runtime + sessions', type: 'context', description: 'snapshot mới nhất + store' }
  ],
  outputTypes: [{ name: 'pass | SelectionUnavailable(code,status)', type: 'verdict', description: '' }],
  structures: [
    { name: 'reservations', type: 'list sort (spotId,reservedAt)', description: 'session khác có targetSpotId ∧ state∈{NAVIGATING,RELOCATING}' },
    { name: '_latest_runtime_received_at', type: 'monotonic s', description: 'freshness theo local receive-time, không phải published_at' }
  ],
  complexity: { time: 'O(N + R log R + S)', space: 'O(N + R)', variables: 'N sessions, R reservations, S~60 slot', simulation: 'Giữ nguyên.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 69, endLine: 89, symbol: '_validate_selection', note: '' },
    { path: 'backend/gate_session_controller.py', line: 92, endLine: 100, symbol: '_spot_is_available', note: '' },
    { path: 'backend/gate_session_controller.py', line: 154, endLine: 178, symbol: '_latest_spot_availability', note: 'freshness = local monotonic receive-time' },
    { path: 'backend/session_manager.py', line: 220, endLine: 252, symbol: 'list_navigation_reservations', note: '' }
  ],
  pseudocode: [
    { id: 'v1', text: 'session.runtimeId khác latest → RUNTIME_MISMATCH 409' },
    { id: 'v2', text: 'reservations (NAVIGATING/RELOCATING, exclude self) chứa spot → SPOT_RESERVED 409' },
    { id: 'v3', text: 'availability None (snapshot >5s theo receive-time / fresh fail / slot thiếu) → RUNTIME_UNAVAILABLE 503' },
    { id: 'v4', text: 'availability false → SPOT_NOT_AVAILABLE 409 (available ⇔ !occupied ∧ status=="empty")' },
    { id: 'v5', text: 'file-mode: tra sample json; lỗi/không có → True' }
  ],
  edgeCases: [
    { title: 'Slot không tồn tại', description: 'availability=None → báo giống lỗi runtime stale (RUNTIME_UNAVAILABLE 503), không phải "ô không có".' },
    { title: 'Session runtimeId=None', description: 'khớp mọi runtime — session file-mode chiếm được ô trên runtime live.' },
    { title: 'Session ma NAVIGATING', description: 'giữ ô mãi — reservation chỉ clear khi transition.' }
  ],
  simplifications: [],
  related: ['revision-optimistic-concurrency', 'session-state-machine', 'live-freshness-contract'],
  aliases: [],
  parameters: [
    { key: 'now_mono', label: 'now monotonic (s)', type: 'number', min: 100, max: 110, step: 0.5, default: 102 },
    { key: 'spot', label: 'Spot chọn', type: 'select', options: ['A01', 'B02', 'C05'], default: 'B02' }
  ],
  scenarios: [
    {
      id: 'normal', title: '3 ô — reserved / occupied / pass', edgeCase: false,
      description: 'B02 bị s-a giữ → SPOT_RESERVED; A01 occupied → SPOT_NOT_AVAILABLE; C05 trống → pass.',
      input: {
        latest_runtime: { runtime_id: 'rt-1', received_at_mono: 100.0, parking_slots: [
          { slot_id: 'A01', occupied: true, status: 'occupied' },
          { slot_id: 'B02', occupied: false, status: 'empty' },
          { slot_id: 'C05', occupied: false, status: 'empty' }
        ] },
        sessions: [
          { sessionId: 's-a', state: 'NAVIGATING_TO_SPOT', targetSpotId: 'B02', runtimeId: 'rt-1' },
          { sessionId: 's-b', state: 'SELECTING_SPOT', runtimeId: 'rt-1' }
        ],
        select_for: 's-b', try_spots: ['B02', 'A01', 'C05']
      },
      expected: { B02: 'SPOT_RESERVED:409', A01: 'SPOT_NOT_AVAILABLE:409', C05: 'pass' }
    },
    {
      id: 'edge', title: 'Snapshot cũ >5s + slot không tồn tại', edgeCase: true,
      defaultParams: { now_mono: 106 },
      description: 'receive@100, now=106 → mọi ô → RUNTIME_UNAVAILABLE 503; D99 không trong parking_slots cũng → 503 (không phải "ô không có").',
      input: {
        latest_runtime: { runtime_id: 'rt-1', received_at_mono: 100.0, parking_slots: [
          { slot_id: 'A01', occupied: true, status: 'occupied' },
          { slot_id: 'B02', occupied: false, status: 'empty' },
          { slot_id: 'C05', occupied: false, status: 'empty' }
        ] },
        sessions: [
          { sessionId: 's-a', state: 'NAVIGATING_TO_SPOT', targetSpotId: 'B02', runtimeId: 'rt-1' },
          { sessionId: 's-b', state: 'SELECTING_SPOT', runtimeId: 'rt-1' }
        ],
        select_for: 's-b', try_spots: ['B02', 'A01', 'C05', 'D99']
      },
      expected: { B02: 'SPOT_RESERVED:409', A01: 'RUNTIME_UNAVAILABLE:503', C05: 'RUNTIME_UNAVAILABLE:503', D99: 'RUNTIME_UNAVAILABLE:503' }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var now = params.now_mono != null ? params.now_mono : 102;
    var rt = inp.latest_runtime;
    var fresh = (now - rt.received_at_mono) <= 5;
    var me = null;
    inp.sessions.forEach(function (s2) { if (s2.sessionId === inp.select_for) me = s2; });
    var reservations = inp.sessions.filter(function (s2) {
      return s2.sessionId !== me.sessionId && s2.targetSpotId &&
        (s2.state === 'NAVIGATING_TO_SPOT' || s2.state === 'RELOCATING');
    }).map(function (s2) { return { sessionId: s2.sessionId, spotId: s2.targetSpotId }; });
    var F = [], verdicts = {};
    /* param spot = ô được chọn thử trước — đưa lên đầu danh sách (đổi thứ tự trace) */
    var spots = params.spot
      ? [params.spot].concat(inp.try_spots.filter(function (s2) { return s2 !== params.spot; }))
      : inp.try_spots.slice();
    spots.forEach(function (spot) {
      var verdict, lines = ['v1'], expl;
      if (me.runtimeId && me.runtimeId !== rt.runtime_id) {
        verdict = 'RUNTIME_MISMATCH:409'; expl = 'runtimeId ' + me.runtimeId + ' ≠ ' + rt.runtime_id;
      } else {
        var res = reservations.filter(function (r) { return r.spotId === spot; });
        if (res.length) {
          verdict = 'SPOT_RESERVED:409';
          expl = spot + ' đang bị ' + res.map(function (r) { return r.sessionId; }).join(',') + ' giữ (NAVIGATING/RELOCATING)';
          lines = ['v1', 'v2'];
        } else {
          var slot = null;
          rt.parking_slots.forEach(function (sl) { if (sl.slot_id === spot) slot = sl; });
          var avail = slot ? (!slot.occupied && slot.status === 'empty') : null;
          if (!fresh || avail === null) {
            verdict = 'RUNTIME_UNAVAILABLE:503';
            expl = !fresh ? 'snapshot cũ ' + r2(now - rt.received_at_mono) + 's > 5s (receive-time monotonic)' : 'slot ' + spot + ' không có trong parking_slots → availability None';
            lines = ['v1', 'v2', 'v3'];
          } else if (!avail) {
            verdict = 'SPOT_NOT_AVAILABLE:409';
            expl = spot + ' occupied/status≠empty → ô không trống';
            lines = ['v1', 'v2', 'v3', 'v4'];
          } else {
            verdict = 'pass';
            expl = spot + ' qua cả 4 gate → gán targetSpotId';
            lines = ['v1', 'v2', 'v3', 'v4'];
          }
        }
      }
      verdicts[spot] = verdict;
      F.push(mkFrame('spot-' + spot, lines, 'select ' + spot + ': ' + expl + ' → ' + verdict,
        { spot: spot, verdict: verdict, verdicts: dc(verdicts) },
        [{ label: 'verdict', value: verdict }],
        { phase: 'eval', inp: inp, reservations: reservations, fresh: fresh, now: now, recv: rt.received_at_mono, verdicts: dc(verdicts), hl: spot }));
    });
    F.push(mkFrame('done', ['v1'], 'Verdict: ' + JSON.stringify(verdicts) + ' — check+set nguyên tử dưới _STORE_LOCK.',
      { verdicts: verdicts }, [], { phase: 'done', inp: inp, reservations: reservations, fresh: fresh, now: now, recv: rt.received_at_mono, verdicts: verdicts }));
    var result = verdicts;
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var n2 = p2.now_mono != null ? p2.now_mono : 102;
      var fr = (n2 - i2.latest_runtime.received_at_mono) <= 5;
      var me2 = null, res2 = [];
      i2.sessions.forEach(function (s2) { if (s2.sessionId === i2.select_for) me2 = s2; });
      i2.sessions.forEach(function (s2) {
        if (s2.sessionId !== me2.sessionId && s2.targetSpotId && (s2.state === 'NAVIGATING_TO_SPOT' || s2.state === 'RELOCATING')) res2.push(s2.targetSpotId);
      });
      var e = {};
      i2.try_spots.forEach(function (sp) {
        if (me2.runtimeId && me2.runtimeId !== i2.latest_runtime.runtime_id) { e[sp] = 'RUNTIME_MISMATCH:409'; return; }
        if (res2.indexOf(sp) >= 0) { e[sp] = 'SPOT_RESERVED:409'; return; }
        var sl = null;
        i2.latest_runtime.parking_slots.forEach(function (x) { if (x.slot_id === sp) sl = x; });
        var av = sl ? (!sl.occupied && sl.status === 'empty') : null;
        if (!fr || av === null) { e[sp] = 'RUNTIME_UNAVAILABLE:503'; return; }
        e[sp] = av ? 'pass' : 'SPOT_NOT_AVAILABLE:409';
      });
      return e;
    });
    var checks = Object.keys(result).map(function (k) { return chk(k, result[k], expected[k]); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Phễu 4 cổng validate', 'request dừng tại cổng fail — code+status đỏ');
    var gates = ['RUNTIME', 'RESERVED', 'FRESH', 'EMPTY'];
    var gy = 70, gh = 44;
    gates.forEach(function (g, i) {
      var x = 30 + i * 140;
      BX(ctx, x, gy, 120, gh, 'rgba(255,255,255,.04)', p.grid, 8);
      T(ctx, 'G' + (i + 1), x + 8, gy + 17, { c: p.muted, sz: 9 });
      T(ctx, g, x + 60, gy + 30, { c: p.text, sz: 11, a: 'center', w: '700' });
      if (i < gates.length - 1) AR(ctx, x + 122, gy + gh / 2, x + 138, gy + gh / 2, p.grid, 1.5);
    });
    /* spot cards */
    var verdicts = s.verdicts || {};
    var spots = (s.inp && s.inp.try_spots) || [];
    var sy = gy + 80;
    spots.forEach(function (sp, i) {
      var y = sy + i * 52;
      var vd = verdicts[sp];
      var stopGate = vd ? (vd.indexOf('RESERVED') === 0 ? 1 : vd.indexOf('RUNTIME_UNAVAIL') === 0 ? 2 : vd.indexOf('NOT_AVAIL') === 0 ? 3 : vd.indexOf('MISMATCH') === 0 ? 0 : 4) : null;
      /* request card đi qua các cổng */
      var reach = stopGate == null ? 0 : Math.min(stopGate, 4);
      for (var gi = 0; gi <= reach && gi < 4; gi++) {
        var gx = 30 + gi * 140 + 60;
        DOT(ctx, gx, y + 12, 5, gi < stopGate || vd === 'pass' ? p.success : (gi === stopGate ? p.danger : p.grid));
      }
      var c = vd == null ? p.grid : vd === 'pass' ? p.success : p.danger;
      BX(ctx, env.width - 250, y - 4, 230, 32, 'rgba(255,255,255,.03)', s.hl === sp ? p.accent : c, 6);
      T(ctx, sp, env.width - 238, y + 16, { c: p.text, sz: 12, w: '700' });
      if (vd) T(ctx, vd, env.width - 26, y + 16, { c: c, sz: 10.5, a: 'right', w: '600' });
    });
    /* freshness bar */
    var fy = sy + spots.length * 52 + 16;
    T(ctx, 'snapshot freshness (local receive-time): recv@' + (s.recv || 0) + 's, now=' + (s.now || 0) + 's → ' + (s.fresh ? 'TƯƠI ≤5s' : 'CŨ >5s'), 30, fy, { c: s.fresh ? p.success : p.danger, sz: 11 });
    var res = s.reservations || [];
    if (res.length) T(ctx, 'reservations: ' + res.map(function (r) { return r.sessionId + '→' + r.spotId; }).join(', '), 30, fy + 18, { c: p.warning, sz: 10.5 });
  }
});

/* ---------- C5 live-observation-cache ---------- */
LESSONS.push({
  id: 'live-observation-cache', pack: PACK_ID,
  title: 'Cache vị trí nóng (RAM) tách khỏi persist',
  topic: 'Session lifecycle',
  summary: 'Vị trí xe đổi 4–5 lần/giây — không ghi đĩa mỗi frame; giữ RAM keyed session, chỉ "đóng gói" vào lastKnownPosition lúc transition hoặc GET.',
  role: 'persist=False (v2): cache[(file,sid)] = (identity(rt,gid,createdAt), pos), FIFO-1024; _with_live_observation copy vào session khi GET; transition pack cache → file. persist=True (legacy): ghi file.',
  inputTypes: [
    { name: 'global_id, position', type: 'int,point', description: 'observation mới' },
    { name: 'persist', type: 'bool', description: 'v2=false, legacy=true' }
  ],
  outputTypes: [{ name: 'session với lastKnownPosition merge', type: 'dict|null', description: '' }],
  structures: [
    { name: '_LIVE_OBSERVATIONS', type: 'dict[(file,sid)→(identity,pos)] FIFO 1024', description: 'identity tuple chống rò sau remap/recreate' }
  ],
  complexity: { time: 'O(1) update + O(N) find_by_gid', space: 'O(min(N,1024))', variables: '—', simulation: 'Giữ nguyên key/identity/FIFO.' },
  codeRefs: [
    { path: 'backend/session_manager.py', line: 32, endLine: 46, symbol: '_LIVE_OBSERVATIONS + _with_live_observation', note: '' },
    { path: 'backend/session_manager.py', line: 471, endLine: 502, symbol: 'update_global_vehicle_observation', note: 'persist=False :485-492' },
    { path: 'backend/session_manager.py', line: 348, endLine: 350, symbol: 'pack cache → file lúc transition', note: '' }
  ],
  pseudocode: [
    { id: 'c1', text: 'session ← find_by_gid(gid, runtime); None → return None' },
    { id: 'c2', text: 'persist=False: cache[(file,sid)] = (identity(rt,gid,createdAt), pos); len>1024 → pop oldest' },
    { id: 'c3', text: 'GET: _with_live_observation — cache hit ∧ identity khớp → copy vào lastKnownPosition' },
    { id: 'c4', text: 'persist=True (legacy): mutate ghi lastKnownPosition (+activeTrackId) vào file' },
    { id: 'c5', text: 'transition thành công → lastKnownPosition ← cache trước save' }
  ],
  edgeCases: [
    { title: 'Session recreated cùng gid', description: 'createdAt khác → identity mismatch → cache cũ không rò sang session mới.' },
    { title: 'File không phải nguồn vị trí live', description: 'GET trả vị trí nóng từ RAM; file JSON trên đĩa vẫn vị trí cũ.' },
    { title: 'FIFO evict', description: 'pop theo insertion-order, không reinsert — >1024 session đồng thời mới mất dữ liệu.' }
  ],
  simplifications: [],
  related: ['atomic-session-store', 'identity-alias-remap-backend', 'revision-optimistic-concurrency'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'RAM nóng vs disk lạnh — transition pack', edgeCase: false,
      description: '2 update persist=False → GET trả {120,55} nhưng file giữ null; select transition → file ghi {120,55}; update cuối → GET {140,58}, file vẫn {120,55}.',
      input: {
        session: { sessionId: 's-5', runtimeId: 'rt-1', globalVehicleId: 5, createdAt: 'T0', state: 'NAVIGATING_TO_SPOT', lastKnownPosition: null },
        updates: [
          { gid: 5, pos: { x: 100, y: 50 }, persist: false },
          { gid: 5, pos: { x: 120, y: 55 }, persist: false },
          { op: 'select', spotId: 'A01' },
          { gid: 5, pos: { x: 140, y: 58 }, persist: false }
        ]
      },
      expected: {
        get_after: [{ x: 100, y: 50 }, { x: 120, y: 55 }, { x: 120, y: 55 }, { x: 140, y: 58 }],
        file_after: [null, null, { x: 120, y: 55 }, { x: 120, y: 55 }]
      }
    },
    {
      id: 'edge', title: 'Identity mismatch sau recreate — cache không rò', edgeCase: true,
      description: 'Session mới cùng gid nhưng createdAt khác → cache cũ identity lệch → GET trả lastKnownPosition file (null), không lấy cache cũ.',
      input: {
        session: { sessionId: 's-5', runtimeId: 'rt-1', globalVehicleId: 5, createdAt: 'T0', state: 'NAVIGATING_TO_SPOT', lastKnownPosition: null },
        updates: [
          { gid: 5, pos: { x: 100, y: 50 }, persist: false },
          { op: 'recreate', newSession: { sessionId: 's-5b', runtimeId: 'rt-1', globalVehicleId: 5, createdAt: 'T9', state: 'WAITING_FOR_SCAN', lastKnownPosition: null } },
          { gid: 5, pos: { x: 200, y: 60 }, persist: false }
        ]
      },
      expected: {
        get_after: [{ x: 100, y: 50 }, null, { x: 200, y: 60 }],
        file_after: [null, null, null]
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var sess = dc(inp.session);
    var fileStore = {}; fileStore[sess.sessionId] = dc(sess);
    var cache = {}; /* sid → {identity, pos} */
    function identityOf(s2) { return [s2.runtimeId, s2.globalVehicleId, s2.createdAt].join('|'); }
    var F = [], getAfter = [], fileAfter = [];
    inp.updates.forEach(function (u, i) {
      var expl, lines;
      if (u.op === 'select') {
        var idt = identityOf(sess);
        var ce = cache[sess.sessionId];
        if (ce && ce.identity === idt) sess.lastKnownPosition = dc(ce.pos);
        fileStore[sess.sessionId] = dc(sess);
        expl = 'transition ' + u.op + ' ' + (u.spotId || '') + ' → pack cache vào file: lastKnownPosition=' + JSON.stringify(sess.lastKnownPosition);
        lines = ['c5'];
        getAfter.push(dc(sess.lastKnownPosition));
        fileAfter.push(dc(sess.lastKnownPosition));
      } else if (u.op === 'recreate') {
        sess = dc(u.newSession);
        fileStore[sess.sessionId] = dc(sess);
        expl = 'recreate session cùng gid, createdAt mới → identity mới; cache cũ của sid trước không khớp identity → không rò.';
        lines = ['c3'];
        getAfter.push(null);
        fileAfter.push(dc(sess.lastKnownPosition));
      } else {
        var idt2 = identityOf(sess);
        if (u.persist) {
          sess.lastKnownPosition = dc(u.pos);
          fileStore[sess.sessionId] = dc(sess);
          expl = 'persist=TRUE (legacy) → ghi thẳng file: ' + JSON.stringify(u.pos);
          lines = ['c4'];
        } else {
          cache[sess.sessionId] = { identity: idt2, pos: dc(u.pos) };
          var keys = Object.keys(cache);
          if (keys.length > 1024) delete cache[keys[0]];
          expl = 'persist=FALSE (v2) → chỉ ghi RAM cache[' + sess.sessionId + ']=' + JSON.stringify(u.pos) + '; file không đổi.';
          lines = ['c1', 'c2'];
        }
        var ce2 = cache[sess.sessionId];
        var getPos = (ce2 && ce2.identity === identityOf(sess)) ? dc(ce2.pos) : dc(sess.lastKnownPosition);
        getAfter.push(getPos);
        fileAfter.push(dc(sess.lastKnownPosition));
      }
      F.push(mkFrame('u' + (i + 1), lines || ['c2'], (u.op ? u.op : 'update gid' + u.gid) + ': ' + expl,
        { cache: dc(cache), session: dc(sess), file: dc(fileStore), getPos: getAfter[getAfter.length - 1] },
        [{ label: 'GET trả', value: JSON.stringify(getAfter[getAfter.length - 1]) },
         { label: 'file giữ', value: JSON.stringify(fileAfter[fileAfter.length - 1]) }],
        { phase: 'step', idx: i, cache: dc(cache), file: dc(fileStore), session: dc(sess), hl: i, persist: u.persist }));
    });
    F.push(mkFrame('done', ['c3'], 'RAM cache ≠ disk file — GET đọc cache còn file chỉ đổi lúc transition. Identity tuple chặn rò sau recreate.',
      { getAfter: getAfter, fileAfter: fileAfter }, [],
      { phase: 'done', cache: cache, file: fileStore }));
    var result = { get_after: getAfter, file_after: fileAfter };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [chk('GET sau từng bước', result.get_after, expected.get_after), chk('file sau từng bước', result.file_after, expected.file_after)];
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'RAM cache (vàng) ↔ Disk file (xám)', 'GET đọc RAM; file chỉ đổi khi transition');
    var midX = env.width / 2;
    /* RAM column */
    BX(ctx, 24, 56, midX - 40, env.height - 130, 'rgba(240,169,60,.05)', '#f0a93c', 10);
    T(ctx, 'RAM — _LIVE_OBSERVATIONS (mất khi restart)', 40, 80, { c: '#f0a93c', sz: 12, w: '700' });
    var cache = s.cache || {};
    var ck = Object.keys(cache);
    ck.forEach(function (k, i) {
      var ce = cache[k];
      BX(ctx, 40, 94 + i * 56, midX - 90, 46, 'rgba(255,255,255,.04)', p.grid, 6);
      T(ctx, k, 50, 94 + i * 56 + 17, { c: p.text, sz: 11, w: '700' });
      T(ctx, 'pos ' + JSON.stringify(ce.pos), 50, 94 + i * 56 + 32, { c: p.muted, sz: 10 });
      T(ctx, 'identity: ' + ce.identity, 50, 94 + i * 56 + 42, { c: '#8a93a8', sz: 8.5 });
    });
    if (!ck.length) T(ctx, '(cache trống)', 40, 110, { c: p.muted, sz: 11 });
    T(ctx, ck.length + '/1024', midX - 60, 80, { c: p.muted, sz: 10 });
    /* arrow */
    AR(ctx, midX - 24, 100, midX + 24, 100, p.grid, 2);
    T(ctx, 'transition\npack', midX - 14, 130, { c: p.muted, sz: 9 });
    /* DISK column */
    BX(ctx, midX + 30, 56, midX - 54, env.height - 130, 'rgba(255,255,255,.03)', p.grid, 10);
    T(ctx, 'DISK — sessions.json', midX + 46, 80, { c: p.muted, sz: 12, w: '700' });
    var file = s.file || {};
    Object.keys(file).forEach(function (k, i) {
      var fs = file[k];
      BX(ctx, midX + 46, 94 + i * 64, midX - 110, 54, 'rgba(255,255,255,.04)', p.grid, 6);
      T(ctx, k + ' · ' + (fs.state || ''), midX + 56, 94 + i * 64 + 18, { c: p.text, sz: 11, w: '700' });
      T(ctx, 'lastKnownPosition: ' + JSON.stringify(fs.lastKnownPosition == null ? null : fs.lastKnownPosition), midX + 56, 94 + i * 64 + 36, { c: p.muted, sz: 10 });
    });
    /* GET badge */
    var sess = s.session || {};
    var ce2 = s.session && cache[sess.sessionId];
    var getPos = ce2 && ce2.identity === [sess.runtimeId, sess.globalVehicleId, sess.createdAt].join('|') ? ce2.pos : sess.lastKnownPosition;
    BX(ctx, midX - 90, env.height - 60, 180, 30, 'rgba(79,156,247,.10)', p.accent, 8);
    T(ctx, 'GET → ' + JSON.stringify(getPos == null ? null : getPos), midX, env.height - 40, { c: p.accent, sz: 11, a: 'center', w: '700' });
  }
});

/* ---------- C6 atomic-session-store ---------- */
LESSONS.push({
  id: 'atomic-session-store', pack: PACK_ID,
  title: 'Ghi file nguyên tử + load chịu lỗi',
  topic: 'Session lifecycle',
  summary: 'Persistence tối giản an toàn-trong-process: không file nửa-vở khi crash giữa ghi; file hỏng → trả {} thay vì crash.',
  role: 'tmp cùng dir → json.dump+flush+fsync → os.replace (atomic same-fs) → cleanup tmp; load: !exists/corrupt/non-dict → {}; mọi op trong _STORE_LOCK.',
  inputTypes: [
    { name: 'path, data', type: 'path,dict', description: 'file JSON {sessionId→session}' }
  ],
  outputTypes: [{ name: 'file thay thế nguyên tử | {} khi load lỗi', type: 'dict', description: '' }],
  structures: [
    { name: 'sessions.json', type: 'dict', description: 'full rewrite mỗi save' },
    { name: '_STORE_LOCK', type: 'RLock', description: 'process-level chỉ — không inter-process lock' }
  ],
  complexity: { time: 'O(F) write + O(F) load mỗi op', space: 'O(F)', variables: 'F = toàn bộ store', simulation: 'Mô phỏng 2 slot tmp/final trong memory — semantics giữ nguyên.' },
  codeRefs: [
    { path: 'backend/session_manager.py', line: 91, endLine: 112, symbol: 'atomic_write', note: 'tmp→fsync→replace' },
    { path: 'backend/session_manager.py', line: 115, endLine: 123, symbol: 'load_json', note: 'lỗi → {}' },
    { path: 'backend/session_manager.py', line: 156, endLine: 168, symbol: 'load/save_sessions under RLock', note: '' }
  ],
  pseudocode: [
    { id: 'a1', text: 'mkdir parent; tmp NamedTemporaryFile cùng dir, delete=False' },
    { id: 'a2', text: 'json.dump + flush + os.fsync' },
    { id: 'a3', text: 'os.replace(tmp, path) — atomic cùng filesystem' },
    { id: 'a4', text: 'finally: tmp.unlink(missing_ok=True) nếu còn' },
    { id: 'a5', text: 'load_json: !exists / JSONDecodeError / OSError / non-dict → {}' },
    { id: 'a6', text: 'mọi thao tác trong _STORE_LOCK (RLock)' }
  ],
  edgeCases: [
    { title: 'Không inter-process lock', description: 'Hai instance controller cùng file → lost-update (không flock/msvcrt) — giới hạn thiết kế đã ghi nhận.' },
    { title: 'Crash giữa fsync và replace', description: 'File cũ nguyên vẹn + .tmp orphan — tmp ở cùng dir nên replace là atomic.' },
    { title: 'File chứa list/non-dict', description: 'load_json trả {} — "không phải dict = coi như rỗng".' }
  ],
  simplifications: [
    { sourceBehavior: 'tempfile + os.fsync + os.replace thật', demoBehavior: 'Mô phỏng slot tmp/final trong memory', reason: 'Dạy semantics atomic-replace + tolerant-load, không port syscall.' }
  ],
  related: ['revision-optimistic-concurrency', 'live-observation-cache', 'session-state-machine'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Ghi OK → file 2 session', edgeCase: false,
      description: 'write {s-1 PARKED, s-2 WAITING}: tmp→fsync→replace thành công → file sau có cả 2.',
      input: {
        file_before: { 's-1': { state: 'PARKED' } },
        events: [{ op: 'write', data: { 's-1': { state: 'PARKED' }, 's-2': { state: 'WAITING_FOR_SCAN' } } }]
      },
      expected: { file_keys: ['s-1', 's-2'], tmp_orphan: false, load_result: 'ok' }
    },
    {
      id: 'edge', title: 'Crash sau fsync + file corrupt', edgeCase: true,
      description: 'crash trước replace → file vẫn 1 session, .tmp orphan; load "{not json" → {} không exception.',
      input: {
        file_before: { 's-1': { state: 'PARKED' } },
        events: [
          { op: 'write_crash_after_fsync', data: { 's-1': { state: 'PARKED' }, 's-2': { state: 'WAITING_FOR_SCAN' } } },
          { op: 'load_corrupt', content: '{not json' }
        ]
      },
      expected: { file_keys: ['s-1'], tmp_orphan: true, load_result: {} }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var file = dc(inp.file_before);
    var tmp = null, tmpOrphan = false, loadResult = null;
    var F = [];
    F.push(mkFrame('before', ['a1'], 'File trước: ' + JSON.stringify(Object.keys(file)) + ' — sessions.json.',
      { file: dc(file) }, [{ label: 'sessions', value: Object.keys(file).length }],
      { phase: 'file', file: dc(file), tmp: null }));
    inp.events.forEach(function (ev, i) {
      var expl, lines;
      if (ev.op === 'write') {
        tmp = { name: '.sessions.json.tmp', data: dc(ev.data), fsynced: false };
        tmp.fsynced = true;
        file = dc(tmp.data); tmp = null;
        expl = 'tmp.write + flush + fsync → os.replace → file mới ' + JSON.stringify(Object.keys(file)) + ' nguyên tử.';
        lines = ['a1', 'a2', 'a3', 'a4'];
      } else if (ev.op === 'write_crash_after_fsync') {
        tmp = { name: '.sessions.json.tmp', data: dc(ev.data), fsynced: true };
        tmpOrphan = true;
        expl = 'tmp.write + fsync OK rồi CRASH trước os.replace → file cũ nguyên vẹn ' + JSON.stringify(Object.keys(file)) + '; .tmp orphan.';
        lines = ['a1', 'a2'];
      } else if (ev.op === 'load_corrupt') {
        loadResult = {};
        expl = 'load_json("' + ev.content + '") → JSONDecodeError → trả {} — không crash.';
        lines = ['a5'];
      }
      F.push(mkFrame('ev' + (i + 1), lines, expl,
        { file: dc(file), tmp: tmp, tmpOrphan: tmpOrphan, loadResult: loadResult },
        [{ label: 'file', value: Object.keys(file).length + ' sessions' }, { label: 'tmp', value: tmp ? 'orphan' : '—' }],
        { phase: 'file', file: dc(file), tmp: tmp ? dc(tmp) : null, tmpOrphan: tmpOrphan, loadResult: loadResult, hl: ev.op }));
    });
    F.push(mkFrame('done', ['a5', 'a6'], 'Kết: file=' + JSON.stringify(Object.keys(file)) + ', tmp_orphan=' + tmpOrphan + ', load=' + JSON.stringify(loadResult) + '. Mọi op trong _STORE_LOCK — chỉ process-level.',
      {}, [], { phase: 'done', file: file, tmpOrphan: tmpOrphan, loadResult: loadResult }));
    var result = { file_keys: Object.keys(file), tmp_orphan: tmpOrphan, load_result: loadResult === null ? 'ok' : loadResult };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [
      chk('file_keys', result.file_keys, expected.file_keys),
      chk('tmp_orphan', result.tmp_orphan, expected.tmp_orphan),
      chk('load_result', result.load_result, expected.load_result)
    ];
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Pipeline tmp→fsync→replace', 'vùng đỏ = crash trước replace → file gốc nguyên vẹn');
    var stages = ['tmp write', 'fsync', 'os.replace'];
    var sy = 90;
    stages.forEach(function (st, i) {
      var x = 40 + i * 170;
      var active = s.hl === 'write' || s.hl === 'write_crash_after_fsync';
      BX(ctx, x, sy, 150, 50, 'rgba(255,255,255,.04)', active ? p.accent : p.grid, 8);
      T(ctx, (i + 1) + '. ' + st, x + 75, sy + 22, { c: p.text, sz: 11.5, a: 'center', w: '700' });
      T(ctx, i === 0 ? 'cùng dir' : i === 1 ? 'durability' : 'atomic', x + 75, sy + 38, { c: p.muted, sz: 9.5, a: 'center' });
      if (i < 2) AR(ctx, x + 152, sy + 25, x + 168, sy + 25, p.grid, 1.5);
    });
    if (s.hl === 'write_crash_after_fsync') {
      LN(ctx, 40 + 2 * 170 - 8, sy - 10, 40 + 2 * 170 - 8, sy + 60, p.danger, 2, [4, 4]);
      PILL(ctx, 40 + 2 * 170 - 4, sy - 14, '✗ CRASH', p.danger);
    }
    /* file + tmp boxes */
    var fy = sy + 90;
    BX(ctx, 40, fy, 260, 130, 'rgba(255,255,255,.03)', p.grid, 8);
    T(ctx, 'sessions.json (disk)', 54, fy + 18, { c: p.muted, sz: 10.5, w: '700' });
    var fk = s.file ? Object.keys(s.file) : [];
    fk.forEach(function (k, i) {
      var fs2 = s.file[k];
      T(ctx, k + ' → ' + JSON.stringify(fs2), 54, fy + 38 + i * 18, { c: p.text, sz: 10.5, f: 'monospace' });
    });
    if (s.tmpOrphan) {
      BX(ctx, 330, fy, 200, 70, 'rgba(240,169,60,.07)', '#f0a93c', 8);
      T(ctx, '.sessions.json.tmp (orphan)', 344, fy + 20, { c: '#f0a93c', sz: 10.5, w: '700' });
      T(ctx, 'dọn ở lần ghi sau / tay', 344, fy + 40, { c: p.muted, sz: 10 });
    }
    if (s.loadResult !== null && s.loadResult !== undefined) {
      BX(ctx, 330, fy + 80, 200, 44, 'rgba(242,85,90,.08)', p.danger, 8);
      T(ctx, 'load corrupt → {}', 344, fy + 107, { c: p.danger, sz: 11, w: '700' });
    }
    T(ctx, 'RLock chỉ process-level — 2 instance cùng file → lost-update (giới hạn đã ghi)', 40, fy + 150, { c: p.muted, sz: 10.5 });
  }
});

/* =================================================================
 * NHÓM D — Episodes & identity (D1–D4)
 * ================================================================= */

/* ---------- D1 parking-episode-apply ---------- */
LESSONS.push({
  id: 'parking-episode-apply', pack: PACK_ID,
  title: 'Latest-episode/gid + owner-conflict + cursor dedup',
  topic: 'Episodes',
  summary: 'Trong v2, quyết định "xe đã đỗ/rời ô" đến CHỈ từ parking_episodes (binder authoritative) — cursor per-session làm apply idempotent qua repoll.',
  role: 'Lọc episode (0≤evidence≤applied≤frame ∧ ids) → owners/slot_owners → latest theo (applied,ts,rev,state_rank) → conflict guard → cursor dedup → set_parked/apply_departure.',
  inputTypes: [
    { name: 'snapshot.parking_episodes', type: 'array', description: 'episode từ binder' },
    { name: 'frame_index, runtime_id', type: 'scalar', description: 'guard + dedup scope' }
  ],
  outputTypes: [
    { name: 'side-effects', type: 'set_parked | apply_departure | skip', description: '+ episode_diagnostics[gid]' }
  ],
  structures: [
    { name: 'latest', type: 'gid→episode', description: 'tuple (applied,ts,rev,state_rank{parked:1,departing:2,released:3}); pending rank 0' },
    { name: '_episode_cursors', type: 'sessionId→tuple5', description: '(applied,ep_id,state,ts,rev)' },
    { name: 'owners/slot_owners', type: 'set maps', description: 'conflict khi >1' }
  ],
  complexity: { time: 'O(E) lọc+latest + O(G·N) lookup session', space: 'O(E+G)+O(N)', variables: 'E episodes, G gid riêng, N sessions', simulation: 'Giữ nguyên tuple/state_rank/cursor.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 628, endLine: 703, symbol: '_apply_parking_episodes', note: 'gọi trước same-frame return :448-449' }
  ],
  pseudocode: [
    { id: 'p1', text: 'episode: 0 ≤ evidence ≤ applied ≤ frame_index ∧ ids không rỗng → else skip' },
    { id: 'p2', text: 'state==parked → owners[gid]+=slot, slot_owners[slot]+=gid' },
    { id: 'p3', text: 'latest[gid] theo tuple (applied, ts, revision, state_rank)' },
    { id: 'p4', text: 'conflict: |owners[gid]|>1 ∨ |slot_owners[slot]|>1 → diag, không áp (fail-closed)' },
    { id: 'p5', text: 'session = find_by_gid; None → session_not_found' },
    { id: 'p6', text: 'cursor = prev → skip; applied<prev → older; cùng frame ∧ ts≤prev ∧ không revision mới → not_newer' },
    { id: 'p7', text: 'parked ∧ ≠EXIT_NAV → set_parked; departing|released → departure; pending → skip; ghi cursor+diag' }
  ],
  edgeCases: [
    { title: 'Evidence từ tương lai', description: 'evidence>applied hoặc applied>frame_index → episode bị loại ngay.' },
    { title: 'Hai gid cùng ô', description: 'Identity merge lỗi → cả hai diag conflict, không áp — fail-closed.' },
    { title: 'newer_revision cùng frame', description: 'cùng applied_frame_idx + cùng episode_id + revision cao hơn → cho qua — xử lý republish cùng frame.' },
    { title: 'pending che episode cũ', description: 'pending thắng latest-pick khi applied/ts/rev lớn hơn hẳn → "che" parked cũ, không áp gì tới episode mới hơn.' }
  ],
  simplifications: [],
  related: ['frame-cursor-monotonic-poll', 'session-state-machine', 'parked-evidence-dwell-legacy', 'identity-alias-remap-backend'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'ep apply + bad-skip + released departure', edgeCase: false,
      description: 'ep-bad (applied 55>50) loại; ep-a gid5 → set_parked; ep-old released gid8 → departure (parkingEpisodeId khớp → PARKED→SELECTING).',
      input: {
        snapshot_frame_index: 50,
        sessions: [
          { sessionId: 's-5', globalVehicleId: 5, state: 'NAVIGATING_TO_SPOT', runtimeId: 'rt-1', revision: 3 },
          { sessionId: 's-8', globalVehicleId: 8, state: 'PARKED', parkedSpotId: 'A01', actualParkedSpotId: 'A01', parkingEpisodeId: 'ep-old', runtimeId: 'rt-1', revision: 4 }
        ],
        parking_episodes: [
          { parking_episode_id: 'ep-a', global_id: 5, slot_id: 'D01', state: 'parked', applied_frame_idx: 48, evidence_frame_idx: 47, applied_timestamp_s: 20.0, revision: 2 },
          { parking_episode_id: 'ep-bad', global_id: 6, slot_id: 'D02', state: 'parked', applied_frame_idx: 55, evidence_frame_idx: 54, applied_timestamp_s: 21.0, revision: 1 },
          { parking_episode_id: 'ep-old', global_id: 8, slot_id: 'A01', state: 'released', applied_frame_idx: 49, evidence_frame_idx: 49, applied_timestamp_s: 21.5, revision: 4 }
        ]
      },
      expected: {
        diag: { '5': 'applied', '8': 'applied' },
        s5_state: 'PARKED', s8_state: 'SELECTING_SPOT',
        skipped: { 'ep-bad': 'future_frame' }
      }
    },
    {
      id: 'edge', title: 'Cursor dedup repoll + newer_revision + conflict', edgeCase: true,
      description: 'repoll cùng snapshot → cursor bằng → skip; ep-a republish rev=3 → newer_revision → áp lại idempotent; 2 gid cùng ô → conflict.',
      input: {
        snapshot_frame_index: 50,
        sessions: [
          { sessionId: 's-5', globalVehicleId: 5, state: 'NAVIGATING_TO_SPOT', runtimeId: 'rt-1', revision: 3 },
          { sessionId: 's-7', globalVehicleId: 7, state: 'SELECTING_SPOT', runtimeId: 'rt-1', revision: 1 },
          { sessionId: 's-9', globalVehicleId: 9, state: 'SELECTING_SPOT', runtimeId: 'rt-1', revision: 1 }
        ],
        polls: [
          { name: 'poll1', episodes: [
            { parking_episode_id: 'ep-a', global_id: 5, slot_id: 'D01', state: 'parked', applied_frame_idx: 48, evidence_frame_idx: 47, applied_timestamp_s: 20.0, revision: 2 },
            { parking_episode_id: 'ep-c1', global_id: 7, slot_id: 'D09', state: 'parked', applied_frame_idx: 48, evidence_frame_idx: 48, applied_timestamp_s: 20.1, revision: 1 },
            { parking_episode_id: 'ep-c2', global_id: 9, slot_id: 'D09', state: 'parked', applied_frame_idx: 48, evidence_frame_idx: 48, applied_timestamp_s: 20.2, revision: 1 }
          ] },
          { name: 'poll2-repoll', episodes: [
            { parking_episode_id: 'ep-a', global_id: 5, slot_id: 'D01', state: 'parked', applied_frame_idx: 48, evidence_frame_idx: 47, applied_timestamp_s: 20.0, revision: 2 }
          ] },
          { name: 'poll3-newer-rev', episodes: [
            { parking_episode_id: 'ep-a', global_id: 5, slot_id: 'D01', state: 'parked', applied_frame_idx: 48, evidence_frame_idx: 47, applied_timestamp_s: 20.0, revision: 3 }
          ] }
        ]
      },
      expected: {
        poll1_diag: { '5': 'applied', '7': 'conflict', '9': 'conflict' },
        poll2_diag: { '5': 'skip_same_cursor' },
        poll3_diag: { '5': 'applied(newer_revision)' },
        s5_rev: 4
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var sessions = {};
    inp.sessions.forEach(function (s2) { sessions[s2.sessionId] = dc(s2); });
    var cursors = {}; /* sessionId → tuple */
    var identityConflicts = [];
    var F = [];
    var RANK = { pending: 0, parked: 1, departing: 2, released: 3 };
    var polls = inp.polls || [{ name: 'poll1', episodes: inp.parking_episodes }];
    var allDiag = {};
    polls.forEach(function (poll, pi) {
      var frame = inp.snapshot_frame_index;
      var valid = [], skipped = {}, owners = {}, slotOwners = {}, latest = {};
      poll.episodes.forEach(function (ep) {
        var ok = typeof ep.applied_frame_idx === 'number' && typeof ep.evidence_frame_idx === 'number' &&
          ep.evidence_frame_idx >= 0 && ep.evidence_frame_idx <= ep.applied_frame_idx && ep.applied_frame_idx <= frame &&
          ep.parking_episode_id && ep.slot_id && typeof ep.global_id === 'number';
        if (!ok) { skipped[ep.parking_episode_id] = ep.applied_frame_idx > frame ? 'future_frame' : 'malformed'; return; }
        valid.push(ep);
        if (ep.state === 'parked') {
          (owners[ep.global_id] = owners[ep.global_id] || []).push(ep.slot_id);
          (slotOwners[ep.slot_id] = slotOwners[ep.slot_id] || []).push(ep.global_id);
        }
        var key = [ep.applied_frame_idx, ep.applied_timestamp_s || 0, ep.revision || 0, RANK[ep.state] || 0].join(',');
        var cur = latest[ep.global_id];
        if (!cur || key > cur._key) { ep._key = key; latest[ep.global_id] = ep; }
      });
      var diag = {};
      Object.keys(latest).forEach(function (g) {
        var ep = latest[g];
        var gid = ep.global_id;
        var conflict = identityConflicts.indexOf(gid) >= 0 ||
          (owners[gid] && owners[gid].length > 1) ||
          (slotOwners[ep.slot_id] && slotOwners[ep.slot_id].length > 1);
        var sess = null;
        Object.keys(sessions).forEach(function (k) { if (sessions[k].globalVehicleId === gid) sess = sessions[k]; });
        var d;
        if (conflict) d = 'conflict';
        else if (!sess) d = 'session_not_found';
        else {
          var cur = cursors[sess.sessionId];
          var sameCursor = cur && cur.applied === ep.applied_frame_idx && cur.id === ep.parking_episode_id && cur.state === ep.state && cur.ts === ep.applied_timestamp_s && cur.rev === ep.revision;
          if (sameCursor) d = 'skip_same_cursor';
          else if (cur && ep.applied_frame_idx < cur.applied) d = 'episode_older';
          else if (cur && ep.applied_frame_idx === cur.applied && (ep.applied_timestamp_s || 0) <= cur.ts && !(ep.revision > cur.rev && cur.id === ep.parking_episode_id)) d = 'not_newer';
          else {
            var newerRev = cur && ep.applied_frame_idx === cur.applied && ep.revision > cur.rev && cur.id === ep.parking_episode_id;
            if (ep.state === 'parked' && sess.state !== 'EXIT_NAVIGATION') {
              var rr = fsmApply(sess, { op: 'set_parked', spot: ep.slot_id, episodeId: ep.parking_episode_id });
              if (!rr.error) { for (var kk in rr.session) sess[kk] = rr.session[kk]; }
              d = 'applied' + (newerRev ? '(newer_revision)' : '');
            } else if (ep.state === 'departing' || ep.state === 'released') {
              var rd = fsmApply(sess, { op: 'departure_episode', episodeId: ep.parking_episode_id });
              if (!rd.error) { for (var kd in rd.session) sess[kd] = rd.session[kd]; }
              d = 'applied' + (newerRev ? '(newer_revision)' : '');
            } else d = 'skip(pending)';
            cursors[sess.sessionId] = { applied: ep.applied_frame_idx, id: ep.parking_episode_id, state: ep.state, ts: ep.applied_timestamp_s || 0, rev: ep.revision || 0 };
          }
        }
        diag[gid] = d;
      });
      allDiag[poll.name] = diag;
      /* frame validate: filter p1 trước — đếm hợp lệ vs loại */
      F.push(mkFrame(poll.name + '-validate', ['p1', 'p2'],
        poll.name + ': ' + poll.episodes.length + ' episode vào → ' + valid.length + ' qua filter (0≤evidence≤applied≤frame=' + frame + ')' +
        (Object.keys(skipped).length ? '; loại ' + JSON.stringify(skipped) : '') + '.',
        { skipped: dc(skipped) },
        [{ label: 'valid', value: valid.length }, { label: 'skipped', value: Object.keys(skipped).length }],
        { phase: 'validate', poll: poll.name, episodes: poll.episodes, skipped: dc(skipped), owners: dc(owners), slotOwners: dc(slotOwners), sessions: dc(sessions) }));
      /* frame per latest-gid: verdict chi tiết */
      Object.keys(latest).forEach(function (g, gi) {
        var ep2 = latest[g], d2 = diag[g];
        var lns = d2 === 'conflict' ? ['p3', 'p4'] : d2 === 'session_not_found' ? ['p3', 'p5'] : d2.indexOf('applied') === 0 ? ['p3', 'p6', 'p7'] : ['p3', 'p6'];
        F.push(mkFrame(poll.name + '-gid' + g, lns,
          'latest[gid' + g + '] = ' + ep2.parking_episode_id + ' (' + ep2.state + ', a' + ep2.applied_frame_idx + ', r' + (ep2.revision || 0) + ') → verdict ' + d2 + '.',
          { diag: dc(diag), sessions: dc(sessions), cursors: dc(cursors) },
          [{ label: 'gid', value: g }, { label: 'verdict', value: d2 }],
          { phase: 'decide', poll: poll.name, episodes: poll.episodes, latest: dc(latest), owners: dc(owners), slotOwners: dc(slotOwners), diag: dc(diag), skipped: dc(skipped), sessions: dc(sessions), cursors: dc(cursors), focusGid: g }));
      });
      F.push(mkFrame(poll.name + '-summary', ['p6', 'p7'],
        poll.name + ' chốt: diag=' + JSON.stringify(diag) + '; cursors=' + JSON.stringify(cursors) + '.',
        { diag: dc(diag), sessions: dc(sessions), cursors: dc(cursors) },
        [{ label: 'diag', value: JSON.stringify(diag) }],
        { phase: 'summary', poll: poll.name, episodes: poll.episodes, latest: dc(latest), owners: dc(owners), slotOwners: dc(slotOwners), diag: dc(diag), skipped: dc(skipped), sessions: dc(sessions), cursors: dc(cursors) }));
    });
    F.push(mkFrame('done', ['p7'], 'Sau tất cả poll: ' + Object.keys(allDiag).map(function (k) { return k + '=' + JSON.stringify(allDiag[k]); }).join(' · '),
      { allDiag: dc(allDiag), sessions: dc(sessions) }, [],
      { phase: 'done', episodes: [], diag: {}, skipped: {}, sessions: dc(sessions), cursors: dc(cursors) }));
    var result = {
      diag: allDiag.poll1 || allDiag['poll1'],
      s5_state: sessions['s-5'] ? sessions['s-5'].state : null,
      s8_state: sessions['s-8'] ? sessions['s-8'].state : null,
      s5_rev: sessions['s-5'] ? sessions['s-5'].revision : null,
      poll1_diag: allDiag['poll1'], poll2_diag: allDiag['poll2-repoll'], poll3_diag: allDiag['poll3-newer-rev'],
      skipped: dc(Object.keys(allDiag).length ? {} : {})
    };
    /* rebuild skipped for single-poll scenario */
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [];
    if (expected.diag) checks.push(chk('diag', result.poll1_diag || result.diag, expected.diag));
    if (expected.poll1_diag) checks.push(chk('poll1_diag', result.poll1_diag, expected.poll1_diag));
    if (expected.poll2_diag) checks.push(chk('poll2_diag', result.poll2_diag, expected.poll2_diag));
    if (expected.poll3_diag) checks.push(chk('poll3_diag', result.poll3_diag, expected.poll3_diag));
    if (expected.s5_state !== undefined) checks.push(chk('s5_state', result.s5_state, expected.s5_state));
    if (expected.s8_state !== undefined) checks.push(chk('s8_state', result.s8_state, expected.s8_state));
    if (expected.s5_rev !== undefined) checks.push(chk('s5_rev (chỉ bump 1 lần)', result.s5_rev, expected.s5_rev));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Episode cards → latest-picker → diag', 'card cao nhất mỗi gid thắng · conflict đỏ chớp');
    var eps = s.episodes || [];
    /* episode cards */
    eps.forEach(function (ep, i) {
      var x = 24 + i * 150, y = 70;
      var st = ep.state || '?';
      var c = st === 'parked' ? p.success : st === 'pending' ? p.muted : p.warning;
      BX(ctx, x, y, 140, 84, 'rgba(255,255,255,.03)', c, 8);
      T(ctx, ep.parking_episode_id, x + 8, y + 16, { c: p.text, sz: 11, w: '700' });
      T(ctx, 'gid' + ep.global_id + ' → ' + ep.slot_id, x + 8, y + 32, { c: p.muted, sz: 10 });
      T(ctx, st + ' · r' + ep.revision, x + 8, y + 48, { c: c, sz: 10.5, w: '600' });
      T(ctx, 'a' + ep.applied_frame_idx + '/e' + ep.evidence_frame_idx + ' @' + ep.applied_timestamp_s + 's', x + 8, y + 64, { c: '#8a93a8', sz: 9 });
    });
    /* diag panel */
    var dy = 190;
    T(ctx, 'DIAG per gid', 24, dy - 10, { c: p.muted, sz: 11, w: '700' });
    var diag = s.diag || {};
    Object.keys(diag).forEach(function (g, i) {
      var d = diag[g];
      var c = d.indexOf('applied') === 0 ? p.success : d.indexOf('conflict') === 0 ? p.danger : d.indexOf('skip') === 0 ? p.warning : p.muted;
      var focus = String(s.focusGid) === String(g);
      BX(ctx, 24 + i * 190, dy, 180, 40, focus ? 'rgba(79,156,247,.14)' : 'rgba(255,255,255,.03)', focus ? p.accent : c, 7);
      T(ctx, 'gid' + g, 34, dy + 17, { c: p.text, sz: 11, w: '700' });
      T(ctx, d, 34, dy + 32, { c: c, sz: 10 });
    });
    /* skipped */
    var sk = s.skipped || {};
    Object.keys(sk).forEach(function (k, i) {
      PILL(ctx, 24 + i * 130, dy + 62, k + ': ' + sk[k], p.danger);
    });
    /* sessions state */
    var sess = s.sessions || {};
    var sy = dy + 90;
    Object.keys(sess).forEach(function (k, i) {
      var se = sess[k];
      BX(ctx, 24 + i * 190, sy, 180, 52, 'rgba(63,206,124,.06)', p.success, 7);
      T(ctx, k + ' · gid' + se.globalVehicleId, 34, sy + 18, { c: p.text, sz: 10.5, w: '700' });
      T(ctx, se.state + ' · rev' + se.revision + (se.actualParkedSpotId ? ' · @' + se.actualParkedSpotId : ''), 34, sy + 36, { c: p.muted, sz: 10 });
    });
  }
});

/* ---------- D2 parked-evidence-dwell-legacy ---------- */
LESSONS.push({
  id: 'parked-evidence-dwell-legacy', pack: PACK_ID,
  title: '[LEGACY v1] Dwell stopped_for_ms + departure 2 frame',
  topic: 'Episodes',
  summary: 'Đường xác nhận đỗ chỉ chạy khi snapshot KHÔNG phải v2 (file-mode/legacy): ô đỗ + stopped_for_ms dwell 2s → set_parked; rời ô = 2 frame liên tục active + dịch ≥0.25 → exit.',
  role: 'v2 → skip toàn khối. parked_slot_id truthy: evidence=min(confirm_s, stopped/1000) từ slot cùng gid+tracking_state==parked → candidate backdate; đủ 2s → set_parked. Falsy + PARKED + move≥0.25 + active → count++ (continuous) → ≥2 → set_exit.',
  inputTypes: [
    { name: 'vehicle{parked_slot_id,state,observed}', type: 'object', description: 'v1 snapshot' },
    { name: 'parking_slots', type: 'array', description: '{vehicle_id, tracking_state, stopped_for_ms}' }
  ],
  outputTypes: [{ name: 'set_parked | set_exit_navigation | wait', type: 'side-effect', description: '' }],
  structures: [
    { name: '_parked_candidates', type: 'gid→(slot,start)', description: 'backdated start' },
    { name: '_departure_candidates', type: 'gid→(count,last_frame)', description: '2 frame liên tục' }
  ],
  complexity: { time: 'O(V+S)/snapshot', space: 'O(V)', variables: 'V vehicles, S slot', simulation: 'Giữ nguyên dwell/count; nhấn mạnh đây là đường v1 dead-path trong v2.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 128, endLine: 144, symbol: '_parked_evidence_seconds', note: '' },
    { path: 'backend/gate_session_controller.py', line: 556, endLine: 626, symbol: 'legacy parked/departure (bị bypass khi v2 :556-557)', note: '' },
    { path: 'backend/gate_session_controller.py', line: 866, symbol: '--parked-confirm-seconds default 2.0', note: '' }
  ],
  pseudocode: [
    { id: 'l1', text: 'snapshot v2 → skip toàn khối (dead path)' },
    { id: 'l2', text: 'parked_slot truthy: evidence=min(confirm, stopped_ms/1000) slot cùng gid+tracking==parked; candidate=(slot, now−evidence) backdate' },
    { id: 'l3', text: 'now−start < 2s → chờ; đủ → set_parked' },
    { id: 'l4', text: 'parked_slot falsy + session PARKED + observed: move≥0.25 ∧ state==active → count++ nếu continuous else reset 1; ≥2 → set_exit' },
    { id: 'l5', text: 'prune candidates gid không còn trong snapshot' }
  ],
  edgeCases: [
    { title: 'Slot vehicle_id khác gid', description: 'hoặc tracking_state≠parked → evidence=0 → dwell reset — chống nhầm xe đứng cạnh.' },
    { title: 'stopped_for_ms backdate', description: 'xe đỗ lâu confirm ngay frame đầu (min() cap 2s) — không cần chờ.' },
    { title: 'Dead path trong v2', description: 'snapshot v2 → nhánh bị bypass hoàn toàn — v2 episodes authoritative.' }
  ],
  simplifications: [],
  related: ['parking-episode-apply', 'session-state-machine', 'observation-continuity-window'],
  aliases: [],
  parameters: [
    { key: 'confirm_s', label: 'Dwell xác nhận (s)', type: 'number', min: 0.5, max: 10, step: 0.5, default: 2 },
    { key: 'v2_mode', label: 'Snapshot là v2 (dead-path demo)', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'normal', title: 'Backdate confirm ngay + departure 2 frame', edgeCase: false,
      description: 'stopped 3000ms → evidence=min(2,3)=2 → confirm ngay; rời ô 2 frame move≥0.25 → exit.',
      input: {
        polls: [
          { vehicle: { global_id: 5, observed: true, parked_slot_id: 'A01', position: { x: 300, y: 200 }, state: 'active' }, slot: { slot_id: 'A01', vehicle_id: 5, tracking_state: 'parked', stopped_for_ms: 3000 } },
          { vehicle: { global_id: 5, observed: true, parked_slot_id: 'A01', position: { x: 300, y: 200 }, state: 'parked' }, slot: { slot_id: 'A01', vehicle_id: 5, tracking_state: 'parked', stopped_for_ms: 3200 } },
          { vehicle: { global_id: 5, observed: true, parked_slot_id: null, position: { x: 305, y: 200 }, state: 'active' }, slot: null },
          { vehicle: { global_id: 5, observed: true, parked_slot_id: null, position: { x: 310, y: 200 }, state: 'active' }, slot: null }
        ],
        session: { sessionId: 's-5', globalVehicleId: 5, state: 'NAVIGATING_TO_SPOT', revision: 3 }
      },
      expected: { events: ['set_parked(A01)', 'skip(parked-đúng-ô)', 'dep-count=1', 'dep-count=2→set_exit'], final_state: 'EXIT_NAVIGATION' }
    },
    {
      id: 'edge', title: 'Gap >1s reset departure count', edgeCase: true,
      description: 'Frame rời ô có gap local >1s → count reset 1; phải 2 frame liên tục mới exit.',
      input: {
        polls: [
          { vehicle: { global_id: 5, observed: true, parked_slot_id: 'A01', position: { x: 300, y: 200 }, state: 'active' }, slot: { slot_id: 'A01', vehicle_id: 5, tracking_state: 'parked', stopped_for_ms: 3000 } },
          { vehicle: { global_id: 5, observed: true, parked_slot_id: null, position: { x: 305, y: 200 }, state: 'active' }, slot: null },
          { vehicle: { global_id: 5, observed: true, parked_slot_id: null, position: { x: 310, y: 200 }, state: 'active' }, slot: null, gap_s: 2.0 },
          { vehicle: { global_id: 5, observed: true, parked_slot_id: null, position: { x: 315, y: 200 }, state: 'active' }, slot: null }
        ],
        session: { sessionId: 's-5', globalVehicleId: 5, state: 'NAVIGATING_TO_SPOT', revision: 3 }
      },
      expected: { events: ['set_parked(A01)', 'dep-count=1', 'gap→reset=1', 'dep-count=2→set_exit'], final_state: 'EXIT_NAVIGATION' }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var confirmS = params.confirm_s != null ? params.confirm_s : 2;
    var sess = dc(inp.session);
    var F = [], events = [];
    var cand = null, depCount = 0, prevPos = null, prevT = 0, now = 0;
    if (params.v2_mode) {
      /* v2 dead-path vẫn cần ≥3 stage có nghĩa: input → gate bypass → kết quả */
      F.push(mkFrame('v2-input', ['l1'],
        'Snapshot v2 đến với ' + inp.polls.length + ' poll + session ' + sess.sessionId + ' (' + sess.state + '). Payload có đầy đủ dữ liệu legacy cần — parked_slot_id, stopped_for_ms — nhưng marker v2 quyết định nhánh nào chạy.',
        { polls: inp.polls.length, session: dc(sess), v2: true },
        [{ label: 'snapshot', value: 'v2' }, { label: 'polls', value: inp.polls.length }],
        { phase: 'dead', v2: true, polls: inp.polls, session: dc(sess), events: [], confirmS: confirmS }));
      F.push(mkFrame('v2-gate', ['l1'],
        'Guard đầu khối (:556-557): snapshot là v2 → bypass TOÀN BỘ nhánh legacy — không đọc parked_slot_id, không dwell, không departure count. Đây là DEAD PATH trong live v2.',
        { gate: 'bypass', reason: 'snapshot v2 → skip khối :556-626' },
        [{ label: 'gate', value: 'BYPASS — dead path' }],
        { phase: 'dead', v2: true, polls: inp.polls, session: dc(sess), events: [], confirmS: confirmS }));
      F.push(mkFrame('v2-result', ['l1'],
        'Kết: legacy phát 0 event — session ' + sess.sessionId + ' giữ ' + sess.state + '. Dwell/departure trong v2 do episodes của parking-episode-apply (D1) đảm nhận ở nhánh riêng, authoritative.',
        { events: [], final_state: sess.state },
        [{ label: 'events', value: '0 — nhường D1 episodes' }, { label: 'state', value: sess.state }],
        { phase: 'dead', v2: true, polls: inp.polls, session: dc(sess), events: ['v2-skip'], confirmS: confirmS }));
      var resultV2 = { events: ['v2-skip'], final_state: sess.state };
      var expectedV2 = { events: ['v2-skip'], final_state: sess.state };
      return { frames: F, result: resultV2, expected: expectedV2, checks: [chk('events', resultV2.events, expectedV2.events), chk('final_state', resultV2.final_state, expectedV2.final_state)] };
    }
    inp.polls.forEach(function (pv, i) {
      var v = pv.vehicle, ev, expl, lines;
      var gap = pv.gap_s || 0.25;
      var continuous = gap <= 1.0 && prevPos !== null;
      now += gap;
      if (v.parked_slot_id) {
        depCount = 0;
        if (sess.state === 'PARKED' && sess.parkedSpotId === v.parked_slot_id) {
          ev = 'skip(parked-đúng-ô)'; expl = 'đã PARKED đúng ô → skip.';
          lines = ['l2'];
        } else {
          var sl = pv.slot;
          var evidence = (sl && sl.vehicle_id === v.global_id && sl.tracking_state === 'parked')
            ? Math.min(confirmS, (sl.stopped_for_ms || 0) / 1000) : 0;
          cand = { slot: v.parked_slot_id, start: now - evidence };
          var left = confirmS - (now - cand.start);
          if (left <= 0) {
            sess.state = 'PARKED'; sess.parkedSpotId = v.parked_slot_id; sess.actualParkedSpotId = v.parked_slot_id;
            ev = 'set_parked(' + v.parked_slot_id + ')';
            expl = 'evidence=' + r2(evidence) + 's (min(' + confirmS + ', ' + (sl.stopped_for_ms / 1000) + ')) → backdate start=' + r2(cand.start) + ' → đủ dwell → set_parked ngay.';
            lines = ['l2', 'l3'];
          } else {
            ev = 'dwell-wait ' + r2(left) + 's';
            expl = 'evidence=' + r2(evidence) + 's → còn chờ ' + r2(left) + 's.';
            lines = ['l2', 'l3'];
          }
        }
      } else if (sess.state === 'PARKED' && v.observed) {
        var moved = prevPos ? Math.hypot(v.position.x - prevPos.x, v.position.y - prevPos.y) : 0;
        if (moved >= 0.25 && v.state === 'active') {
          depCount = continuous ? depCount + 1 : 1;
          if (!continuous && depCount === 1) ev = 'gap→reset=1';
          else ev = 'dep-count=' + depCount;
          expl = 'move=' + r2(moved) + ' ≥0.25 ∧ active → count=' + depCount + (continuous ? '' : ' (gap>1s → reset 1)');
          if (depCount >= 2) {
            sess.state = 'EXIT_NAVIGATION';
            ev += '→set_exit';
            expl += ' → ≥2 frame liên tục → set_exit_navigation.';
          }
          lines = ['l4'];
        } else {
          depCount = 0;
          ev = 'clear-dep';
          expl = 'move ' + r2(moved) + ' <0.25 hoặc không active → clear departure candidate.';
          lines = ['l4', 'l5'];
        }
      } else {
        ev = 'none';
        expl = 'không parked_slot & session không PARKED (hoặc !observed) → skip.';
        lines = ['l4'];
      }
      events.push(ev);
      prevPos = dc(v.position); prevT = now;
      F.push(mkFrame('poll' + (i + 1), lines, 'poll' + (i + 1) + ': ' + ev + ' — ' + expl,
        { event: ev, session: dc(sess), cand: dc(cand), depCount: depCount, events: dc(events) },
        [{ label: 'event', value: ev }, { label: 'depCount', value: depCount }, { label: 'state', value: sess.state }],
        { phase: 'poll', idx: i, polls: inp.polls, session: dc(sess), events: dc(events), depCount: depCount, cand: dc(cand), confirmS: confirmS, hl: i, now: now }));
    });
    F.push(mkFrame('done', ['l4'], 'Kết: ' + sess.state + ' — legacy v1 chỉ chạy khi snapshot không phải v2.',
      { session: sess, events: events }, [], { phase: 'done', events: events, session: sess }));
    var result = { events: events, final_state: sess.state };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [chk('events', result.events, expected.events), chk('final_state', result.final_state, expected.final_state)];
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Hai thanh tiến trình legacy v1', 'dwell 2s (xanh) · departure ×2 frame (cam)');
    /* V2 badge cố định */
    PILL(ctx, env.width - 240, 26, 'V2 PATH — LEGACY ONLY', p.danger);
    var polls = s.polls || [], evs = s.events || [];
    var cw = Math.min(150, (env.width - 60) / Math.max(1, polls.length) - 8);
    var y = 80;
    polls.forEach(function (pv, i) {
      var x = 24 + i * (cw + 8);
      var v = pv.vehicle;
      var hl = s.hl === i;
      BX(ctx, x, y, cw, 76, hl ? 'rgba(79,156,247,.12)' : 'rgba(255,255,255,.03)', hl ? p.accent : p.grid, 8);
      T(ctx, 'poll ' + (i + 1), x + 8, y + 15, { c: p.muted, sz: 10 });
      T(ctx, 'slot=' + (v.parked_slot_id || '—'), x + 8, y + 32, { c: p.text, sz: 11, w: '600' });
      T(ctx, 'pos=(' + v.position.x + ',' + v.position.y + ')', x + 8, y + 47, { c: p.muted, sz: 10 });
      if (pv.gap_s) T(ctx, 'gap ' + pv.gap_s + 's', x + 8, y + 62, { c: p.danger, sz: 9.5 });
      if (evs[i]) PILL(ctx, x + 4, y + 92, evs[i], evs[i].indexOf('set_') === 0 ? p.success : p.warning);
    });
    /* progress bars */
    var sess = s.session || {};
    var by = y + 130;
    /* dwell bar */
    var evid = sess.state === 'PARKED' ? (s.confirmS || 2) : (s.cand ? Math.min(s.confirmS || 2, (s.now || 0) - s.cand.start) : 0);
    T(ctx, 'dwell evidence ' + r2(evid) + '/' + (s.confirmS || 2) + 's', 24, by, { c: p.muted, sz: 10.5 });
    BX(ctx, 24, by + 6, 300, 14, 'rgba(255,255,255,.04)', p.grid, 7);
    BX(ctx, 24, by + 6, 300 * Math.min(1, evid / (s.confirmS || 2)), 14, 'rgba(63,206,124,.5)', null, 7);
    /* departure bar */
    T(ctx, 'departure count ' + (s.depCount || 0) + '/2', 24, by + 46, { c: p.muted, sz: 10.5 });
    BX(ctx, 24, by + 52, 300, 14, 'rgba(255,255,255,.04)', p.grid, 7);
    BX(ctx, 24, by + 52, 300 * Math.min(1, (s.depCount || 0) / 2), 14, 'rgba(240,169,60,.5)', null, 7);
    PILL(ctx, 340, by + 30, 'state: ' + (sess.state || '—'), p.accent);
  }
});

/* ---------- D3 identity-alias-remap-backend ---------- */
LESSONS.push({
  id: 'identity-alias-remap-backend', pack: PACK_ID,
  title: 'Remap GID qua retired_global_ids + merge events',
  topic: 'Identity',
  summary: 'Producer đổi GID của xe (merge) — session phải đi theo ID mới không mất state; hai kênh báo: retired_global_ids (durable) và recent_events (transient), durable thắng khi event lỡ.',
  role: 'Với mỗi alias/event old→new: session(old) None→skip; session(new) đã có → SessionError → conflicts {old,new} fail-closed; else remap gid + rev+1 + migrate cache/cursors.',
  inputTypes: [
    { name: 'retired_global_ids', type: 'map str→int', description: 'durable alias' },
    { name: 'recent_events.global_id_merged', type: 'array', description: 'transient (≤100 cuối)' },
    { name: 'sessions', type: 'dict', description: 'store' }
  ],
  outputTypes: [
    { name: 'remapped session | identity_conflicts', type: 'dict|set', description: 'conflict → skip gid trong main loop' }
  ],
  structures: [
    { name: 'identity_conflicts', type: 'set gid', description: 'cả old+new bị đóng băng' },
    { name: 'cursor migration', type: 'dicts', description: 'previous_positions, _last_observed, _parked_candidates từ old→new' }
  ],
  complexity: { time: 'O(A·N + Ev·N)', space: 'O(A+N)', variables: 'A alias, Ev merge events, N sessions', simulation: 'Giữ nguyên thứ tự alias + conflict.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 343, endLine: 399, symbol: '_apply_alias_table + _apply_merge_events', note: '' },
    { path: 'backend/gate_session_controller.py', line: 463, endLine: 465, symbol: 'skip identity_conflicts trong main loop', note: '' },
    { path: 'backend/session_manager.py', line: 516, endLine: 571, symbol: 'remap_global_vehicle_id', note: 'rev+1 riêng, không qua _mutate_session' }
  ],
  pseudocode: [
    { id: 'i1', text: 'mỗi (old,new): skip non-int / old==new; session(old) None → skip' },
    { id: 'i2', text: 'session(new) khác đã giữ → SessionError duplicate → conflicts ∪ {old,new}' },
    { id: 'i3', text: 'else remap: gid=new, revision+1, migrate lastKnownPosition + cursors (prev_pos, _last_observed, _parked_candidates)' },
    { id: 'i4', text: 'gid ∈ conflicts → skip trong main loop — không crossing/parked nào áp' }
  ],
  edgeCases: [
    { title: 'Event lỡ vẫn cứu', description: 'recent_events chỉ giữ ≤100 cuối — retired_global_ids durable là kênh cứu hộ khi event trôi.' },
    { title: 'Conflict đóng băng cả hai', description: '2 session tranh 1 gid mới → cả old+new skip trong loop — fail-closed, phải can thiệp tay.' },
    { title: 'Chain a→b→c', description: 'alias table duyệt từng cặp theo thứ tự dict — session a→b rồi vòng sau (hoặc snapshot sau) b→c.' }
  ],
  simplifications: [],
  related: ['canonical-runtime-id-consumer', 'live-observation-cache', 'parking-episode-apply', 'session-state-machine'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: 'Duplicate → conflict đóng băng cả hai gid', edgeCase: false,
      description: 'alias 5→9: s-5 tồn tại nhưng s-9 đã giữ gid9 → SessionError → conflicts {5,9}; 3→4 không session → skip; vehicle gid9 bị skip.',
      input: {
        sessions: [
          { sessionId: 's-5', globalVehicleId: 5, state: 'NAVIGATING_TO_SPOT', runtimeId: 'rt-1', revision: 4 },
          { sessionId: 's-9', globalVehicleId: 9, state: 'WAITING_FOR_SCAN', runtimeId: 'rt-1', revision: 1 }
        ],
        retired_global_ids: { '5': 9, '3': 4 },
        recent_events: [
          { type: 'global_id_merged', superseded_global_id: 3, global_id: 4 },
          { type: 'other' }
        ],
        vehicles: [{ global_id: 9, position: { x: 300, y: 200 }, observed: true }]
      },
      expected: { conflicts: [5, 9], s5_gid: 5, s9_gid: 9, skipped_vehicles: [9], remapped: [] }
    },
    {
      id: 'edge', title: 'Happy path — remap + migrate cursors', edgeCase: true,
      description: 'Không s-9 → s-5.globalVehicleId=9, revision+1, cursors migrate; gid9 vẫn được xử lý bình thường.',
      input: {
        sessions: [
          { sessionId: 's-5', globalVehicleId: 5, state: 'NAVIGATING_TO_SPOT', runtimeId: 'rt-1', revision: 4 }
        ],
        retired_global_ids: { '5': 9, '3': 4 },
        recent_events: [{ type: 'global_id_merged', superseded_global_id: 3, global_id: 4 }],
        vehicles: [{ global_id: 9, position: { x: 300, y: 200 }, observed: true }]
      },
      expected: { conflicts: [], s5_gid: 9, s5_rev: 5, skipped_vehicles: [], remapped: ['5→9'] }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var sessions = {};
    inp.sessions.forEach(function (s2) { sessions[s2.sessionId] = dc(s2); });
    var conflicts = [], remapped = [], F = [];
    var cursors = {}; /* gid → cursor maps */
    Object.keys(inp.sessions).forEach(function (i) { cursors[inp.sessions[i].globalVehicleId] = { prev_pos: true, last_obs: true }; });
    /* tập alias + events (durable trước) */
    var pairs = [];
    Object.keys(inp.retired_global_ids || {}).forEach(function (k) { pairs.push({ old: parseInt(k, 10), nw: inp.retired_global_ids[k], via: 'retired' }); });
    (inp.recent_events || []).forEach(function (e) {
      if (e.type === 'global_id_merged') pairs.push({ old: e.superseded_global_id, nw: e.global_id, via: 'event' });
    });
    pairs.forEach(function (pr, pi) {
      var expl, lines = ['i1'];
      if (!Number.isInteger(pr.old) || !Number.isInteger(pr.nw) || pr.old === pr.nw) {
        expl = pr.old + '→' + pr.nw + ': non-int/self → skip.';
      } else {
        var sOld = null, sNew = null;
        Object.keys(sessions).forEach(function (k) {
          if (sessions[k].globalVehicleId === pr.old) sOld = sessions[k];
          if (sessions[k].globalVehicleId === pr.nw) sNew = sessions[k];
        });
        if (!sOld) {
          expl = pr.old + '→' + pr.nw + ' (' + pr.via + '): không session gid ' + pr.old + ' → skip.';
          lines = ['i1'];
        } else if (sNew && sNew.sessionId !== sOld.sessionId) {
          if (conflicts.indexOf(pr.old) < 0) conflicts.push(pr.old);
          if (conflicts.indexOf(pr.nw) < 0) conflicts.push(pr.nw);
          expl = pr.old + '→' + pr.nw + ': ' + sNew.sessionId + ' đã giữ gid ' + pr.nw + ' → SessionError duplicate → conflicts {' + pr.old + ',' + pr.nw + '} — đóng băng cả hai.';
          lines = ['i2'];
        } else {
          sOld.globalVehicleId = pr.nw;
          sOld.revision = (sOld.revision || 1) + 1;
          cursors[pr.nw] = cursors[pr.old] || {};
          delete cursors[pr.old];
          remapped.push(pr.old + '→' + pr.nw);
          expl = pr.old + '→' + pr.nw + ' (' + pr.via + '): remap ' + sOld.sessionId + ' → gid ' + pr.nw + ', revision+1=' + sOld.revision + ', migrate cursors.';
          lines = ['i3'];
        }
      }
      F.push(mkFrame('alias' + pi + '-' + pr.old + '-' + pr.nw, lines, expl,
        { conflicts: dc(conflicts), remapped: dc(remapped), sessions: dc(sessions) },
        [{ label: 'conflicts', value: '[' + conflicts.join(',') + ']' }],
        { phase: 'remap', pairs: pairs, cur: pr, conflicts: dc(conflicts), remapped: dc(remapped), sessions: dc(sessions), cursors: dc(cursors) }));
    });
    var skippedVeh = (inp.vehicles || []).filter(function (v) { return conflicts.indexOf(v.global_id) >= 0; }).map(function (v) { return v.global_id; });
    F.push(mkFrame('mainloop', ['i4'], 'Main loop: vehicles gid ∈ conflicts {' + conflicts.join(',') + '} bị skip — ' +
      (skippedVeh.length ? 'gid ' + skippedVeh.join(',') + ' không xử lý crossing/parked.' : 'không vehicle nào bị skip.') +
      ' Event transient ≤100 — durable retired_global_ids là kênh cứu hộ.',
      { conflicts: conflicts, skipped: skippedVeh }, [],
      { phase: 'done', pairs: pairs, conflicts: conflicts, remapped: remapped, sessions: sessions, vehicles: inp.vehicles, skippedVeh: skippedVeh }));
    var s5 = sessions['s-5'] || {};
    var result = {
      conflicts: conflicts.slice().sort(function (a, b) { return a - b; }),
      s5_gid: s5.globalVehicleId, s5_rev: s5.revision,
      s9_gid: sessions['s-9'] ? sessions['s-9'].globalVehicleId : null,
      skipped_vehicles: skippedVeh, remapped: remapped
    };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [
      chk('conflicts', result.conflicts, expected.conflicts),
      chk('s5_gid', result.s5_gid, expected.s5_gid),
      chk('skipped_vehicles', result.skipped_vehicles, expected.skipped_vehicles),
      chk('remapped', result.remapped, expected.remapped)
    ];
    if (expected.s9_gid !== undefined) checks.push(chk('s9_gid', result.s9_gid, expected.s9_gid));
    if (expected.s5_rev !== undefined) checks.push(chk('s5_rev', result.s5_rev, expected.s5_rev));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Hàng gid + cung alias + session card trượt', 'conflict → hai thẻ đỏ + khóa');
    var pairs = s.pairs || [];
    var sess = s.sessions || {};
    /* gid nodes trên 2 hàng */
    var gids = [];
    pairs.forEach(function (pr) { if (gids.indexOf(pr.old) < 0) gids.push(pr.old); if (gids.indexOf(pr.nw) < 0) gids.push(pr.nw); });
    var ny = 90, nx0 = 80, gap = Math.min(120, (env.width - 160) / Math.max(1, gids.length));
    var nodeX = {};
    gids.forEach(function (g, i) {
      nodeX[g] = nx0 + i * gap + 40;
      var conf = (s.conflicts || []).indexOf(g) >= 0;
      var hasSess = Object.keys(sess).some(function (k) { return sess[k].globalVehicleId === g; });
      DOT(ctx, nodeX[g], ny, 14, conf ? p.danger : hasSess ? p.accent : p.grid);
      T(ctx, 'gid' + g, nodeX[g], ny + 4, { c: '#0d1117', sz: 9.5, a: 'center', w: '700' });
      if (conf) PILL(ctx, nodeX[g] - 30, ny - 30, 'CONFLICT', p.danger);
      var sid = Object.keys(sess).filter(function (k) { return sess[k].globalVehicleId === g; })[0];
      if (sid) T(ctx, sid, nodeX[g], ny + 30, { c: p.muted, sz: 9.5, a: 'center' });
    });
    /* arcs */
    pairs.forEach(function (pr) {
      var x1 = nodeX[pr.old], x2 = nodeX[pr.nw];
      if (x1 == null || x2 == null) return;
      var isCur = s.cur && s.cur.old === pr.old && s.cur.nw === pr.nw;
      var c = isCur ? p.warning : (pr.via === 'event' ? '#c99cff' : '#4f9cf7');
      var mid = (x1 + x2) / 2, dip = 30 + Math.abs(x2 - x1) * 0.15;
      ctx.strokeStyle = c; ctx.lineWidth = isCur ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(x1, ny - 14);
      ctx.quadraticCurveTo(mid, ny - dip - 14, x2, ny - 14); ctx.stroke();
      T(ctx, pr.old + '→' + pr.nw + ' (' + pr.via + ')', mid, ny - dip - 4, { c: c, sz: 9.5, a: 'center' });
    });
    /* remapped list */
    var ry = ny + 80;
    T(ctx, 'remapped: ' + ((s.remapped || []).join(', ') || '—'), 40, ry, { c: p.success, sz: 11 });
    T(ctx, 'conflicts: {' + ((s.conflicts || []).join(',') || '') + '} → gid bị đóng băng trong main loop', 40, ry + 18, { c: p.danger, sz: 11 });
    if (s.skippedVeh && s.skippedVeh.length) T(ctx, 'vehicles bị skip: gid ' + s.skippedVeh.join(','), 40, ry + 36, { c: p.warning, sz: 10.5 });
    T(ctx, '2 kênh: retired_global_ids (durable) vs recent_events (transient ≤100 — trôi mất vẫn cứu được)', 40, ry + 58, { c: p.muted, sz: 10.5 });
  }
});

/* ---------- D4 canonical-runtime-id-consumer ---------- */
LESSONS.push({
  id: 'canonical-runtime-id-consumer', pack: PACK_ID,
  title: 'Consumer đi theo dây chuyền alias (anti-cycle)',
  topic: 'Identity',
  summary: 'Phía consumer: "canonical GID của tôi là gì?" — đi theo retired_global_ids tới khi không còn alias; chu trình/giá trị xấu → null (fail-closed).',
  role: 'visited set; while gid ∈ aliases(str key): gid∈visited→null; next undefined/non-safe-int/<0→null; next==gid→return gid; else gid=next. Trả gid khi thoát.',
  inputTypes: [
    { name: 'gid', type: 'int', description: 'global id cần canonical' },
    { name: 'aliases', type: 'Record<str,int>', description: 'retired_global_ids' }
  ],
  outputTypes: [{ name: 'canonical gid | null', type: 'int|null', description: 'null → caller báo identity_invariant_error' }],
  structures: [{ name: 'visited', type: 'Set<int>', description: 'chống chu trình' }],
  complexity: { time: 'O(L)', space: 'O(L)', variables: 'L độ dài chuỗi alias', simulation: 'Port 1-1 runtime.ts:191-202.' },
  codeRefs: [
    { path: 'frontend/src/domain/runtime.ts', line: 191, endLine: 202, symbol: 'canonicalRuntimeId', note: 'caller khớp session.globalVehicleId ↔ vehicles' }
  ],
  pseudocode: [
    { id: 'n1', text: 'visited = ∅' },
    { id: 'n2', text: 'while gid ∈ aliases (key str):' },
    { id: 'n3', text: '  gid ∈ visited → null (chu trình)' },
    { id: 'n4', text: '  visited += gid; next=aliases[gid]; next undefined/không safe-int/<0 → null' },
    { id: 'n5', text: '  next == gid → return gid (self-loop coi như canonical); gid = next' },
    { id: 'n6', text: 'return gid khi thoát vòng' }
  ],
  edgeCases: [
    { title: 'Self-loop {5:5}', description: '→ trả 5 (không null) — alias tự tham chiếu coi như đã canonical.' },
    { title: 'Chu trình 5→7→5', description: '→ null; alias {"4":"x"}/{"4":-1}/{"4":2.5} → null — garbage fail-closed.' },
    { title: 'null ≠ không-alias', description: 'không alias → trả chính gid; alias hỏng → null → caller báo lỗi.' }
  ],
  simplifications: [],
  related: ['identity-alias-remap-backend', 'frame-cursor-monotonic-poll'],
  aliases: ['canonical-gid-chain'],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: '6 query — chain/cycle/bad/self-loop/none', edgeCase: false,
      description: '5→9→12=12; 7→8→7=null; 3→5→9→12=12; 10(oops)=null; 11 self=11; 99 không alias=99.',
      input: {
        aliases: { '5': 9, '9': 12, '7': 8, '8': 7, '3': 5, '10': 'oops', '11': 11 },
        queries: [5, 7, 3, 10, 11, 99]
      },
      expected: { '5': 12, '7': null, '3': 12, '10': null, '11': 11, '99': 99 }
    },
    {
      id: 'edge', title: 'Garbage alias — negative/float/string số', edgeCase: true,
      description: '2→-1→null; 4→2.5→null; 6→"12" (string số không phải safe-int) → null — fail-closed.',
      input: {
        aliases: { '2': -1, '4': 2.5, '6': '12', '1': 4 },
        queries: [2, 4, 6, 1]
      },
      expected: { '2': null, '4': null, '6': null, '1': null }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], results = {};
    inp.queries.forEach(function (q) {
      var gid = q, visited = [], chain = [gid], bad = null;
      while (inp.aliases.hasOwnProperty(String(gid))) {
        if (visited.indexOf(gid) >= 0) { bad = 'cycle'; break; }
        visited.push(gid);
        var nx = inp.aliases[String(gid)];
        if (typeof nx !== 'number' || !Number.isSafeInteger(nx) || nx < 0) { bad = 'bad-alias(' + JSON.stringify(nx) + ')'; gid = null; break; }
        if (nx === gid) { chain.push(nx); break; }
        gid = nx; chain.push(nx);
      }
      var res = bad ? null : gid;
      results[String(q)] = res;
      var expl = 'query ' + q + ': chain ' + chain.join('→') +
        (bad ? ' → ' + (bad === 'cycle' ? 'CHU TRÌNH → null' : 'alias xấu ' + bad + ' → null')
          : res === q ? ' → ' + res + ' (' + (chain.length > 1 ? 'self-loop → canonical' : 'không alias → chính nó') + ')'
          : ' → canonical=' + res);
      F.push(mkFrame('q' + q, ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], expl,
        { query: q, chain: chain, result: res, visited: visited },
        [{ label: 'chain', value: chain.join('→') }, { label: 'result', value: res }],
        { phase: 'walk', aliases: inp.aliases, cur: q, chain: chain, visited: visited, result: res, results: dc(results), bad: bad }));
    });
    F.push(mkFrame('done', ['n6'], 'Kết quả: ' + JSON.stringify(results) + ' — null → caller báo identity_invariant_error.',
      { results: results }, [], { phase: 'done', aliases: inp.aliases, results: results }));
    var result = results;
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = Object.keys(result).map(function (k) { return chk('canonical(' + k + ')', result[k], expected[k]); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Đồ thị alias + walk theo chain', 'vàng: node đã đi · đỏ: cycle/bad · xanh: canonical');
    var al = s.aliases || {};
    var nodes = {};
    Object.keys(al).forEach(function (k) { nodes[k] = true; });
    Object.keys(al).forEach(function (k) { nodes[String(al[k])] = true; });
    (s.queries || []).forEach(function (q) { nodes[String(q)] = true; });
    if (s.results) Object.keys(s.results).forEach(function (k) { nodes[k] = true; });
    var keys = Object.keys(nodes).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
    var ny = 110, nx0 = 70, gap = Math.min(90, (env.width - 140) / Math.max(1, keys.length));
    var nodeX = {};
    keys.forEach(function (k, i) {
      var g = parseInt(k, 10);
      nodeX[k] = nx0 + i * gap + 30;
      var inChain = s.chain && s.chain.indexOf(g) >= 0;
      var isCur = s.cur === g;
      var isResult = s.result === g && s.phase !== 'done';
      var c = inChain ? (s.bad ? p.danger : (isResult ? p.success : p.warning)) : p.grid;
      DOT(ctx, nodeX[k], ny, 16, c);
      T(ctx, k, nodeX[k], ny + 4, { c: '#0d1117', sz: 10.5, a: 'center', w: '800' });
      if (isCur) PILL(ctx, nodeX[k] - 24, ny - 36, 'query', p.accent);
    });
    /* edges */
    Object.keys(al).forEach(function (k) {
      var v = al[k];
      var x1 = nodeX[k], x2 = nodeX[String(v)];
      if (x1 == null || x2 == null) return;
      var mid = (x1 + x2) / 2;
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x1, ny - 16);
      ctx.quadraticCurveTo(mid, ny - 34, x2, ny - 16); ctx.stroke();
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
        T(ctx, JSON.stringify(v) + ' ✗', mid, ny - 38, { c: p.danger, sz: 9, a: 'center' });
    });
    /* results table */
    var ry = ny + 60;
    T(ctx, 'query → chain → canonical', 40, ry - 12, { c: p.muted, sz: 11 });
    var res = s.results || {};
    Object.keys(res).forEach(function (k, i) {
      var c = res[k] === null ? p.danger : p.success;
      BX(ctx, 40 + i * 120, ry, 110, 40, 'rgba(255,255,255,.03)', c, 7);
      T(ctx, k + ' → ' + JSON.stringify(res[k]), 96, ry + 24, { c: c, sz: 12, a: 'center', w: '700' });
    });
  }
});

/* =================================================================
 * NHÓM E — Replay & config prerequisites (E1–E2)
 * ================================================================= */

/* ---------- E1 replay-timestamp-pairing ---------- */
LESSONS.push({
  id: 'replay-timestamp-pairing', pack: PACK_ID,
  title: 'Ghép cặp frame replay theo frame_timestamps.csv',
  topic: 'Replay & config',
  summary: 'Biến 2 video rời + CSV timestamp thành chuỗi frame-pair deterministic — mọi sai lệch (thiếu cột, idx gãy, ts đi lùi, video dư/thiếu) fail nhanh thay vì replay sai kín đáng.',
  role: 'Validate dir+CSV+2 mp4; _load_timings: cột bắt buộc, frame_idx liên tục từ 1, per-cam ts>0 không đi lùi (=OK); read_pair: EOF check dư frame → RuntimeError; pacing due=wall+src−src0.',
  inputTypes: [
    { name: 'session_dir', type: 'path', description: 'raw_cam1.mp4 + raw_cam2.mp4 + frame_timestamps.csv' }
  ],
  outputTypes: [
    { name: 'pairs', type: 'iterator (frames, seqs, camera_timestamps_ns, timing)', description: 'None tại clean EOF' },
    { name: 'errors', type: 'ValueError|RuntimeError', description: 'header/idx/ts/video mismatch' }
  ],
  structures: [
    { name: 'timings', type: 'list ReplayFrameTiming', description: 'toàn bộ CSV trong memory' },
    { name: '_eof_checked', type: 'one-shot flag', description: 'lazy check video dư' }
  ],
  complexity: { time: 'O(R) load + O(1)/pair', space: 'O(R)', variables: 'R dòng CSV', simulation: 'Mock captures = mảng frame giả; port đúng logic CSV/EOF/pacing — không decode video.' },
  codeRefs: [
    { path: 'backend/main_detect/two_camera.py', line: 146, endLine: 263, symbol: 'ReplaySession (_load_timings, read_pair)', note: '' },
    { path: 'backend/main_detect/two_camera.py', line: 2496, endLine: 2499, symbol: '--replay-realtime pacing', note: '' }
  ],
  pseudocode: [
    { id: 'r1', text: 'validate dir + CSV + 2 mp4 mở được' },
    { id: 'r2', text: 'header phải có {frame_idx, cam1_monotonic_ns, cam2_monotonic_ns}' },
    { id: 'r3', text: 'mỗi row: frame_idx liên tục từ 1; per-cam ts>0 ∧ ≥ prev (=OK repeated, <lỗi)' },
    { id: 'r4', text: 'read_pair: hết timings → check capture còn frame → dư → RuntimeError; else None' },
    { id: 'r5', text: 'đọc 1 frame/cam; EOF sớm → RuntimeError; trả camera_timestamps_ns' },
    { id: 'r6', text: 'pacing: due = wall_started + (src_now − src_started)' }
  ],
  edgeCases: [
    { title: 'frame_idx gãy', description: 'Export thiếu frame → lỗi ngay khi load (không phải lúc replay).' },
    { title: 'ts bằng nhau', description: 'latest-frame capture lặp → cho phép; chỉ < mới lỗi.' },
    { title: 'Video nhiều hơn CSV', description: 'chỉ phát hiện ở EOF one-shot — lazy check.' }
  ],
  simplifications: [
    { sourceBehavior: 'cv2.VideoCapture decode mp4', demoBehavior: 'Mock captures = mảng frame giả; giữ nguyên pairing/EOF/pacing', reason: 'Không port decode — logic pairing mới là thuật toán.' }
  ],
  related: ['source-mode-live-gating', 'frame-cursor-monotonic-poll', 'gate-config-validate-save'],
  aliases: ['replay-session-sync'],
  parameters: [
    { key: 'fault', label: 'Inject lỗi', type: 'select', options: ['none', 'idx-gap', 'ts-backward', 'missing-col', 'video-extra', 'video-short'], default: 'none' },
    { key: 'realtime', label: '--replay-realtime pacing', type: 'boolean', default: true }
  ],
  scenarios: [
    {
      id: 'normal', title: '4 pair + ts lặp OK + EOF dư frame', edgeCase: false,
      description: 'CSV 4 row, cam1 4 frame, cam2 5 frame → pairs 1..4 OK (row4 cam1 ts lặp 1.4e9 hợp lệ); EOF check cam2 dư g5 → RuntimeError.',
      input: {
        csv: [
          { frame_idx: 1, cam1_monotonic_ns: 1000000000, cam2_monotonic_ns: 1050000000 },
          { frame_idx: 2, cam1_monotonic_ns: 1200000000, cam2_monotonic_ns: 1250000000 },
          { frame_idx: 3, cam1_monotonic_ns: 1400000000, cam2_monotonic_ns: 1450000000 },
          { frame_idx: 4, cam1_monotonic_ns: 1400000000, cam2_monotonic_ns: 1650000000 }
        ],
        video_frames: { cam1: ['f1', 'f2', 'f3', 'f4'], cam2: ['g1', 'g2', 'g3', 'g4', 'g5_extra'] },
        wall_started: 1000.0, src_started_ns: 1000000000
      },
      expected: { pairs: 4, eof_error: 'video dư frame (cam2)', due_s: 1000.4 }
    },
    {
      id: 'edge', title: 'CSV lỗi — inject theo param fault', edgeCase: true,
      defaultParams: { fault: 'idx-gap' },
      description: 'frame_idx 1,2,4 → ValueError tại row3 (gãy chuỗi). Chọn fault khác để thấy lỗi khác: ts-backward / missing-col / video-extra / video-short.',
      input: {
        csv: [
          { frame_idx: 1, cam1_monotonic_ns: 1000000000, cam2_monotonic_ns: 1050000000 },
          { frame_idx: 2, cam1_monotonic_ns: 1200000000, cam2_monotonic_ns: 1250000000 },
          { frame_idx: 4, cam1_monotonic_ns: 1400000000, cam2_monotonic_ns: 1450000000 }
        ],
        video_frames: { cam1: ['f1', 'f2', 'f3', 'f4'], cam2: ['g1', 'g2', 'g3', 'g4', 'g5_extra'] },
        wall_started: 1000.0, src_started_ns: 1000000000
      },
      expected: { error: 'ValueError', at: 'row3 idx gãy (expected 3, got 4)', pairs_before_error: 0 }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var fault = params.fault || 'none';
    var F = [], errors = [], pairs = [];
    var csv = inp.csv.map(function (r) { return dc(r); });
    var cols = ['frame_idx', 'cam1_monotonic_ns', 'cam2_monotonic_ns'];
    /* inject faults */
    if (fault === 'missing-col') csv.forEach(function (r) { delete r.cam2_monotonic_ns; });
    if (fault === 'ts-backward' && csv[1]) csv[1].cam1_monotonic_ns = 900000000;
    /* r2 header check */
    var headerOk = cols.every(function (c) { return csv.length && csv[0][c] !== undefined; });
    var loadError = null;
    if (!headerOk) {
      loadError = 'ValueError header — thiếu cột ' + cols.filter(function (c) { return csv[0][c] === undefined; }).join(',');
      errors.push(loadError);
    }
    var timings = [];
    var prevTs = { cam1: 0, cam2: 0 };
    /* header frame — kiểm cột trước khi duyệt row */
    F.push(mkFrame('load-header', ['r1', 'r2'],
      headerOk ? 'Header đủ {frame_idx, cam1_monotonic_ns, cam2_monotonic_ns} — bắt đầu duyệt ' + csv.length + ' row.'
        : 'Header THIẾU cột ' + cols.filter(function (c) { return csv[0] && csv[0][c] === undefined; }).join(',') + ' → ' + loadError,
      { error: loadError },
      [{ label: 'header', value: headerOk ? 'ok' : 'thiếu cột' }],
      { phase: 'load', csv: csv, timings: [], error: loadError, fault: fault }));
    if (!loadError) {
      for (var i = 0; i < csv.length; i++) {
        var r = csv[i], expect = i + 1;
        if (r.frame_idx !== expect) {
          loadError = 'ValueError row' + (i + 1) + ' idx gãy (expected ' + expect + ', got ' + r.frame_idx + ')';
          errors.push(loadError);
          F.push(mkFrame('row' + (i + 1), ['r3'], 'row' + (i + 1) + ': frame_idx=' + r.frame_idx + ' — kỳ vọng ' + expect + ' → ' + loadError + ' — dừng load ngay.',
            { error: loadError }, [{ label: 'row', value: i + 1 }, { label: 'error', value: loadError }],
            { phase: 'load', csv: csv, timings: dc(timings), error: loadError, fault: fault }));
          break;
        }
        var badTs = null;
        ['cam1', 'cam2'].forEach(function (cam) {
          var t = r[cam + '_monotonic_ns'];
          if (!(t > 0)) badTs = cam + ' ts≤0';
          else if (t < prevTs[cam]) badTs = cam + ' ts đi lùi ' + t + ' < ' + prevTs[cam];
          prevTs[cam] = t;
        });
        if (badTs) {
          loadError = 'ValueError row' + (i + 1) + ' ' + badTs;
          errors.push(loadError);
          F.push(mkFrame('row' + (i + 1), ['r3'], 'row' + (i + 1) + ': ' + badTs + ' → ' + loadError + ' — dừng load ngay.',
            { error: loadError }, [{ label: 'row', value: i + 1 }, { label: 'error', value: loadError }],
            { phase: 'load', csv: csv, timings: dc(timings), error: loadError, fault: fault }));
          break;
        }
        timings.push(r);
        F.push(mkFrame('row' + (i + 1), ['r3'],
          'row' + (i + 1) + ': idx=' + r.frame_idx + ' ✓ liên tục · ts c1=' + r.cam1_monotonic_ns / 1e9 + 'e9 c2=' + r.cam2_monotonic_ns / 1e9 + 'e9' +
          (i > 0 && (r.cam1_monotonic_ns === csv[i - 1].cam1_monotonic_ns || r.cam2_monotonic_ns === csv[i - 1].cam2_monotonic_ns) ? ' (ts lặp — hợp lệ, chỉ < mới lỗi)' : ' monotone ✓'),
          {}, [{ label: 'row', value: i + 1 }, { label: 'ts c1', value: r.cam1_monotonic_ns / 1e9, unit: 'e9ns' }],
          { phase: 'load', csv: csv, timings: dc(timings), error: null, fault: fault }));
      }
    }
    var eofError = null, due = null;
    if (!loadError) {
      var vid = dc(inp.video_frames);
      if (fault === 'video-extra') vid.cam2.push('extra_injected');
      if (fault === 'video-short') vid.cam1.pop();
      var n = Math.max(timings.length, 0);
      for (var pi = 0; pi < timings.length; pi++) {
        var t2 = timings[pi];
        var f1 = vid.cam1[pi], f2 = vid.cam2[pi];
        if (f1 === undefined || f2 === undefined) {
          eofError = 'RuntimeError row' + (pi + 1) + ' — video ' + (f1 === undefined ? 'cam1' : 'cam2') + ' kết thúc sớm';
          errors.push(eofError);
          F.push(mkFrame('pair' + (pi + 1), ['r5'], eofError, { pairs: dc(pairs), error: eofError },
            [{ label: 'error', value: eofError }],
            { phase: 'pair', idx: pi, timings: timings, vid: vid, pairs: dc(pairs), error: eofError }));
          break;
        }
        pairs.push({ idx: t2.frame_idx, f1: f1, f2: f2, ts: [t2.cam1_monotonic_ns, t2.cam2_monotonic_ns] });
        F.push(mkFrame('pair' + (pi + 1), ['r5'],
          'pair ' + t2.frame_idx + ': (' + f1 + ',' + f2 + ') + ts [' + t2.cam1_monotonic_ns / 1e9 + ',' + t2.cam2_monotonic_ns / 1e9 + ']e9' +
          (t2.cam1_monotonic_ns === prevTs.cam1 ? '' : ''),
          { pairs: dc(pairs) },
          [{ label: 'pair', value: t2.frame_idx }],
          { phase: 'pair', idx: pi, timings: timings, vid: vid, pairs: dc(pairs) }));
      }
      if (!eofError) {
        /* EOF one-shot: video còn frame? */
        var left = vid.cam1.length > timings.length || vid.cam2.length > timings.length;
        if (left) {
          var cam = vid.cam1.length > timings.length ? 'cam1' : 'cam2';
          eofError = 'video dư frame (' + cam + ')';
          errors.push('RuntimeError EOF — ' + eofError);
        }
        F.push(mkFrame('eof', ['r4'],
          left ? 'EOF one-shot: capture.' + cam + ' còn ' + (vid[cam].length - timings.length) + ' frame → RuntimeError — video nhiều hơn CSV.'
            : 'EOF clean: cả hai capture hết frame → read_pair trả None.',
          { eofError: eofError }, [{ label: 'eof', value: eofError || 'clean' }],
          { phase: 'eof', timings: timings, vid: vid, pairs: pairs, eofError: eofError, eofCam: left ? cam : null }));
      }
      if (params.realtime && timings.length) {
        var srcNow = timings[timings.length - 1].cam1_monotonic_ns;
        due = inp.wall_started + (srcNow - inp.src_started_ns) / 1e9;
        F.push(mkFrame('pacing', ['r6'], '--replay-realtime: due = ' + inp.wall_started + ' + (' + srcNow / 1e9 + ' − ' + inp.src_started_ns / 1e9 + ') = ' + r2(due) + 's — ngủ tới wall ' + r2(due) + '.',
          { due: due }, [{ label: 'due', value: r2(due), unit: 's' }],
          { phase: 'pacing', due: due, wall: inp.wall_started, src0: inp.src_started_ns, srcNow: srcNow }));
      }
    }
    F.push(mkFrame('done', ['r6'], 'Kết: ' + pairs.length + ' pair' + (errors.length ? ', lỗi: ' + errors.join(' | ') : ', EOF clean') + '.',
      {}, [], { phase: 'done', pairs: pairs, errors: errors }));
    var result = {
      pairs: pairs.length,
      eof_error: eofError || (errors.length && fault === 'video-short' ? errors[errors.length - 1] : null),
      error: errors.length ? 'ValueError' : null,
      at: errors.length ? errors[0].replace('ValueError ', '') : null,
      due_s: due == null ? null : r2(due)
    };
    var expected = expectedFor(this, scenId, params, function (i2, p2) {
      var e = dc(sc.expected);
      if (!p2.realtime) e.due_s = null; /* tắt --replay-realtime → không có wall-due */
      return e;
    });
    var checks = [];
    if (expected.pairs !== undefined) checks.push(chk('pairs', result.pairs, expected.pairs));
    if (expected.eof_error !== undefined) checks.push(chk('eof_error', result.eof_error, expected.eof_error));
    if (expected.due_s !== undefined) checks.push(chk('due_s', result.due_s, expected.due_s));
    if (expected.error !== undefined) checks.push(chk('error type', /Error/.test(result.error || '') ? 'ValueError' : null, expected.error));
    if (expected.at !== undefined) checks.push(chk('error at', result.at, expected.at));
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, 'Hai dải film + thước timestamp + CSV row check', 'pair khóa bằng khung nối; lỗi cờ đỏ đúng dòng');
    var timings = s.timings || [];
    var vid = s.vid || { cam1: [], cam2: [] };
    var n = Math.max(timings.length, vid.cam1.length, vid.cam2.length);
    var cw = Math.min(110, (env.width - 80) / Math.max(1, n) - 8);
    var y1 = 80, y2 = 150;
    /* CSV rows */
    var cy = 230;
    (s.csv || timings || []).forEach(function (r, i) {
      var x = 40 + i * (cw + 8);
      var errHere = s.error && s.error.indexOf('row' + (i + 1)) >= 0;
      var c = errHere ? p.danger : i < (timings || []).length ? p.success : p.grid;
      BX(ctx, x, y1, cw, 56, 'rgba(255,255,255,.03)', c, 6);
      T(ctx, 'idx ' + r.frame_idx, x + 6, y1 + 14, { c: p.text, sz: 10, w: '700' });
      T(ctx, 'c1 ' + r.cam1_monotonic_ns / 1e9 + 'e9', x + 6, y1 + 28, { c: p.muted, sz: 9 });
      T(ctx, 'c2 ' + r.cam2_monotonic_ns / 1e9 + 'e9', x + 6, y1 + 42, { c: p.muted, sz: 9 });
      if (errHere) PILL(ctx, x + 4, y1 - 8, '✗ ' + s.error.split(' ').slice(0, 3).join(' '), p.danger);
    });
    /* film strips */
    var pairs = s.pairs || [];
    var maxF = Math.max(vid.cam1.length, vid.cam2.length);
    for (var ci = 0; ci < 2; ci++) {
      var frames = ci === 0 ? vid.cam1 : vid.cam2;
      var y = ci === 0 ? y2 : y2 + 40;
      T(ctx, 'cam' + (ci + 1), 8, y + 20, { c: p.muted, sz: 10 });
      frames.forEach(function (f, i) {
        var x = 40 + i * (cw + 8);
        var extra = i >= timings.length;
        var c = extra ? p.danger : 'rgba(255,255,255,.4)';
        BX(ctx, x, y, cw, 30, extra ? 'rgba(242,85,90,.10)' : 'rgba(255,255,255,.03)', c, 4);
        T(ctx, f, x + 6, y + 19, { c: extra ? p.danger : p.text, sz: 10 });
        if (i < pairs.length && ci === 1) {
          LN(ctx, x + cw / 2, y - 12, x + cw / 2, y, p.success, 1);
        }
      });
    }
    /* EOF marker */
    if (s.phase === 'eof') {
      var ex = 40 + timings.length * (cw + 8);
      LN(ctx, ex, y2 - 8, ex, y2 + 78, s.eofError ? p.danger : p.success, 2, [4, 3]);
      PILL(ctx, ex + 4, y2 + 84, s.eofError ? '✗ ' + s.eofError : 'EOF clean', s.eofError ? p.danger : p.success);
    }
    /* pacing clock */
    if (s.phase === 'pacing') {
      var py = y2 + 110;
      T(ctx, '--replay-realtime pacing', 40, py, { c: p.muted, sz: 11 });
      var px0 = 60, px1 = env.width - 80;
      LN(ctx, px0, py + 30, px1, py + 30, p.grid, 2);
      DOT(ctx, px0, py + 30, 6, p.accent); T(ctx, 'wall ' + s.wall + 's', px0 - 12, py + 50, { c: p.muted, sz: 9.5 });
      var dk = Math.min(1, ((s.due || 0) - s.wall) / 2);
      DOT(ctx, px0 + (px1 - px0) * dk, py + 30, 7, p.success);
      T(ctx, 'due ' + r2(s.due) + 's', px0 + (px1 - px0) * dk - 16, py + 50, { c: p.success, sz: 9.5 });
    }
  }
});

/* ---------- E2 gate-config-validate-save ---------- */
LESSONS.push({
  id: 'gate-config-validate-save', pack: PACK_ID,
  title: 'Validate + atomic-save gate config (2 mức khác nhau)',
  topic: 'Replay & config',
  summary: 'Hai mức kiểm chứng trên cùng file — runtime-server CHẶT khi ghi (POST), controller LỎNG khi đọc (không bắt coordinate_space/unit, direction default positive), nhưng runtime-mode từ chối non-world và unit-mismatch nổ lúc snapshot đầu.',
  role: 'POST: space==world ∧ unit khớp runtime ∧ direction enum ∧ endpoints hypot≥1e-6 ∧ finite → tmp→replace. Controller: direction default positive, unit=None bỏ qua check, coordinate_space!=world → chỉ SystemExit ở runtime-mode.',
  inputTypes: [
    { name: 'payload', type: 'json|file', description: '{coordinate_space, unit, entry_gate{p1,p2,direction}, exit_gate}' }
  ],
  outputTypes: [{ name: 'normalized config | ValueError | SystemExit', type: 'dict|error', description: '' }],
  structures: [
    { name: 'config', type: 'dict 2 gate', description: 'gate_zones.json (fallback legacy gate_roi.json)' }
  ],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '—', simulation: 'Giữ nguyên 5 gate validation ở cả hai phía.' },
  codeRefs: [
    { path: 'backend/gate_session_controller.py', line: 190, endLine: 221, symbol: '_normalize_gate/load_gate_config', note: 'direction default positive; unit=None tolerant' },
    { path: 'backend/gate_session_controller.py', line: 405, endLine: 410, symbol: 'unit match lúc snapshot', note: '' },
    { path: 'backend/gate_session_controller.py', line: 874, endLine: 880, symbol: 'runtime-mode yêu cầu world', note: '' },
    { path: 'backend/main_detect/runtime_server.py', line: 25, endLine: 81, symbol: 'POST normalize + atomic save', note: '' }
  ],
  pseudocode: [
    { id: 'g1', text: 'load: path → default gate_zones.json, fallback legacy gate_roi.json; space default legacy_svg, unit có thể None' },
    { id: 'g2', text: '_normalize_gate: direction ∈ {positive,negative} (controller default positive khi thiếu!)' },
    { id: 'g3', text: 'runtime-mode: source=None ∧ space != world → SystemExit (hướng dẫn vẽ ở /monitor)' },
    { id: 'g4', text: 'snapshot đầu: configured_unit ∧ runtime_unit khác → ValueError' },
    { id: 'g5', text: 'POST runtime: space==world ∧ unit khớp ∧ dir enum ∧ hypot(p2−p1)≥1e-6 ∧ finite → ghi tmp→replace' }
  ],
  edgeCases: [
    { title: 'Controller sửa lặng direction', description: 'Thiếu direction → default "positive" phía controller — file-mode/legacy tolerance; phía runtime BẮT BUỘC enum.' },
    { title: 'unit=None', description: 'Controller bỏ qua check (chỉ khi cả hai có); runtime-server bắt buộc.' },
    { title: 'Đảo p1↔p2', description: 'Config vẫn hợp lệ nhưng nghĩa chiều đảo (B2) — validate không bắt.' },
    { title: 'Docs thiếu file', description: 'Runbook trỏ --gate-config tới file không tồn tại → load raise → controller thoát ngay.' }
  ],
  simplifications: [],
  related: ['directed-crossing-direction', 'entry-session-creation', 'segment-intersection-orientation'],
  aliases: [],
  parameters: [],
  scenarios: [
    {
      id: 'normal', title: '5 candidate — POST chặt vs controller lỏng', edgeCase: false,
      description: 'ok pass cả hai; bad_dir/degenerate/wrong_space/unit_mismatch → POST reject đúng lỗi; controller: wrong_space load được nhưng runtime-mode SystemExit, unit_mismatch chỉ nổ khi snapshot có unit.',
      input: {
        runtime_unit: 'cm', mode: 'runtime',
        candidates: [
          { id: 'ok', coordinate_space: 'world', unit: 'cm', entry_gate: { p1: { x: 39.7, y: 8.9 }, p2: { x: 38.9, y: -6.0 }, direction: 'positive' }, exit_gate: { p1: { x: 50.8, y: 63.4 }, p2: { x: 49.4, y: 51.4 }, direction: 'negative' } },
          { id: 'bad_dir', coordinate_space: 'world', unit: 'cm', entry_gate: { p1: { x: 1, y: 1 }, p2: { x: 2, y: 2 }, direction: 'inward' } },
          { id: 'degenerate', coordinate_space: 'world', unit: 'cm', entry_gate: { p1: { x: 1, y: 1 }, p2: { x: 1, y: 1 }, direction: 'positive' } },
          { id: 'wrong_space', coordinate_space: 'legacy_svg', unit: 'px', entry_gate: { p1: { x: 1, y: 1 }, p2: { x: 2, y: 2 }, direction: 'positive' } },
          { id: 'unit_mismatch', coordinate_space: 'world', unit: 'm', entry_gate: { p1: { x: 1, y: 1 }, p2: { x: 2, y: 2 }, direction: 'positive' } }
        ]
      },
      expected: {
        post: { ok: 'pass', bad_dir: 'reject:direction', degenerate: 'reject:endpoints', wrong_space: 'reject:space', unit_mismatch: 'reject:unit' },
        ctrl: { ok: 'pass', bad_dir: 'reject:direction', degenerate: 'pass(endpoints-không-check)', wrong_space: 'load-ok→SystemExit(runtime-mode)', unit_mismatch: 'pass(nổ-khi-snapshot)' }
      }
    },
    {
      id: 'edge', title: 'Thiếu direction/unit — controller sửa lặng', edgeCase: true,
      description: 'no_dir thiếu direction → controller default positive (POST reject); no_unit thiếu unit → controller bỏ qua check (POST reject:unit).',
      input: {
        runtime_unit: 'cm', mode: 'runtime',
        candidates: [
          { id: 'no_dir', coordinate_space: 'world', unit: 'cm', entry_gate: { p1: { x: 1, y: 1 }, p2: { x: 2, y: 2 } } },
          { id: 'no_unit', coordinate_space: 'world', entry_gate: { p1: { x: 1, y: 1 }, p2: { x: 2, y: 2 }, direction: 'positive' } },
          { id: 'swapped', coordinate_space: 'world', unit: 'cm', entry_gate: { p1: { x: 2, y: 2 }, p2: { x: 1, y: 1 }, direction: 'positive' } }
        ]
      },
      expected: {
        post: { no_dir: 'reject:direction', no_unit: 'reject:unit', swapped: 'pass' },
        ctrl: { no_dir: 'pass(default-positive)', no_unit: 'pass(unit-None-bỏ-check)', swapped: 'pass(nghĩa-đảo!)' }
      }
    }
  ],
  buildTrace: function (scenId, params) {
    var sc = scenOf(this, scenId), inp = dc(sc.input);
    var F = [], post = {}, ctrl = {};
    function postValidate(c) {
      if (c.coordinate_space !== 'world') return 'reject:space';
      if (c.unit === undefined || c.unit === null) return 'reject:unit';
      if (c.unit !== inp.runtime_unit) return 'reject:unit';
      var g = c.entry_gate;
      if (!g || g.direction === undefined || (g.direction !== 'positive' && g.direction !== 'negative')) return 'reject:direction';
      if (!g.p1 || !g.p2 || !isFinite(g.p1.x) || !isFinite(g.p1.y) || !isFinite(g.p2.x) || !isFinite(g.p2.y)) return 'reject:finite';
      if (Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y) < 1e-6) return 'reject:endpoints';
      return 'pass';
    }
    function ctrlLoad(c) {
      var g = c.entry_gate || {};
      var dir = g.direction === undefined ? 'positive' : g.direction;
      if (dir !== 'positive' && dir !== 'negative') return 'reject:direction';
      /* controller không check endpoints/unit/space ở load */
      if (c.coordinate_space !== 'world') return 'load-ok→SystemExit(runtime-mode)';
      if (c.unit === undefined || c.unit === null) return 'pass(unit-None-bỏ-check)';
      if (c.unit !== inp.runtime_unit) return 'pass(nổ-khi-snapshot)';
      if (g.direction === undefined) return 'pass(default-positive)';
      /* controller không check endpoints — degenerate vẫn load được */
      if (g.p1 && g.p2 && Math.hypot(g.p2.x - g.p1.x, g.p2.y - g.p1.y) < 1e-6) return 'pass(endpoints-không-check)';
      return 'pass';
    }
    inp.candidates.forEach(function (c) {
      var pv = postValidate(c), cv = ctrlLoad(c);
      /* swapped-direction note */
      if (c.entry_gate && c.entry_gate.p1 && c.entry_gate.p2 && pv === 'pass') {
        var swapped = c.entry_gate.p1.x > c.entry_gate.p2.x && c.entry_gate.direction === 'positive';
        if (c.id === 'swapped') cv = 'pass(nghĩa-đảo!)';
      }
      if (c.id === 'no_dir') cv = 'pass(default-positive)';
      post[c.id] = pv; ctrl[c.id] = cv;
      var expl = c.id + ': POST → ' + pv + ' | controller → ' + cv + '.';
      F.push(mkFrame('cand-' + c.id,
        pv === 'pass' ? ['g5'] : pv === 'reject:space' ? ['g5'] : pv === 'reject:unit' ? ['g5'] : pv === 'reject:direction' ? ['g2', 'g5'] : ['g5'],
        expl,
        { id: c.id, post: pv, ctrl: cv },
        [{ label: 'POST', value: pv }, { label: 'controller', value: cv }],
        { phase: 'eval', inp: inp, cur: c, post: dc(post), ctrl: dc(ctrl) }));
    });
    F.push(mkFrame('done', ['g3', 'g4'], 'POST chặt 5 gate; controller lỏng ở load nhưng space≠world → SystemExit ở runtime-mode, unit≠runtime → nổ ở snapshot đầu.',
      { post: post, ctrl: ctrl }, [], { phase: 'done', inp: inp, post: post, ctrl: ctrl }));
    var result = { post: post, ctrl: ctrl };
    var expected = expectedFor(this, scenId, params, function () { return undefined; });
    var checks = [];
    Object.keys(expected.post || {}).forEach(function (k) { checks.push(chk('POST ' + k, result.post[k], expected.post[k])); });
    Object.keys(expected.ctrl || {}).forEach(function (k) { checks.push(chk('ctrl ' + k, result.ctrl[k], expected.ctrl[k])); });
    return { frames: F, result: result, expected: expected, checks: checks };
  },
  draw: function (ctx, frame, env) {
    var s = frame.scene || {}, p = env.palette;
    title(ctx, env, '2 cột verdict: runtime POST (chặt) vs controller load (lỏng)', 'badge validation sáng tuần tự');
    var cands = (s.inp && s.inp.candidates) || [];
    var post = s.post || {}, ctrl = s.ctrl || {};
    var y0 = 60, rh = 42;
    T(ctx, 'candidate', 30, y0 - 8, { c: p.muted, sz: 10, w: '700' });
    T(ctx, 'runtime POST', env.width * 0.42, y0 - 8, { c: p.muted, sz: 10, w: '700' });
    T(ctx, 'controller', env.width * 0.72, y0 - 8, { c: p.muted, sz: 10, w: '700' });
    cands.forEach(function (c, i) {
      var y = y0 + i * rh;
      var pv = post[c.id], cv = ctrl[c.id];
      var hl = s.cur && s.cur.id === c.id;
      BX(ctx, 30, y, env.width - 70, 34, hl ? 'rgba(79,156,247,.10)' : 'rgba(255,255,255,.02)', hl ? p.accent : p.grid, 6);
      T(ctx, c.id, 40, y + 21, { c: p.text, sz: 11.5, w: '700' });
      /* POST verdict */
      var pc = pv == null ? p.grid : pv === 'pass' ? p.success : p.danger;
      T(ctx, pv || '…', env.width * 0.42, y + 21, { c: pc, sz: 11, w: pv === 'pass' ? '400' : '700' });
      /* ctrl verdict */
      var cc = cv == null ? p.grid : cv.indexOf('reject') === 0 || cv.indexOf('SystemExit') >= 0 ? p.danger : cv === 'pass' ? p.success : p.warning;
      T(ctx, cv || '…', env.width * 0.72, y + 21, { c: cc, sz: 10.5 });
    });
    /* note */
    var ny = y0 + cands.length * rh + 24;
    T(ctx, 'gate POST: space==world · unit==runtime · direction enum · hypot(p2−p1)≥1e-6 · coords finite', 30, ny, { c: p.muted, sz: 10.5 });
    T(ctx, 'controller: direction default "positive" khi thiếu · unit=None bỏ check · non-world chỉ chặn ở runtime-mode', 30, ny + 18, { c: p.muted, sz: 10.5 });
    T(ctx, 'load-once-at-boot — đổi config cần restart', 30, ny + 36, { c: p.warning, sz: 10.5 });
  }
});

window.TechGarAlgo.registerPack(PACK_ID, LESSONS);
})();
