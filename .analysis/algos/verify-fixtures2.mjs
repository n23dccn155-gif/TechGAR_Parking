// verify-fixtures2.mjs — phần 2: session-sync, voice, QR, resolver, reducer, gate, flow.
// Chạy: node verify-fixtures2.mjs  (cwd: D:\TechGar2\.analysis\algos)

const out = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  out.push(`${a === e ? "PASS" : "FAIL"} ${name} | got=${a} | want=${e}`);
};
const info = (name, v) => out.push(`INFO ${name} | ${JSON.stringify(v)}`);

// ============ 1. arrows @500 (target < total-45) ============
function createRouteArrows(points) {
  const out = []; let traversed = 0; let target = 100;
  const segs = []; let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push({ a: points[i], b: points[i + 1], len }); totalLength += len;
  }
  if (totalLength < 140) return out;
  for (const seg of segs) {
    while (target <= traversed + seg.len && target < totalLength - 45) {
      const ratio = seg.len === 0 ? 0 : (target - traversed) / seg.len;
      out.push({ x: seg.a.x + (seg.b.x - seg.a.x) * ratio, y: seg.a.y + (seg.b.y - seg.a.y) * ratio });
      target += 190;
    }
    traversed += seg.len;
    if (target >= totalLength - 45) break;
  }
  return out;
}
const ar500 = createRouteArrows([{ x: 0, y: 0 }, { x: 500, y: 0 }]);
info("arrows@500 xs", ar500.map((a) => a.x));
check("arrows@500 count", ar500.length, 2);

// ============ 2. QR visibility window ============
const QR_DISPLAY_MS = 120_000;
const qrExpiryTime = (s) => { const e = Date.parse(s.qrExpiresAt); return Number.isFinite(e) ? e : Date.parse(s.createdAt) + QR_DISPLAY_MS; };
const isQrVisible = (s, now) => qrExpiryTime(s) > now;
const T0 = Date.parse("2026-10-04T10:00:00Z");
const waiting = [
  { sessionId: "S1", createdAt: "2026-10-04T09:57:00Z", qrExpiresAt: "2026-10-04T09:59:00Z" },            // expired
  { sessionId: "S2", createdAt: "2026-10-04T09:58:40Z", qrExpiresAt: "2026-10-04T10:00:40.000Z" },       // +40s
  { sessionId: "S3", createdAt: "2026-10-04T09:59:30Z", qrExpiresAt: "2026-10-04T10:01:30.000Z" },       // +90s
];
const pick = (now) => waiting.filter((s) => isQrVisible(s, now)).at(-1)?.sessionId ?? null;
check("qr t=0 picks last visible S3", pick(T0), "S3");
check("qr t=+45s still S3 (S2 expired)", pick(T0 + 45_000), "S3");
check("qr t=+95s -> null", pick(T0 + 95_000), null);
// fallback expiry via createdAt + 120s
const noExp = { sessionId: "S4", createdAt: "2026-10-04T09:58:00Z", qrExpiresAt: "not-a-date" };
check("qr fallback expiry = createdAt+120s", qrExpiryTime(noExp), Date.parse("2026-10-04T10:00:00Z"));
check("qr fallback visible at +119s", isQrVisible(noExp, Date.parse("2026-10-04T09:59:59Z")), true);
check("qr fallback expired at +121s", isQrVisible(noExp, Date.parse("2026-10-04T10:00:01Z")), false);

// ============ 3. VoiceManager.speak timeline (stub TTS) ============
function makeVoiceStub() {
  const st = { lastSpokenText: "", lastSpokenTime: 0, isMuted: false, isSpeaking: false, log: [] };
  return {
    st,
    speak(text, cooldownMs = 6000, isUrgent = false, now = 0, speechMs = 1500) {
      if (st.isMuted) { st.log.push([now, text, "SKIP:muted"]); return; }
      if (text === st.lastSpokenText && now - st.lastSpokenTime < cooldownMs) { st.log.push([now, text, "SKIP:cooldown"]); return; }
      if (st.isSpeaking && text === st.lastSpokenText) { st.log.push([now, text, "SKIP:same-speaking"]); return; }
      if (st.isSpeaking && !isUrgent && now - st.lastSpokenTime < 2000) { st.log.push([now, text, "SKIP:<2s"]); return; }
      st.lastSpokenText = text; st.lastSpokenTime = now; st.isSpeaking = true;
      st.log.push([now, text, isUrgent ? "SPEAK:urgent" : "SPEAK"]);
      // deterministic onend after speechMs
      st.endAt = now + speechMs;
    },
    tick(now) { if (st.isSpeaking && now >= st.endAt) st.isSpeaking = false; },
  };
}
const V = makeVoiceStub();
const Vev = [
  [0, "đi thẳng", false],
  [1.0, "đi thẳng", false],
  [1.2, "rẽ trái", false],
  [3.0, "rẽ trái", false],
  [3.5, "đi sai tuyến", true],
  [4.0, "đi sai tuyến", false],
  [10.0, "đi sai tuyến", false],
];
// speech ends 1.5s after each SPEAK; process in order with tick
for (const [t, text, urg] of Vev) { V.tick(t * 1000); V.speak(text, 6000, urg, t * 1000, 1500); }
const speaks = V.st.log.filter((l) => l[2].startsWith("SPEAK"));
info("voice log", V.st.log);
check("voice SPEAK count", speaks.length, 4);
check("voice decisions", V.st.log.map((l) => l[2]),
  ["SPEAK", "SKIP:cooldown", "SKIP:<2s", "SPEAK", "SPEAK:urgent", "SKIP:cooldown", "SPEAK"]);

