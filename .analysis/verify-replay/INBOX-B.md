# INBOX-B — DEVIN (manager) tiếp-quản điều-phối
Cập-nhật: sau khi LEAD Codex hết quota. Poll file này để xem trạng-thái.

## Trạng-thái hiện-tại (checkpoint)

### V1 — HOÀN-THÀNH
- 18/18 official sessions PASS (`completed_replay`, exit 0, counts khớp 1-1).
- Canonical: `V1-replay-results.md` (cmd, source/session_dir/log, percam frames,
  record_counts, exit, elapsed, size, hash 6 config trước-sau, HEAD, ngoại-lệ
  `verify_cur_runtime_session_bt` = official output; `verify_cur_runtime_runtime_session_bt` = side-state).

### V3/V4 coverage của B (4 sessions assigned)
| Session | V3 flags | Sheets | Eyeballed | Verdict |
|---|---|---|---|---|
| session_hiep_toi6 | done trước | — | done | findings cũ E-B-001..003 + O-B-001..005 |
| session_hiep1 | done trước | — | done | (gộp report trước) |
| session_hiep_thai4 | 447 flags / 54 win | 237 | **237/237** (2132 cells = 1066×2cam, 0 skip) | E-B-004,005 dup CONFIRMED; E-B-006 UNSURE; E-B-007 UNSURE-type (sau audit A) |
| session_hiep_thai3 | 470 flags / 43 win + 14 merged | 212 | **212/212** (1904 cells = 952×2cam, 0 skip) | đang ghi report — 41 dup-pairs same-gid, 0 slot-conflict |

### V5 final C — ĐÃ CHỐT
- Pool 7 E-C → seed 20261005 → sample {E-C-003, E-C-005}.
- E-C-003: phenomenon confirmed, defect UNSURE → ngoài denominator.
- E-C-005: NOT-CONFIRMED (1/3 disproven có ảnh, 2/3 UNSURE) → ngoài denominator.
- Resolved 0/2 → FP không ước-tính được. File: `V5-crosscheck-B.md`.
- Audit ngoài-seed (riêng): C005 handoff (97cm+gap không đủ → thai7 gid3→gid5 khác-xe có ảnh; thai8 + gid1→gid7 UNSURE); C006 ghost-decay (44-238f) vs C007 fixture (6 track sống EOF) phân-biệt rõ.

### Audit A đã áp
- E-B-007 hạ UNSURE-type (lid19/23 anchor khác → không suy cùng-xe từ pixel-gần).
- E-B-004/005 A xác-nhận dup; downstream harm UNSURE — khớp ghi-nhận B.

## Việc còn lại
1. ~~`V4-thai3-B.md`~~ — **XONG**: 212/212 sheets eyeballed, E-B-008/009 dup CONFIRMED (41 pairs same-gid), O-B-022..025.
2. ~~Đồng-bộ ERRORS-B.md/.json~~ — **XONG** (UTF-8; errors E-B-001..009, obs O-B-001..025 — O-B-006..016 thai7 đã bổ-sung vào JSON).
3. ~~progress-builder-b.md + STATUS.md~~ — **XONG**.
4. **A cross-check full pool** (§4) — chờ A; sau đó ERRORS-SUMMARY + V6 gate.
5. B đã freeze 4/4 — sẵn-sàng nếu cần bổ-sung evidence cho A.

## Blockers
- Không có blocker kỹ-thuật. GT header-only → identity/slot harm = UNVERIFIED khắp-nơi.
- E-B-006 (ghost stacked boundary) vẫn UNSURE chờ A phán.

## ETA
- B-side đóng-gói xong trong phiên này. Còn chờ A full-pool cross-check → V6 gate.
- Không replay thêm, không sửa tracker.

## FREEZE-CHECK cuối chiến-dịch (kiểm ngay bây giờ)

| Check | Kết-quả |
|---|---|
| 6 config SHA-256 vs V0 §0.3 | **PASS 6/6** (roi×2, calibration, slots×2, gate_zones) |
| HEAD | **PASS** `5f581311e34cb7c588197c6f01d2b9686d28df8d` — không đổi |
| Modified set (git) | **PASS** — đúng 5 file V0 đã ghi (cross_camera_manager, slot_vehicle_binder, trajectory_memory, test_gid_departure_token, test_gid_reserved_competition) — pre-existing từ trước chiến-dịch; **0 file-code/config/test nào bị sửa thêm** |
| Untracked khác | `experiment_test/verify/` (công-cụ scan — được phép theo rule "chỉ tạo file ở .analysis, experiment_test/verify, output verify_cur_"); `merge_split_report.py`, `reid_fix/`, `test_merge_split_scenarios.py` = V0-documented |
| Stray artifacts (không phải code) | `backend/.analysis/verify-replay/v1-final-stats.json` (viết nhầm cwd); `nul` 73B ở repo-root (redirect rác); `.analysis/`, `.publish/`, `algo-web*/` expected |

### Lưu-ý quan-trọng
- Fingerprint 148-file (145 code/config/test + 3 entrypoints) **không tồn-tại
  trên đĩa** — HANDOVER.md ghi rõ "baseline 148 chỉ ở bộ nhớ LEAD". LEAD hết
  quota → **không thể so per-file hash**.
- Thay-bằng: **set-level check** (git status == V0 snapshot: 5 M + 3 ??
  documented + tools được phép) + 6 config PASS + HEAD PASS.
- Verdict: **FREEZE PASS (set-level)** — 0 file code/config/test bị đụng trong
  chiến-dịch. Nếu cần per-file tuyệt-đối: phải có baseline 148-file từ LEAD
  (không còn truy-cập được).

B idle — chờ prompt tiếp.
