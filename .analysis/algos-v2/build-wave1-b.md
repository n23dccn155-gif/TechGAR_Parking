# build-wave1-b.md — Báo cáo W1 (builder B)

## Status: IN_PROGRESS — 9/9 content datasets xong, CHỜ CONTRACT.md (C) để sang js/content/

## Phạm vi
- 9 IDs theo phân công mới: `reid`, `handoff`, `homography`, `trajectory`, `dormant`, `gid-conflict` (6 thẻ B) + `gate`, `session`, `snapshot` (3 thẻ T3 chuyển từ C — dùng dossier C đã peer-PASS).
- Chưa mount/chưa viết `js/pages/` — SPEC §W1; `algo-web-v2/CONTRACT.md` **chưa tồn tại** (kiểm-tra lúc bắt-đầu W1).
- Dataset ghi tại `.analysis/algos-v2/content-b/<id>.json` — đúng field names SPEC §4 (`id/title/tier/nodes/problem/does/role/where/why/steps/sourceRefs/realParams/storyboard/qa/certainty`), JSON-serializable, sẵn-sàng wrap vào registry khi contract ra.

## Đã giao (9 files)
| File | Tier | Nguồn | Ghi-chú |
|---|---|---|---|
| `content-b/reid.json` | T1 | builder-b thẻ 1 | histogram 416-D, gallery 12→24, `use_deep_reid` bị cấm (ccm:388-397) — KHÔNG claim deep |
| `content-b/handoff.json` | T1 | builder-b thẻ 2 | gates→cost 0.55/0.30/0.10/0.05≤0.92→LAPJV+margin 0.08+streak 1-3; xe B app 0.83 **reject trước cost** (ccm:2990); OFF/ON cùng cảnh 6 khung |
| `content-b/homography.json` | T2 | builder-b thẻ 3 | calibrate 8-cặp→load gates tc:284-341→_world; anchor class `bottom_center` vs runtime `bbox_center`; resolved 15/25/16.218/4.634 |
| `content-b/trajectory.json` | T2 | builder-b thẻ 4 | observe fresh-only (ccm:1442-1510); match 0.6/0.4; match_departure 4 rejects; score ≥0.78 |
| `content-b/dormant.json` | T2 | builder-b thẻ 5 | dormant 60s/×4/×2 + token 5s expand 0.05→**0.85 runtime**; phân-biệt wakeup-polygon (1.10–2.70) vs signed-gate (−0.85·diag) |
| `content-b/gid-conflict.json` | T3 | builder-b thẻ 6 | bounds **9.268/13.902** (dup 4.634), ví-dụ mơ-hồ **11cm** evidence 2f; OFF/ON 5 khung; canonical=min |
| `content-b/gate.json` | T3 | **dossier C T3-1** | direction cross-sign + 1e-9 guard; continuity ≤1.0s wall+source; recovered-path ≤1.0s cùng cam/local; crossing-vật-lý ≠ GID-publish |
| `content-b/session.json` | T3 | **dossier C T3-2** | FSM 6 states; **QR120s = visibility-only** (claim quirk :355-368); delete=xoá hẳn; 'CLOSED' chỉ read-filter |
| `content-b/snapshot.json` | T3 | **dossier C T3-3** | mailbox latest-only; publish 5fps; gate 0.25s; frontend 200/500/500/1000ms; stale>5s; frame_index=minh-hoạ |

## Số liệu đã chốt (dùng xuyên-suốt)
- median_slot_length = **9.267515182495117 cm** (60 ô, `minAreaRect` long-edge, config sha256:`ec759c558c3ccfeb`) → resolved **15.0 / 25.0 / 16.218 / 4.634 cm** — KHÔNG dùng 9.202 cũ.
- `recovery_max_expand_ratio` runtime **0.85** (tc:1890-1897→2331); class-fallback 0.45 (svb:228) ghi rõ scope.
- Appearance: hard 0.45 / relaxed 0.82 → **0.83 reject 'appearance' trước cost** (ccm:2990).
- Conflict: vùng mơ-hồ **9.268–13.902cm**, ví-dụ 11cm, evidence 2f.
- Mọi `~line` đã thay bằng dòng chính-xác; helper chưa-verify ghi `[chưa xác minh]`, không khẳng-định.

## Theo yêu-cầu LEAD
- OFF/ON cùng scene+seed trên T1 (reid 4f, handoff 6f) và T3 (conflict 5f, gate 4f, session 5f, snapshot 5f).
- Quirk giữ nguyên: QR-120s visibility ≠ TTL; session-delete=xoá; async-poll lệch-pha là thiết-kế; gate crossing-vật-lý vs GID-publish; session chỉ tạo khi snapshot-GID + crossing hợp-lệ.
- Không chép dossier 33KB — mỗi file ~120-160 dòng JSON, text Việt ngắn, visual-first (mô-tả `visual` + `frames` deterministic).
- Không đụng shared/core/manifest/index/CSS, backend/frontend/docs, `algo-web` cũ.

## Chờ / tiếp-theo
1. **CONTRACT.md từ C** → wrap 9 JSON vào `js/content/<id>.js` theo registry contract (adapter 1 dòng/file).
2. LEAD giao W2 → `js/pages/<id>.js` (T1→T2→T3) + per-page proof.
3. Helper mở (ghi trung-thực trong datasets): `parking_recovery_trajectory_evidence` signature-only, `_reconcile_dormant_duplicates` body.

## Blockers
- Không có. Chờ contract là đúng kế-hoạch (không phải block tự-phát).