// ============ 4. commit guard simulation ============
function makeCommitEnv() {
  const env = { lifecycle: 0, activeSessionId: "tok-abc", deleted: false, action: null, current: null, synced: 0 };
  const FIELDS = ["state", "targetSpotId", "parkedSpotId", "globalVehicleId", "actualParkedSpotId", "parkingEpisodeId", "updatedAt"];
  env.commit = (next, source, expectedId, lifecycle) => {
    if (lifecycle !== env.lifecycle || env.activeSessionId !== expectedId || next.sessionId !== expectedId)
      return { accepted: false, reason: "session_mismatch" };
    if (env.deleted) return { accepted: false, reason: "deleted" };
    if (source === "GET" && env.action !== null) return { accepted: false, reason: "stale_revision" };
    const current = env.current;
    if (next.runtimeId && current?.runtimeId && next.runtimeId !== current.runtimeId)
      return { accepted: false, reason: "session_mismatch" };
    if (current && next.revision < current.revision) return { accepted: false, reason: "stale_revision" };
    if (current && next.revision === current.revision) {
      const identical = FIELDS.every((f) => next[f] === current[f]);
      if (!identical) return { accepted: false, reason: "stale_revision(conflict)" };
      env.synced++; return { accepted: true, mode: "idempotent" };
    }
    env.current = next; env.synced++; return { accepted: true, mode: "set" };
  };
  return env;
}
const E = makeCommitEnv();
const base = { sessionId: "tok-abc", state: "NAVIGATING_TO_SPOT", targetSpotId: "C05", parkedSpotId: null, globalVehicleId: 7, actualParkedSpotId: null, parkingEpisodeId: null, updatedAt: "t1", revision: 4, runtimeId: "rt-1" };
const seq = [];
seq.push(E.commit({ ...base }, "GET", "tok-abc", 0));                                    // accept set
seq.push(E.commit({ ...base }, "GET", "tok-abc", 0));                                    // accept idempotent
seq.push(E.commit({ ...base, revision: 3 }, "GET", "tok-abc", 0));                       // reject stale
E.action = "select";
seq.push(E.commit({ ...base, revision: 5, updatedAt: "t2" }, "GET", "tok-abc", 0));      // reject: GET during action
seq.push(E.commit({ ...base, revision: 5, updatedAt: "t2" }, "POST:select", "tok-abc", 0)); // accept
E.action = null;
seq.push(E.commit({ ...base, revision: 5, updatedAt: "t3", parkedSpotId: "D03" }, "GET", "tok-abc", 0)); // same rev diff content -> conflict
seq.push(E.commit({ ...base, sessionId: "tok-xyz", revision: 9 }, "GET", "tok-abc", 0));  // mismatch
check("commit sequence", seq.map((s) => s.accepted ? (s.mode ?? "ok") : s.reason),
  ["set", "idempotent", "stale_revision", "stale_revision", "set", "stale_revision(conflict)", "session_mismatch"]);

// ============ 5. runAction lock: concurrent call -> null ============
{
  const env = { action: null, deleted: false, expectedId: "tok-abc", calls: 0 };
  const runAction = async (act, call) => {
    if (!env.expectedId || env.deleted || env.action) return null;
    env.action = act; env.calls++;
    try { return await call(); } finally { env.action = null; }
  };
  let second;
  const p1 = runAction("select", async () => { second = await runAction("select", async () => "inner"); return "first"; });
  const r1 = await p1;
  check("runAction second locked -> null", [r1, second, env.calls], ["first", null, 1]);
}

