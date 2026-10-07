# Peer review B (by A) — `packs/pipeline-identity.js`

Scope: source/contract review only. Đã đọc toàn pack (856 dòng), chạy verifier
B + check độc lập, đối chiếu mọi hằng số với source. Không sửa file B/C.

## Kết quả máy

- Verifier B (`_verify_identity_b.mjs`): **495 PASS / 0 FAIL** — 3 nodes,
  6 scenarios, 38 frames.
- Check độc lập A (`_peer_check_b.mjs`): **163 PASS / 0 FAIL** — excerpt
  byte-faithful tại excerptStart cho cả 17 refs; mọi frame draw qua ctx-stub
  ×progress {0,.5,1} → không throw/không mutate; mỗi scenario ≥1 frame nội suy
  thật theo view.progress (car lerp, TTL bar, vote reveal + pulse theo
  view.time); build deterministic; activeLines ⊆ pseudocode.

## Contract (SPEC §5) — PASS

`P.identity = [handoff, slot-vision, binder]`; mỗi node đủ
id/title/group/summary/answers(4 câu VN)/refs/pseudocode 8-9
dòng/scenarios≥2/draw. `where` dẫn symbol + path thật (`_upsert_handoff`,
`_match_dormant_identities`, `ParkingDetector.accept_evidence`,
`process_parking_frame`, `_try_commit_arrival_claim`, `_bind_vehicle`,
`bind_external_id`). `why` gắn `[suy luận]` đúng nơi suy luận (bất đối xứng
vote-occupied). Kịch bản edge có nghĩa: rớt frame biên → dormant ReID · xe tối
màu → rescue lật · xe lê bánh → strong-overlap (đường commit thứ hai thật).

## Fidelity nguồn — PASS (đối chiếu trực tiếp)

| Claim pack B | Source | ✓ |
|---|---|---|
| cost .55/.30/.10/.05, limit 0.92, margin 0.08 | ccm:3017,:3615,:3072 | ✓ |
| TTL handoff 45f · velocity≥0.20 · gallery 24 | ccm:147,:2649-2652,:162 | ✓ |
| streak 1/2(temporal|strong)/3(overlap) | ccm:3664-3670 | ✓ |
| dormant thr 0.60 = min(.75, .45+.15); retention 180f/60s, moving 12s | ccm:262-265,:158-182 | ✓ |
| 25=5×5 · required=25//2=12 · KHÔNG có occupied_votes | pd:454-456,:533; grep 0 hit | ✓ |
| occupied_seconds 0.5 · worker ~2fps | tc:1788,:1784 | ✓ |
| claim .55/.20/.15/.10 · streak≥2 · lost+0.35s · obs≥3 · overlap≥0.35 | svb:1161-1166,:243,:246,:242,:217 | ✓ |
| strong≥0.60 · dwell 1.15s(1.0+0.15) · ≥8 mẫu | svb:218,:215,:223,:1400,:222 | ✓ |
| token 5s · recover TRƯỚC update_all_tracks · bind_external_id raise | tc:1885,:2764<:2779; ccm:712-720 | ✓ |
| vision_primary · use_deep_reid=False (không deep-ReID) | tc:2328; ccm:391-398 | ✓ |

## Issue — 1 minor (sửa được trong phút)

**`stationary_drift_ratio` sai hằng** — pack:417 (state text "drift ≤ max(5px,
0.06·đường chéo ô)") và pack:733 (label "drift≤max(5px,0.06·diag)"). Source:
`stationary_drift_ratio = 0.10` (svb:220), dùng tại svb:1353/:1446. `0.06` là
`stationary_radius_ratio` (:219) — bán kính inlier, không phải drift.
**Sửa:** `0.06·` → `0.10·` ở cả hai chỗ (và có thể tách rõ: radius inlier 0.06,
drift 0.10). Không ảnh hưởng logic demo — chỉ là nhãn hằng số.

## Ghi chú nhỏ (không bắt sửa)

- "velocity ≥ 0.20 đơn-vị/frame" — source đo `velocity_world`; pack nói
  "đơn-vị" chung chung nhưng frame sau đó viết đúng "world/frame".
- Chưa QA pixel thật — draw verify bằng ctx-stub; browser QA chờ C.

## Verdict

**PASS** — pack sẵn sàng tích hợp; duy nhất 1 nhãn hằng số drift cần đổi
0.06→0.10 trước freeze. Không tự approve thay LEAD.
