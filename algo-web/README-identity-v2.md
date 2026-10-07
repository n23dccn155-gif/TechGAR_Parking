# Identity Pack (V2) — Builder B

Pack `packs/pipeline-identity.js` — 3 node thuộc cụm **identity** của pipeline map V2
(SPEC.md §5 contract `window.TechGarPipelinePacks.identity`).

| Node | Scenario | Nội dung |
|---|---|---|
| `handoff` | `handoff-qua-vung-chuyen` (8 frame) | cam1 → overlap → handoff entry (TTL 45f) → cam2 tentative → cost 4-thành-phần → lapjv + margin 0.08 + streak → bind G#5. Có shared-world map (homography), corridor dự đoán, gallery histogram. |
| | `reid-dormant-cuu` (6 frame) | Nhánh khó: rớt frame biên → TTL hết → fragment ID-less chờ → dormant ReID (gallery distance 0.24 < 0.60, reachable radius) → bind. |
| `slot-vision` | `xe-dung-trong-o` (7 frame) | ROI slot + analysis/core mask → 25 biến thể CLAHE×gamma → **phiếu TRỐNG** `empty_votes 4 < 12` → occupied → smoother → evidence+monotonic. |
| | `xe-toi-rescue-lat` (4 frame) | Xe tối màu: `empty_votes 21 ≥ 12` tạm free → **core-rescue lật** → occupied. |
| `binder` | `dung-do-token` (8 frame) | lapjv track→ô → xe dừng/track LOST → arrival claim + vision streak 2/2 → gates → episode `A05:G5:F812` parked → departing → **departure token 5s** → recovery `bind_external_id`. |
| | `strong-overlap` (5 frame) | Đường thứ hai: track còn sống, overlap ≥0.60 + dwell 1.15s + stable → bind trực tiếp, không qua claim. |

## Đúng source (đã verify)

- `required_votes = 25//2 = 12`; `empty_votes >= 12` → `is_free` — phiếu chỉ đếm **TRỐNG**
  (`parking_detector.py:533-548`). `occupied` là phần bù + rescue/edge lật — **không có counter `occupied_votes`**.
- ReID = gallery histogram HSV/LAB/L (`tracklet_descriptor.py`), `use_deep_reid` ép `False`
  (`cross_camera_manager.py:391-397`). LAPJV thật (`lap.lapjv`) limit 0.92 (handoff, ccm:3615), 0.95 (dormant).
- Khoảng cách match trên **shared-map** = bội số chiều-dài-ô (`resolve_matching_distance`), không phải px — con số trong scene ghi "minh họa".
- Recovery chạy **trước** `update_all_tracks` (`two_camera.py:2764→2779`); token chỉ mở lại GID khi đúng cam+đúng ô (`bind_external_id`, ccm:690-727).
- Production `policy="vision_primary"` (`two_camera.py:2328`).

## Giới hạn mô phỏng

- Tọa độ/xe/slot là minh họa; số đo cost, streak, dwell là ví dụ tính tay khớp công thức source.
- World map chỉ vẽ 1 trail tuyến tính; không mô phỏng homography thật (chỉ giải thích).
- Variant grid hiển thị 25 ratio minh họa, không chạy CLAHE/gamma thật trên ảnh.
- `occupied_seconds`, `ratio_thr`, `edge_thr`, `median_slot_length` của session cụ thể không có trong pack.

## Verify (owner)

```bash
node .analysis/algos-v2/_verify_identity_b.mjs
```

→ **PASS 513 / 513** (6 scenario, 38 frame; contract + determinism + excerpt-khớp-file-gốc + draw no-throw + invariant fidelity). Hash pack: `sha256:8117e9984048deb5`.

## Mở

Pack được C nạp qua `index.html` (shared/pipeline-engine.js). Mở trực tiếp `algo-web/index.html`
hoặc `python -m http.server 8080 --directory D:\TechGar2` → `http://localhost:8080/algo-web/index.html`.
Không đổi file C/SPEC/A; không đổi production source.