// ============ 6. refresh dedupe + runtime coalesce fetch counts ============
{
  let fetches = 0, pending = null;
  const getSession = () => { fetches++; return new Promise((r) => setTimeout(() => r({ revision: 1 }), 50)); };
  const refresh = () => { if (!pending) pending = getSession().finally(() => { pending = null; }); return pending; };
  await Promise.all([refresh(), refresh(), refresh()]);
  check("refresh dedupe 3 calls -> 1 fetch", fetches, 1);
}
{
  let fetches = 0, pending = null, retryAfter = 0, lastErr = null;
  const getSnap = async (now) => {
    if (now < retryAfter) throw lastErr;
    if (pending) return pending;
    pending = (async () => { fetches++; throw new Error("net"); })()
      .catch((e) => { lastErr = e; retryAfter = Date.now() + 2000; throw e; })
      .finally(() => { pending = null; });
    return pending;
  };
  const tryNow = async () => { try { await getSnap(Date.now()); return "ok"; } catch { return "err"; } };
  const r = [await tryNow(), await tryNow(), await tryNow()];
  check("coalesce: 3 errs, fetches <= 2 (retryAfter)", [r, fetches], [["err", "err", "err"], fetches <= 2 ? fetches : 99]);
  info("coalesce fetch count", fetches);
}

// ============ 7. spot-event reducer ============
{
  const LEFT = new Set(["F", "E", "D"]);
  const getSpotOwner = (id) => (LEFT.has(id[0]) ? "cam-left" : "cam-right");
  const cameraOwnsSpot = (cam, spot) => getSpotOwner(spot) === cam;
  const state = { spots: { A05: { id: "A05", status: "empty", confidence: 1, revision: 3, owner: "cam-right" } }, rejected: 0, stale: 0 };
  const applyEvent = (ev) => {
    const cur = state.spots[ev.spotId];
    if (!cur) { state.rejected++; return "unknown-spot"; }
    if (!cameraOwnsSpot(ev.cameraId, ev.spotId) || cur.owner !== ev.cameraId) { state.rejected++; return "unauthorized"; }
    if (ev.revision <= cur.revision) { state.stale++; return "stale"; }
    state.spots[ev.spotId] = { ...cur, status: ev.status, revision: ev.revision };
    return "applied";
  };
  const res = [
    applyEvent({ spotId: "A05", cameraId: "cam-left", revision: 4, status: "occupied" }),
    applyEvent({ spotId: "A05", cameraId: "cam-right", revision: 3, status: "occupied" }),
    applyEvent({ spotId: "A05", cameraId: "cam-right", revision: 4, status: "occupied" }),
    applyEvent({ spotId: "ZZ9", cameraId: "cam-right", revision: 1, status: "empty" }),
  ];
  check("reducer results", res, ["unauthorized", "stale", "applied", "unknown-spot"]);
  check("reducer counters", [state.rejected, state.stale], [2, 1]);
}

// ============ 8. liveRuntimeError ============
{
  const liveRuntimeError = (runtime, nowMs) => {
    if (runtime.schema_version !== 2) return "schema";
    if (runtime.source_mode !== "live") return "source";
    const p = Date.parse(runtime.published_at);
    if (!Number.isFinite(p) || nowMs - p < -1000 || nowMs - p > 5000) return "stale-pub";
    const cams = Object.values(runtime.cameras);
    if (cams.length === 0) return "no-cam";
    if (cams.some((c) => { const a = Number(c.age_ms); return !c.online || !Number.isFinite(a) || a < 0 || a > 5000; })) return "cam-stale";
    return null;
  };
  const now = 1_000_000;
  const okSnap = { schema_version: 2, source_mode: "live", published_at: new Date(now - 1000).toISOString(), cameras: { cam1: { online: true, age_ms: 500 } } };
  const cases = [
    liveRuntimeError({ ...okSnap, schema_version: 1 }, now),
    liveRuntimeError({ ...okSnap, source_mode: "replay" }, now),
    liveRuntimeError({ ...okSnap, published_at: new Date(now - 6000).toISOString() }, now),
    liveRuntimeError({ ...okSnap, published_at: new Date(now + 2000).toISOString() }, now),
    liveRuntimeError({ ...okSnap, cameras: { cam1: { online: true, age_ms: 6000 } } }, now),
    liveRuntimeError({ ...okSnap, cameras: {} }, now),
    liveRuntimeError(okSnap, now),
    liveRuntimeError({ ...okSnap, cameras: { cam1: { online: true, age_ms: 500 } } }, now), // only 1 cam present passes
  ];
  check("liveRuntimeError cases", cases, ["schema", "source", "stale-pub", "stale-pub", "cam-stale", "no-cam", null, null]);
}

