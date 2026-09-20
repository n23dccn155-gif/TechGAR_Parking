# Verified Numbers — TechGAR 13-slide deck (manager-verified)

> Verify trực tiếp bởi senior manager (R1 terminated sau ~100' không output; manager tự đối chiếu code+docs).
> Tag: **VERIFIED-CODE** (file:line trong repo) · **DOC-CLAIMED** (số đo session 2808_3 trong docs cũ, session không có trên ổ, nhất quán giữa nhiều docs) · **DISCREPANCY-RESOLVED** · **UNVERIFIABLE**.

## A. Số liệu đo (theo brief §14-A)

| Claim | Kết quả | Nguồn | Tag |
|---|---|---|---|
| Homography p50 = 1,13 cm | Đúng — "seam benchmark" trên **945 cặp điểm**, p50=1.13 cm, p95=4.39 cm, session 2808_3 | `docs\slides_tracking\index.html:1113-1117`, `TechGAR_15slides_Scientific_Spec.md` | DOC-CLAIMED |
| 945 cặp điểm | Là **cặp seam cam1↔cam2**, KHÔNG phải file `cross_camera_validation_points.json` (file này chỉ có **3 cặp V1–V3** — "independent points excluded from fitting") | `index.html:1113` vs `config\shared_map_01\cross_camera_validation_points.json` | DOC-CLAIMED |
| Homography p95 = 4,39 cm | Đúng; gắn ngữ cảnh "nới tolerance 5.0px→8.5px ≈ 4.39cm, bảo đảm 100% điểm hội tụ" | `index.html:1117` | DOC-CLAIMED |
| Skew p50=18 / p95=47 / max=110 ms | Đúng, đo trên session 2808_3; ngưỡng config `--max-camera-skew-ms 120` tồn tại thật | `index.html:1231`, `docs\two-camera-runbook.md:90` | DOC-CLAIMED (+ngưỡng 120ms VERIFIED-CODE) |
| 3.827 frames / 153,08 s / 25 FPS / CPU i5 | Đúng — session 2808_3; **session không nằm trên ổ** (repo cũ `TechGAR_Parking_Thai23_8`) | `TechGAR_15slides_NoiDung...:556-557`, `Scientific_Spec.md:305-306` | DOC-CLAIMED |
| E2E latency 169 ms | Đúng; breakdown: pipeline 40ms/frame (ingest 12 + tracker 18 + homography&handoff 6 + equalizer&binder 4) → E2E lên web 169ms | `index.html:2117` | DOC-CLAIMED |
| 19/20 session thành công | Đúng trong docs ("95.0%"); **session fail cụ thể không truy được file** — narrative "lóa đèn pha <1m" chỉ có trong brief, không có bằng chứng session trên ổ | `TechGAR_15slides_NoiDung...:645` | DOC-CLAIMED |
| SSD Reacquire 1.714 lần / 25 từ chối | Đúng trong docs — session 2808_3 | `TechGAR_15slides_NoiDung...:290`, `Scientific_Spec.md:169` | DOC-CLAIMED |
| Main GID 3.383 frames | **88,4% tổng thời lượng video, 98,2% thời gian xe di chuyển trong bãi** — doc `NoiDung:561` ghi đúng; `Scientific_Spec:309` ghi sai "48,4%" → **lỗi đảo số trong 1 doc** | `NoiDung...:561` vs `Scientific_Spec:309` | DISCREPANCY-RESOLVED → dùng 88,4% |

## B. Tham số thiết kế (brief §14-B) — verify trong code

| Tham số | Giá trị trong code | Vị trí | Tag | Phát biểu đúng trên slide |
|---|---|---|---|---|
| Cost weights | `0.55·residual + 0.30·appearance + 0.10·size + 0.05·direction` | `src\techgar\cross_camera_manager.py:3095` (cùng pattern :3789-3791, :5248-5257, :5385-5405) | VERIFIED-CODE | "trọng số tuning thực nghiệm" |
| Ngưỡng góc | `min_direction_cosine = 0.25` | `cross_camera_manager.py:165` (default), dùng `:2298` (`dot(direction,unit)<0.25` → reject); cũng `slot_vehicle_binder.py:3158,3355` | VERIFIED-CODE | "cos θ < 0.25 ⇒ reject — ngưỡng heuristic" |
| Equalizer grid | **5 Δγ × 5 ΔCLAHE = 25 biến thể**: `delta_gamma=[-0.2,-0.1,0,0.1,0.2]`, `delta_clahe=[-0.5,-0.2,0,0.2,0.5]` | `parking_detector.py:454-456`; `parking_detector_parallel.py:472-474` | VERIFIED-CODE → **sửa "9 cấu hình" thành "25 biến thể"** | "ensemble 25 biến thể quanh cấu hình nền" |
| Vote threshold | `required_votes = 25 // 2 = 12` → **ô trống khi ≥12/25 biến thể vote "trống"** (occupied = <12/25) | `parking_detector.py:533`, `parallel:549` | VERIFIED-CODE → **sửa "5/9" thành "≥12/25"** | "biểu quyết đa số trên 25 biến thể (~ngưỡng 12/25)" + temporal smoothing `smoothing_frames=5` (:105) |
| Gamma/CLAHE | base_gamma default **2.8** (`parking_detector.py:100`), profile live15 deploy **2.5**; dải thực tế γ∈[2.3–3.0], CLAHE clip∈[1.5–2.5], grid 8×8, ratio_thr=0.20 | `parking_detector.py:100-104`; `output\parking_stability_live15_v3_20260906\report.json` profile | VERIFIED-CODE → **bảng 0,65/~1,0/1,4 trong brief KHÔNG có trong code** | Mô tả đúng: "biến thể quanh base γ≈2.5–2.8, CLAHE≈2.0 bằng delta ±0.2/±0.5" |
| Departure Token | `recovery_retention_seconds = 5.0` (TTL cơ sở **5 s**), extension tới `recovery_extension_seconds = 15.0` (≤4× TTL); `exit_seconds = 0.5` | `slot_vehicle_binder.py:218-222, 209` | VERIFIED-CODE | "Departure Token = 5 s (gia hạn tiệm cận khi departure còn tiến triển)" |
| Arrival ≥3 mẫu | `arrival_min_samples = 3` | `slot_vehicle_binder.py:235` | VERIFIED-CODE | "≥3 mẫu liên tiếp" ✓ |
| Vision confirm | `arrival_vision_confirmations = 2` trong cửa sổ `arrival_lookback_seconds = 1.5` (KHÔNG phải 3 s); vision detector chạy ~2 Hz | `slot_vehicle_binder.py:234-236` | VERIFIED-CODE → **sửa "2 lần/3 s" thành "≥2 lần trong ~1.5 s"** | "≥2 lần xác nhận vision trong ~1.5 s" |

## C. Mâu thuẫn nhóm C — ĐÃ GIẢI

| Câu sai trong brief/deck cũ | Sự thật | Câu sửa cho slide |
|---|---|---|
| `2×2×1×5 = 25` | Code: **5 Δγ × 5 ΔCLAHE = 25** (`parking_detector.py:454-456`) | "25 biến thể = 5 mức Δγ × 5 mức ΔCLAHE quanh cấu hình nền" |
| `3383/3827 = 48,4%` | Doc `NoiDung:561` đúng: **88,4%** tổng video (98,2% thời gian xe di chuyển); `Scientific_Spec:309` viết nhầm 48,4% | "Main GID duy trì 3.383/3.827 frames ≈ 88,4% thời lượng" |
| "9 cấu hình → vote 5/9" | Code: **25 biến thể, free khi ≥12/25 vote trống** | "25 biến thể, quyết định bằng biểu quyết đa số (≥12/25) + làm mượt 5 frame" |
| Bảng gamma 0,65/1,5·~1,0·1,4/4,0 | Không có trong code; thực tế base γ=2.8 (deploy 2.5), Δ±0.2; CLAHE base 2.0, Δ±0.5 | Bảng minh họa điều kiện→hiệu ứng (không ghi số γ cụ thể), hoặc ghi "γ∈[2.3–3.0], CLAHE∈[1.5–2.5]" |
| "bỏ Topology → FPS 25→15 = giảm tải" | Không tìm được số liệu ablation trên ổ; hướng đúng phải là "bỏ Topology → tải tính toán tăng → FPS giảm" | Bỏ claim định lượng; chỉ nói "Topology Gate lọc ứng viên trước → giới hạn số cặp phải tính cost" |
| Departure Token "5 s" | ĐÚNG: `recovery_retention_seconds=5.0` | Giữ, thêm "gia hạn khi departure còn tiến triển (≤15 s)" |
| "vision confirm ≥2 lần trong 3 s" | `arrival_vision_confirmations=2` trong `arrival_lookback_seconds=1.5` | "≥2 lần trong ~1.5 s" |

## D. Departure Re-ID — trạng thái

**ĐÃ TRIỂN KHAI + unit-tested, ĐANG kiểm chứng trên replay:**
- Cơ chế: `DepartureToken` (`slot_vehicle_binder.py:129`) + `batch_recover_ids`/`RecoveryBatchResult` (:153) + `_consume_departure_token` (:2738) + `export_recovery_tokens`.
- Unit tests tồn tại: `tests\test_gid_departure_token.py`, `test_departure_transaction.py`, `test_two_camera_parking_recovery.py`.
- Failure thực nghiệm documented: session `hiep2` — xe G#2 đỗ D01 rời ô bị cấp **G#4 @f1181** (`status-report.md`, `idfix_ledger.md`) → chứng tỏ cơ chế chưa hoàn hảo trên replay thật.
- **Phát biểu đúng trên slide:** "cơ chế đã triển khai và unit-tested; failure case hiep2 cho thấy còn cần kiểm chứng thêm" — KHÔNG claim hoàn tất, cũng không hạ xuống "chỉ thiết kế".

## E. Phát biểu đề xuất thay thế (cho W/builder)

1. Slide 4 skew: giữ 18/47/110ms + "ngưỡng cấu hình 120ms" (VERIFIED).
2. Slide 5/12 homography: giữ 1,13cm/4,39cm/945 cặp, ghi nguồn "seam benchmark, session 2808_3".
3. Slide 9: bảng điều kiện→hiệu ứng (Tối→nâng vùng tối, Lóa→hạn chế bão hòa) + "25 biến thể γ×CLAHE quanh cấu hình nền (γ≈2.5, CLAHE≈2.0)" — bỏ bảng số 0,65/1,4.
4. Slide 10: "25 biến thể, ≥12/25 vote trống ⇒ FREE; ngược lại OCCUPIED; làm mượt 5 frame" + ví dụ lưới vote.
5. Slide 11: "Arrival ≥3 mẫu · vision ≥2 lần/~1.5 s · Departure Token 5 s (gia hạn ≤15 s)".
6. Slide 12: giữ 19/20 + failure hiep2 G#4; thêm "3.383/3.827 = 88,4% Main GID" nếu muốn metric độ bền GID.
