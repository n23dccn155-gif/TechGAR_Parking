# Peer review — pack A `pipeline-local.js` (bởi builder B)

**Verdict: PASS — không blocker.** Đề xuất 2 ghi chú nhỏ, không bắt buộc sửa trước browser QA.

## Evidence đã chạy

- `node test-local-pack.mjs` từ `D:/TechGar2/.analysis/algos-v2` → **586 PASS / 0 FAIL** (khớp số root báo).
- Đối chiếu độc lập excerpt/tham số với `backend/main_detect/src/techgar/motion_tracker.py` + `two_camera.py` — tất cả spot-check khớp (danh sách dưới).
- Peer-check chéo cho pack B (`_peer_check_b.mjs` của A chạy trên pack B): **163/163 PASS**.

## Checklist theo yêu cầu

| Mục | Kết quả |
|---|---|
| 5 node `roi/motion/kalman/assignment/coasting` | ✓ đủ id, đúng thứ tự pipeline |
| 2 scenario/node (normal + edge) | ✓ 10 scenario |
| 4 câu hỏi thực tế (does/role/where/why) | ✓ đủ, trả lời thực dụng không catalog I/O |
| Thứ tự thật: predict → detect → assign → correct | ✓ `process_frame` = `_predict_tracks` :2228 → `_detect` :2233 → `_assign` :2249 → `_apply_detection`→`track.correct` :2118; node `kalman` giải thích đúng "predict trước vì assign cần điểm-dự-đoán để gate" |
| ROI strict vs context band | ✓ mask :790-817; context band :812-817; `required_support` :876-885; phân biệt rõ "band để đo trọn xe chạm mép, không mở rộng quyền tạo identity" |
| MOG2 shadow | ✓ 255/127 tại :768-775, `_is_cast_shadow` :705+ |
| Temporal motion | ✓ short 0.25s/long 0.80s :522-575, AND với FG mask :790-796 |
| Blob/contour | ✓ open/close :812-817, min px 160 + ratio 8% :1015-1020, `ambiguous_merged`/`occlusion_members` :934-949 |
| LAPJV 1-1 + gates + cost matrix | ✓ cost 4-term .45/.25/.20/.10 :1761-1767, limit 0.90, lapjv :1908, margin/defer đúng |
| Coasting age / stale / TTL / reacquire | ✓ decay 0.25s :263-270, stale 0.40s :2200-2215, unmatched :2258-2262, TTL `1.5×3.0=4.5s` derive :2189-2200, note TTL theo-giây (frame-TTL giãn ở FPS thấp) đúng |
| `min_visible_count=3` + TENTATIVE | ✓ :36/:2023/:2073 — "2 ảnh đẹp chưa đủ" |
| Pseudocode ↔ activeLines ↔ state ↔ progress đồng bộ | ✓ activeLines 0-based trong-bounds; scene progress-driven (`view.progress`) deterministic — verifier A bao phủ |
| Source refs + excerpt | ✓ excerpt byte-match source (verifier A đối chiếu byte-level, 586 PASS) |

## Ghi chú nhỏ (không blocking)

1. **`coasting` — "TTL 90f"**: pack nhắc `lost_track_ttl = 90` frame là config runtime; đúng là CLI/runtime override, còn derive mặc định là 4.5s — pack đã ghi cả hai và giải thích khác biệt, chỉ lưu ý người xem đừng nhầm 90f là default class. Không cần sửa.
2. **`roi` — required_support**: minh họa tỉ lệ pixel là con số demo (đúng hướng, không phải hằng số hardcode trong source) — pack đã tách "minh họa" khỏi "source" trong phần why. Không cần sửa.

## Phạm vi

Chỉ review source-fidelity + deterministic contract. **Browser/visual QA là của C** — tôi chưa chạy canvas render thật ngoài verifier; không tự approve web quality.