// ============ 9. resolveSessionParking ============
function buildSessionCompletionKey(s) {
  if (s.state !== "PARKED" || !s.parkedSpotId || !s.parkedAt) return null;
  if (s.parkingEpisodeId) return `${s.sessionId}:${s.parkingEpisodeId}`;
  return `${s.sessionId}:${s.parkedSpotId}:${s.parkedAt}`;
}
function resolveSessionParking(input) {
  const { session, vehicles, slots, dwellThresholdMs } = input;
  const ownGid = session.globalVehicleId, targetSpotId = session.targetSpotId, parkedSpotId = session.parkedSpotId;
  if (session.state === "EXIT_NAVIGATION") return { kind: "exit_navigation", originSpotId: parkedSpotId };
  if (session.state === "PARKED" && parkedSpotId) {
    const completionKey = buildSessionCompletionKey(session);
    if (completionKey && session.parkedAt) return { kind: "parked", actualSpotId: parkedSpotId, completionKey };
  }
  const confirmed = (s) => s.tracking_state === "parked" && s.stopped_for_ms >= dwellThresholdMs;
  const ownSpots = input.episodes
    ? [...new Set(input.episodes.filter((e) => e.global_id === ownGid && e.state === "parked"
        && !(session.state === "RELOCATING" && e.parking_episode_id === session.parkingEpisodeId)).map((e) => e.slot_id))]
    : [...new Set([
        ...vehicles.filter((v) => v.global_id === ownGid && v.parked_slot_id).map((v) => v.parked_slot_id),
        ...slots.filter((s) => s.vehicle_id === ownGid && confirmed(s)).map((s) => s.slot_id),
      ])].sort();
  if (ownSpots.length > 1) return { kind: "identity_invariant_error", reason: "same_global_id_in_multiple_slots", spotIds: ownSpots };
  if (ownSpots.length === 1) return { kind: "parking_confirmation_pending", actualSpotId: ownSpots[0] };
  const ownPending = input.pendingConfirmations
    ?.filter((c) => c.global_id === ownGid && c.state !== "collecting")
    .sort((l, r) => r.max_overlap - l.max_overlap)[0];
  if (ownPending) {
    const degraded = Object.values(input.parkingPipeline ?? {}).some((s) => s?.state === "degraded");
    if (degraded || ownPending.age_ms >= 5000 || ownPending.state === "insufficient_evidence")
      return { kind: "parking_processing_delayed", actualSpotId: ownPending.slot_id };
    return { kind: "parking_confirmation_pending", actualSpotId: ownPending.slot_id };
  }
  if (!targetSpotId) return { kind: "no_target", state: session.state };
  const targetSlot = slots.find((s) => s.slot_id === targetSpotId);
  if (!targetSlot) return { kind: "runtime_unavailable", targetSpotId, reason: "target_slot_not_in_runtime" };
  if (targetSlot.status === "empty") return { kind: "guiding", targetSpotId };
  if (targetSlot.vehicle_id == null) return { kind: "identity_pending", spotId: targetSpotId, reason: "no_vehicle_id" };
  if (targetSlot.vehicle_id === ownGid) return { kind: "parking_confirmation_pending", actualSpotId: targetSpotId };
  const otherEpisode = input.episodes?.some((e) => e.state === "parked" && e.slot_id === targetSpotId && e.global_id === targetSlot.vehicle_id);
  if (input.episodes ? otherEpisode : confirmed(targetSlot))
    return { kind: "target_occupied_by_other", spotId: targetSpotId, otherVehicleId: targetSlot.vehicle_id };
  return { kind: "identity_pending", spotId: targetSpotId, reason: "other_unconfirmed" };
}
{
  const S1 = { sessionId: "tok-abc", state: "NAVIGATING_TO_SPOT", globalVehicleId: 7, runtimeId: "rt-1", targetSpotId: "C05", parkedSpotId: null, parkingEpisodeId: null, parkedAt: null };
  const slots0 = [{ slot_id: "C05", status: "empty", vehicle_id: null, tracking_state: "moving", stopped_for_ms: 0 }];
  const veh0 = [{ global_id: 7, state: "active", observed: true, parked_slot_id: null }];
  const dwell = 2000;
  const cases = {
    a_guiding: resolveSessionParking({ session: S1, vehicles: veh0, slots: slots0, dwellThresholdMs: dwell }).kind,
    b_occupied: resolveSessionParking({ session: S1, vehicles: veh0, slots: [{ slot_id: "C05", status: "occupied", vehicle_id: 9, tracking_state: "parked", stopped_for_ms: 3000 }], dwellThresholdMs: dwell }).kind,
    c_ownPending: resolveSessionParking({ session: S1, vehicles: veh0, slots: slots0, dwellThresholdMs: dwell, pendingConfirmations: [{ global_id: 7, slot_id: "C05", state: "matching", age_ms: 1200, max_overlap: 0.8 }] }).kind,
    d_delayed: resolveSessionParking({ session: S1, vehicles: veh0, slots: slots0, dwellThresholdMs: dwell, pendingConfirmations: [{ global_id: 7, slot_id: "C05", state: "matching", age_ms: 6000, max_overlap: 0.8 }] }).kind,
    e_ownVehicle: resolveSessionParking({ session: S1, vehicles: [{ global_id: 7, parked_slot_id: "D03" }], slots: slots0, dwellThresholdMs: dwell }),
    f_parked: resolveSessionParking({ session: { ...S1, state: "PARKED", parkedSpotId: "D03", parkedAt: "2026-10-04T10:05:00Z", parkingEpisodeId: "ep-9" }, vehicles: veh0, slots: slots0, dwellThresholdMs: dwell }),
    g_invariant: resolveSessionParking({ session: S1, vehicles: [{ global_id: 7, parked_slot_id: "D03" }, { global_id: 7, parked_slot_id: "D04" }], slots: slots0, dwellThresholdMs: dwell }).kind,
    h_noTarget: resolveSessionParking({ session: { ...S1, targetSpotId: null }, vehicles: veh0, slots: slots0, dwellThresholdMs: dwell }).kind,
    i_noVehicleId: resolveSessionParking({ session: S1, vehicles: veh0, slots: [{ slot_id: "C05", status: "occupied", vehicle_id: null, tracking_state: "parked", stopped_for_ms: 3000 }], dwellThresholdMs: dwell }),
    j_otherUnconf: resolveSessionParking({ session: S1, vehicles: veh0, slots: [{ slot_id: "C05", status: "occupied", vehicle_id: 9, tracking_state: "parked", stopped_for_ms: 500 }], dwellThresholdMs: dwell }),
    k_missingSlot: resolveSessionParking({ session: { ...S1, targetSpotId: "ZZ9" }, vehicles: veh0, slots: slots0, dwellThresholdMs: dwell }).kind,
  };
  info("resolver cases", cases);
  check("resolver kinds", Object.values(cases).map((c) => (typeof c === "string" ? c : c.kind)),
    ["guiding", "target_occupied_by_other", "parking_confirmation_pending", "parking_processing_delayed",
     "parking_confirmation_pending", "parked", "identity_invariant_error", "no_target", "identity_pending", "identity_pending", "runtime_unavailable"]);
  check("resolver f completionKey", cases.f_parked.completionKey, "tok-abc:ep-9");
  check("resolver i reason", cases.i_noVehicleId.reason, "no_vehicle_id");
  check("resolver j reason", cases.j_otherUnconf.reason, "other_unconfirmed");
}

