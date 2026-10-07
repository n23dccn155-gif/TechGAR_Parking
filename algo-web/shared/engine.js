/* TechGar2 algo-web — shared engine (namespace + registry)
 * Contract: SPEC.md §3-§5. File đầu tiên tải (classic defer).
 * Không fetch, không module, không build. Phải chạy được trên file:// và http://.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var PACK_IDS = ['frontend', 'cv', 'integration'];

  /* SPEC §2 — danh mục canonical 117 ID theo pack (chỉ là metadata catalog,
   * không phải nội dung thuật toán; nội dung nằm trong packs/*.js của từng owner) */
  var CATALOG = {
    frontend: [
      'lane-graph-build', 'adjacency-directed-expand', 'astar-find-route',
      'spot-route-wrappers', 'drivable-edge-project', 'pos-route-wrappers',
      'route-edge-validator', 'gate-node-mutate', 'spot-rank-score',
      'recommendation-promote', 'point-segment-dist', 'off-route-detect',
      'turn-instruction', 'voice-speak-throttle', 'session-commit-guard',
      'session-action-serialize', 'session-refresh-dedupe', 'action-id-gen',
      'completion-key-build', 'occupancy-classify', 'spot-event-reducer',
      'affine-fit-transform', 'world-svg-project', 'vehicle-svg-project',
      'route-polyline-simplify', 'route-arrow-place', 'viewbox-pan-zoom',
      'parking-geometry-gen', 'spot-ownership-map', 'parking-counts-derive',
      'driver-flow-machine', 'nav-goal-resolve', 'invalid-spot-recovery',
      'parked-marker-fallback', 'gate-line-derive', 'parking-decision-resolve',
      'mock-scenario-emitter'
    ],
    cv: [
      'mog2-foreground-mask', 'temporal-motion-gate', 'roi-strict-context-mask',
      'foreground-morphology', 'contour-geometry-filter', 'bottom-center-anchor',
      'cast-shadow-discriminator', 'dark-foreground-rescue',
      'motion-echo-suppression', 'occlusion-group-guard',
      'watershed-blob-partition', 'merged-blob-assignment-guard',
      'kalman-constant-velocity', 'prediction-age-decay',
      'association-distance-gate', 'iou-overlap-score',
      'association-cost-matrix', 'lapjv-assignment',
      'assignment-margin-ambiguity', 'stale-anchor-reacquire',
      'track-lifecycle', 'hsv-lab-descriptor', 'tracklet-gallery-match',
      'slot-roi-precompute', 'ensemble-threshold-voting', 'border-line-filter',
      'core-rescue-vote', 'temporal-smoothing-dwell', 'slot-overlap-geometry',
      'slot-track-batch-match', 'arrival-claim-qualification',
      'vision-primary-fusion', 'stop-dwell-detection', 'sticky-id-bind-release',
      'departure-token-lifecycle', 'predeparture-candidate-guard',
      'recovery-candidate-gates', 'recovery-batch-assignment',
      'parking-episode-state', 'world-projection-anchor',
      'handoff-entry-creation', 'handoff-prediction-corridor',
      'handoff-lapjv-matching', 'overlap-simultaneous-pairing',
      'global-id-allocation', 'dormant-identity-reid', 'world-trajectory-match',
      'merge-alias-resolution', 'global-identity-lifecycle',
      'homography-fit-distributed', 'rectangle-line-fit-gate',
      'calibration-load-validation', 'matching-distance-derivation',
      'frame-size-adaptation', 'camera-skew-synchronization',
      'latest-frame-mailbox', 'stale-evidence-health-gating'
    ],
    integration: [
      'snapshot-v2-build', 'camera-age-online-derivation',
      'live-freshness-contract', 'source-mode-live-gating',
      'frame-cursor-monotonic-poll', 'segment-intersection-orientation',
      'directed-crossing-direction', 'observation-continuity-window',
      'entry-session-creation', 'measured-path-entry-rescue',
      'exit-crossing-session-delete', 'session-state-machine',
      'qr-token-issuance-ttl', 'revision-optimistic-concurrency',
      'spot-reservation-availability', 'live-observation-cache',
      'atomic-session-store', 'parking-episode-apply',
      'parked-evidence-dwell-legacy', 'identity-alias-remap-backend',
      'canonical-runtime-id-consumer', 'replay-timestamp-pairing',
      'gate-config-validate-save'
    ]
  };

  /* SPEC §2 — 6 alias, tất cả trỏ về canonical do integration quản lý */
  var ALIASES = {
    'live-runtime-validator': 'live-freshness-contract',
    'frame-cursor-guard': 'frame-cursor-monotonic-poll',
    'runtime-request-coalesce': 'frame-cursor-monotonic-poll',
    'qr-visibility-window': 'qr-token-issuance-ttl',
    'canonical-gid-chain': 'canonical-runtime-id-consumer',
    'replay-session-sync': 'replay-timestamp-pairing'
  };

  /* Palette dùng chung — đồng bộ với styles.css (đọc lại từ CSS vars khi có thể) */
  var PALETTE = {
    background: '#12172a', text: '#e8ecf4', muted: '#8a93a8',
    accent: '#4f9cf7', success: '#3fce7c', danger: '#f2555a',
    warning: '#f0a93c', grid: '#2a3248'
  };

  var ns = {
    version: VERSION,
    palette: PALETTE,
    canonicalCatalog: CATALOG,
    aliases: ALIASES,
    packs: {},
    errors: [],

    /* registerPack(packId, lessons): SPEC §4 — packId ∈ {frontend,cv,integration};
     * lessons là array metadata + trace/draw functions. Lỗi được gom vào
     * TechGarAlgo.errors để app hiển thị (không throw — shell vẫn boot). */
    registerPack: function (packId, lessons) {
      var errors = ns.errors;
      function err(msg) { errors.push({ pack: packId, message: String(msg) }); }

      if (PACK_IDS.indexOf(packId) < 0) {
        err('registerPack: packId không hợp lệ "' + packId + '"');
        return false;
      }
      if (ns.packs[packId]) {
        err('registerPack: pack "' + packId + '" đã đăng ký — từ chối ghi đè');
        return false;
      }
      if (!Array.isArray(lessons)) {
        err('registerPack: lessons phải là array');
        return false;
      }

      var canonicalSet = {};
      var p, i;
      for (p in CATALOG) for (i = 0; i < CATALOG[p].length; i++) {
        canonicalSet[CATALOG[p][i]] = p;
      }

      var seen = {};
      var seenOther = {};
      for (p in ns.packs) {
        var ls = ns.packs[p].lessons;
        for (i = 0; i < ls.length; i++) seenOther[ls[i].id] = p;
      }

      var ok = true;
      for (i = 0; i < lessons.length; i++) {
        var L = lessons[i];
        if (!L || typeof L !== 'object') { err('lesson #' + i + ' không phải object'); ok = false; continue; }
        if (!L.id || typeof L.id !== 'string') { err('lesson #' + i + ' thiếu id'); ok = false; continue; }
        if (seen[L.id]) { err('duplicate ID trong pack: "' + L.id + '"'); ok = false; }
        seen[L.id] = true;
        if (seenOther[L.id]) { err('ID "' + L.id + '" trùng pack "' + seenOther[L.id] + '"'); ok = false; }
        if (!canonicalSet[L.id]) err('ID "' + L.id + '" không thuộc danh mục canonical SPEC §2');
        else if (canonicalSet[L.id] !== packId) {
          err('ID "' + L.id + '" thuộc pack "' + canonicalSet[L.id] + '", không thuộc "' + packId + '"');
          ok = false;
        }
        if (ALIASES[L.id]) err('ID "' + L.id + '" là alias — không được là canonical lesson');
        if (!L.title) err('"' + L.id + '" thiếu title');
        if (typeof L.buildTrace !== 'function') { err('"' + L.id + '" thiếu buildTrace'); ok = false; }
        if (typeof L.draw !== 'function') { err('"' + L.id + '" thiếu draw'); ok = false; }
        if (!Array.isArray(L.scenarios) || L.scenarios.length < 1) {
          err('"' + L.id + '" thiếu scenarios'); ok = false;
        } else {
          var hasNormal = false, hasEdge = false, sid = {};
          for (var s = 0; s < L.scenarios.length; s++) {
            var sc = L.scenarios[s];
            if (!sc || !sc.id) { err('"' + L.id + '" scenario #' + s + ' thiếu id'); ok = false; continue; }
            if (sid[sc.id]) { err('"' + L.id + '" duplicate scenario id "' + sc.id + '"'); ok = false; }
            sid[sc.id] = true;
            if (sc.edgeCase === true) hasEdge = true; else hasNormal = true;
          }
          if (!hasNormal || !hasEdge) err('"' + L.id + '" cần ít nhất 1 normal + 1 edge scenario');
        }
      }

      /* Đăng ký ngay cả khi có warning — lỗi cứng (duplicate/sai pack) vẫn nạp
       * để QA nhìn thấy lỗi thay vì app trắng; errors[] vẫn ghi đủ. */
      ns.packs[packId] = { id: packId, lessons: lessons, registeredAt: Date.now() };
      return ok;
    },

    /* Tra lesson theo id canonical; trả null nếu pack chưa nộp */
    byId: function (id) {
      for (var p in ns.packs) {
        var ls = ns.packs[p].lessons;
        for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return ls[i];
      }
      return null;
    },

    /* Pack nào sở hữu canonical id (theo catalog); null nếu id lạ */
    ownerOf: function (id) {
      for (var p in CATALOG) if (CATALOG[p].indexOf(id) >= 0) return p;
      return null;
    },

    /* Alias → canonical (null nếu không phải alias) */
    resolveAlias: function (id) { return ALIASES[id] || null; },

    /* Toàn bộ lesson đã register (flat) */
    allLessons: function () {
      var out = [];
      for (var p in ns.packs) out = out.concat(ns.packs[p].lessons);
      return out;
    },

    /* Trạng thái nộp pack cho catalog/QA */
    packStatus: function () {
      var st = {};
      for (var i = 0; i < PACK_IDS.length; i++) {
        var p = PACK_IDS[i];
        st[p] = {
          registered: !!ns.packs[p],
          count: ns.packs[p] ? ns.packs[p].lessons.length : 0,
          expected: CATALOG[p].length
        };
      }
      return st;
    },

    /* Palette cho draw env — đọc CSS var khi chạy trong browser thật */
    getPalette: function () {
      var p = {};
      for (var k in PALETTE) p[k] = PALETTE[k];
      try {
        if (typeof getComputedStyle === 'function' && document.documentElement) {
          var cs = getComputedStyle(document.documentElement);
          var map = {
            background: '--c-canvas', text: '--c-text', muted: '--c-muted',
            accent: '--c-accent', success: '--c-success', danger: '--c-danger',
            warning: '--c-warning', grid: '--c-grid'
          };
          for (k in map) {
            var v = cs.getPropertyValue(map[k]);
            if (v) p[k] = v.trim();
          }
        }
      } catch (e) { /* file:// headless — giữ fallback */ }
      return p;
    }
  };

  window.TechGarAlgo = ns;
})();