// ============ 10. occupancy classify + completion key + parked marker ============
{
  const classify = (spot, gid, parkedSpotId) => {
    if (spot.status === "empty") return "empty";
    if (parkedSpotId === spot.id) return "own";
    if (spot.vehicleId == null || gid == null) return "unknown";
    return spot.vehicleId === gid ? "own" : "other";
  };
  const spot = { id: "C05", status: "occupied", vehicleId: 7 };
  check("classify table", [
    classify({ ...spot }, 7, null), classify({ ...spot }, 9, null),
    classify({ ...spot, vehicleId: null }, 9, null), classify({ ...spot, status: "empty" }, 9, null),
    classify(spot, 99, "C05"),
  ], ["own", "other", "unknown", "empty", "own"]);
}
{
  const key = buildSessionCompletionKey;
  check("completion keys", [
    key({ sessionId: "t", state: "PARKED", parkedSpotId: "D03", parkedAt: "x", parkingEpisodeId: "ep-1" }),
    key({ sessionId: "t", state: "PARKED", parkedSpotId: "D03", parkedAt: "x", parkingEpisodeId: null }),
    key({ sessionId: "t", state: "PARKED", parkedSpotId: "D03", parkedAt: null, parkingEpisodeId: null }),
    key({ sessionId: "t", state: "SELECTING_SPOT", parkedSpotId: null, parkedAt: null }),
  ], ["t:ep-1", "t:D03:x", null, null]);
}
{
  // parked marker fallback: fabricate at spot center when PARKED & vehicle lost
  const geom = { C05: { cx: 5.6, cy: 4 } };
  const displayed = (activeVehicles, session, targetGid) => {
    const own = activeVehicles.find((v) => v.trackId === targetGid && v.observed);
    if (own) return activeVehicles;
    if (session.state !== "PARKED" || !session.parkedSpotId || targetGid == null) return activeVehicles;
    const g = geom[session.parkedSpotId];
    if (!g) return activeVehicles;
    return [{ trackId: targetGid, x: g.cx, y: g.cy, state: "parked", parkedSlotId: session.parkedSpotId }];
  };
  const ses = { state: "PARKED", parkedSpotId: "C05" };
  check("marker fallback empty active -> fabricated", displayed([], ses, 7), [{ trackId: 7, x: 5.6, y: 4, state: "parked", parkedSlotId: "C05" }]);
  check("marker observed -> unchanged", displayed([{ trackId: 7, observed: true, x: 1, y: 1 }], ses, 7), [{ trackId: 7, observed: true, x: 1, y: 1 }]);
}

// ============ 11. promoteRecommendation ============
{
  const promote = (result, spotId) => {
    const selected = [result.best, ...result.alternatives].find((s) => s.spotId === spotId);
    if (!selected || selected.spotId === result.best.spotId) return result;
    return { ...result, best: selected, alternatives: [result.best, ...result.alternatives.filter((s) => s.spotId !== spotId)].slice(0, 2) };
  };
  const R = { need: "services", best: { spotId: "A01" }, alternatives: [{ spotId: "B02" }, { spotId: "C05" }] };
  const p = promote(R, "B02");
  check("promote B02", [p.best.spotId, p.alternatives.map((a) => a.spotId)], ["B02", ["A01", "C05"]]);
  check("promote unknown -> same", promote(R, "ZZ9"), R);
  check("promote best -> same", promote(R, "A01"), R);
}

// ============ 12. gate acceptedPoint ============
{
  const acceptedPointForGate = (gate) => {
    const dx = gate.p2.x - gate.p1.x, dy = gate.p2.y - gate.p1.y;
    const length = Math.hypot(dx, dy);
    const side = gate.direction === "negative" ? 1 : -1;
    const distance = Math.max(length * 0.6, 2);
    return {
      x: (gate.p1.x + gate.p2.x) / 2 + side * (-dy / length) * distance,
      y: (gate.p1.y + gate.p2.y) / 2 + side * (dx / length) * distance,
    };
  };
  check("acceptedPoint negative", acceptedPointForGate({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, direction: "negative" }), { x: 5, y: 6 });
  check("acceptedPoint positive", acceptedPointForGate({ p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, direction: "positive" }), { x: 5, y: -6 });
}

// ============ 13. spotY order (geometry) ============
{
  const spotY = (n) => 112 + (10 - n) * 66;
  check("spotY(1)=706 bottom", spotY(1), 706);
  check("spotY(10)=112 top", spotY(10), 112);
  check("spotY decreasing", spotY(1) > spotY(5) && spotY(5) > spotY(10), true);
}

// ============ 14. frame cursor guard ============
{
  const mk = () => ({ cursor: null, runtimeId: null, progressAt: 0 });
  const guard = (env, runtime, now) => {
    const rid = runtime.runtime_id ?? "legacy-runtime";
    if (env.cursor !== null && env.runtimeId === rid && runtime.frame_index < env.cursor)
      return "frame cũ hơn";
    if (env.cursor === null || env.runtimeId !== rid || runtime.frame_index > env.cursor) {
      env.cursor = runtime.frame_index; env.runtimeId = rid; env.progressAt = now; return null;
    }
    if (now - env.progressAt > 5000) return "không có frame mới";
    return null;
  };
  const g = mk(); const errs = [];
  errs.push(guard(g, { runtime_id: "r1", frame_index: 100 }, 0));
  errs.push(guard(g, { runtime_id: "r1", frame_index: 101 }, 1000));
  errs.push(guard(g, { runtime_id: "r1", frame_index: 99 }, 2000));   // backwards -> err
  errs.push(guard(g, { runtime_id: "r1", frame_index: 101 }, 8000));  // same frame, >5s -> err
  errs.push(guard(g, { runtime_id: "r2", frame_index: 5 }, 9000));    // new runtime resets
  check("frame cursor", errs, [null, null, "frame cũ hơn", "không có frame mới", null]);
}

// ============ 15b. buildLaneGraph mini deterministic ============
{
  // port buildLaneGraph với SPOTS_PER_ZONE=2 (mini) — cùng logic nhánh
  const SPOTS_PER_ZONE_MINI = 2;
  const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const buildMiniGraph = (geometry) => {
    const nodes = [], edges = [], spotEntryNodeIds = {};
    const nodeById = new Map();
    const addNode = (n) => { if (!nodeById.has(n.id)) { nodes.push(n); nodeById.set(n.id, n); } };
    const addEdge = (from, to, direction = "one-way") => {
      const s = nodeById.get(from), e = nodeById.get(to);
      if (!s || !e) throw new Error(`missing node ${from}->${to}`);
      edges.push({ id: `${from}=>${to}`, from, to, distance: distanceBetween(s, e), direction });
    };
    const { layout } = geometry;
    addNode({ id: "entrance", kind: "entrance", ...geometry.entrance });
    addNode({ id: "exit", kind: "exit", ...geometry.exit });
    const connTopY = geometry.horizontalConnectors[0].centerline.start.y;
    const connBottomY = geometry.horizontalConnectors[1].centerline.start.y;
    const rowYValues = [];
    for (let n = 1; n <= SPOTS_PER_ZONE_MINI; n++) {
      const spot = geometry.spots.find((s) => s.number === n);
      if (spot) rowYValues.push(spot.y + spot.height / 2);
    }
    const allY = [...new Set([connTopY, ...rowYValues, connBottomY])].sort((a, b) => a - b);
    allY.forEach((y) => { addNode({ id: `center-${y}`, kind: "junction", x: layout.centerLaneCenterX, y }); });
    allY.forEach((y) => { addNode({ id: `left-${y}`, kind: "junction", x: layout.leftAisleCenterX, y }); });
    allY.forEach((y) => { addNode({ id: `right-${y}`, kind: "junction", x: layout.rightAisleCenterX, y }); });
    const sortedDescY = [...allY].sort((a, b) => b - a);
    addNode({ id: "entrance-corner", kind: "junction", x: layout.rightAisleCenterX, y: geometry.entrance.y });
    addNode({ id: "exit-corner", kind: "junction", x: layout.rightAisleCenterX, y: geometry.exit.y });
    const rightPath = ["entrance", "entrance-corner", ...sortedDescY.map((y) => `right-${y}`), "exit-corner", "exit"];
    for (let i = 0; i < rightPath.length - 1; i++) addEdge(rightPath[i], rightPath[i + 1]);
    const sortedAscY = [...allY].sort((a, b) => a - b);
    for (let i = 0; i < sortedAscY.length - 1; i++) {
      addEdge(`left-${sortedAscY[i]}`, `left-${sortedAscY[i + 1]}`, "two-way");
      addEdge(`center-${sortedAscY[i]}`, `center-${sortedAscY[i + 1]}`, "two-way");
    }
    [connTopY, connBottomY].forEach((y) => {
      addEdge(`center-${y}`, `left-${y}`, "two-way");
      addEdge(`center-${y}`, `right-${y}`, "two-way");
    });
    geometry.spots.forEach((spot) => {
      const entryId = `spot-${spot.id}`;
      spotEntryNodeIds[spot.id] = entryId;
      addNode({ id: entryId, kind: "spot-entry", ...spot.entryPoint });
      const spotCenterY = spot.y + spot.height / 2;
      let aisleJunctionId;
      if (spot.zone === "F" || spot.zone === "E") aisleJunctionId = `left-${spotCenterY}`;
      else if (spot.zone === "D" || spot.zone === "C") aisleJunctionId = `center-${spotCenterY}`;
      else aisleJunctionId = `right-${spotCenterY}`;
      if (nodeById.has(aisleJunctionId)) addEdge(aisleJunctionId, entryId);
    });
    Object.values(geometry.anchors).forEach((anchor) => {
      addNode({ id: `anchor-${anchor.id}`, kind: "access-anchor", x: anchor.x, y: anchor.y });
    });
    return { nodes, edges, allY, spotEntryNodeIds };
  };
  const geom = {
    layout: { centerLaneCenterX: 4, leftAisleCenterX: 1, rightAisleCenterX: 7 },
    entrance: { x: 8, y: 9.5 }, exit: { x: 8, y: 0.5 },
    horizontalConnectors: [{ centerline: { start: { y: 1 } } }, { centerline: { start: { y: 9 } } }],
    spots: [
      { id: "Z01", zone: "F", number: 1, y: 2, height: 2, entryPoint: { x: 2, y: 3 } },
      { id: "Z02", zone: "F", number: 2, y: 5, height: 2, entryPoint: { x: 2, y: 6 } },
      { id: "B01", zone: "B", number: 1, y: 2, height: 2, entryPoint: { x: 6, y: 3 } },
      { id: "B02", zone: "B", number: 2, y: 5, height: 2, entryPoint: { x: 6, y: 6 } },
    ],
    anchors: [{ id: "shopping", x: 1, y: 1 }],
  };
  const g = buildMiniGraph(geom);
  info("mini allY", g.allY);
  check("mini allY", g.allY, [1, 3, 6, 9]);
  check("mini V=21", g.nodes.length, 21);
  check("mini E=21", g.edges.length, 21);
  check("mini right chain one-way", g.edges.filter((e) => e.from.startsWith("right-") || e.to.startsWith("right-")).every((e) => e.direction === "one-way" || e.direction === "two-way" && e.from.startsWith("center")), true);
  check("mini spot edges", g.edges.filter((e) => e.to.startsWith("spot-")).map((e) => e.id), ["left-3=>spot-Z01", "left-6=>spot-Z02", "right-3=>spot-B01", "right-6=>spot-B02"]);
  check("mini spot sinks", g.edges.filter((e) => e.from.startsWith("spot-")).length, 0);
}

// ============ 15c. exclusion proof: spot-entry edge would win if not excluded ============
{
  // variant G1b: sC05 lệch khỏi đường làn (5,4.6); xe (5.2,4.6)
  const G1b = {
    nodes: [
      { id: "r4", kind: "junction", x: 7, y: 4 }, { id: "c4", kind: "junction", x: 5, y: 4 },
      { id: "sC05", kind: "spot-entry", x: 5, y: 4.6 },
    ],
    edges: [
      { id: "r4=>c4", from: "r4", to: "c4", distance: 2, direction: "two-way" },
      { id: "c4=>sC05", from: "c4", to: "sC05", distance: 0.6, direction: "one-way" },
    ],
  };
  const projAll = (g, vx, vy, exclude) => g.edges.flatMap((edge) => {
    const a = g.nodes.find((n) => n.id === edge.from), b = g.nodes.find((n) => n.id === edge.to);
    if (exclude && [a.kind, b.kind].some((k) => k === "access-anchor" || k === "spot-entry")) return [];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((vx - a.x) * dx + (vy - a.y) * dy) / l2));
    return [{ edge: edge.id, x: a.x + t * dx, y: a.y + t * dy, d: Math.hypot(vx - (a.x + t * dx), vy - (a.y + t * dy)) }];
  }).sort((p, q) => p.d - q.d)[0];
  const withExcl = projAll(G1b, 5.2, 4.6, true);
  const withoutExcl = projAll(G1b, 5.2, 4.6, false);
  info("exclusion demo", { withExcl, withoutExcl });
  check("exclude -> nearest drivable r4=>c4 d=0.6", [withExcl.edge, +withExcl.d.toFixed(2)], ["r4=>c4", 0.6]);
  check("no exclude -> spot-entry would win d=0.2", [withoutExcl.edge, +withoutExcl.d.toFixed(2)], ["c4=>sC05", 0.2]);
}

// ============ 15. sequential reroute commit (invalid-spot-recovery) ============
{
  const alternatives = [{ spotId: "B02" }, { spotId: "A09" }, { spotId: "C11" }];
  const select = async (spotId) => {
    if (spotId === "B02") throw { code: "SPOT_RESERVED" };
    if (spotId === "A09") return { revision: 6, targetSpotId: "A09" };
    return null;
  };
  const posts = []; let committed = null;
  for (const alt of alternatives) {
    try { const r = await select(alt.spotId); posts.push([alt.spotId, "ok"]); committed = r; break; }
    catch (e) { posts.push([alt.spotId, e.code]); if (!["SPOT_RESERVED", "SPOT_NOT_AVAILABLE"].includes(e.code)) break; }
  }
  check("reroute commits A09 after B02 reserved", [posts, committed?.targetSpotId], [[["B02", "SPOT_RESERVED"], ["A09", "ok"]], "A09"]);
}

console.log(out.join("\n"));
const fails = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`TOTAL: ${out.filter((l) => l.startsWith("PASS")).length} PASS, ${fails} FAIL, ${out.filter((l) => l.startsWith("INFO")).length} INFO`);
