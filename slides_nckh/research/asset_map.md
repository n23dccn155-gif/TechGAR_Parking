# TechGAR 13-slide deck — Asset Map (asset-scout)
> Ngày kiểm kê: 2026-09-19. Tất cả đường dẫn đã kiểm chứng tồn tại bằng `ls`/Test-Path.
> **Quy ước nguồn:** `SA` = `D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets\`;
> `OUT` = `D:\TechGar2\backend\main_detect\experiment_test\output\`;
> `CFG` = `D:\TechGar2\backend\main_detect\config\`;
> `FE` = `D:\TechGar2\frontend\artifacts\screenshots\`;
> `Q` = `D:\TechGar2\_quarantine_20260919\backend\main_detect\experiment_test\output\` (bản trùng — chỉ dùng khi thiếu bản active);
> `SNAP` = `D:\TechGar2\_snap\idfix_pre\main_detect\` (bản trùng — KHÔNG dùng nếu có bản active).

## 0. Ghi chú môi trường quan trọng (ảnh hưởng câu chữ trên slide)
- "Tầng hầm" trong toàn bộ footage là **mô hình thu nhỏ (tabletop)**: xe đồ chơi trên tấm mat in/sơn ô đỗ, **chai nước đóng vai trò cột**, 2 điện thoại quay qua DroidCam (watermark "using droidcam.app" trên debug video). Deck không được nói "video thật bãi xe" — chỉ nói "dữ liệu thực nghiệm trên mô hình bãi đỗ".
- Có **2 thế hệ rig**: (a) mat giấy trắng sáng, "Parking: X/24 free" — session `session_cam*_live.mp4` (nguồn frame f0100–f0705); (b) mat sơn tối, "Parking: X/30 free" — session `droidcam_shared_*` (hiep/vd/live/toi/bt) và video `demo_*`.
- **`demo_*` và `session_cam*_live` là 2 session khác nhau** (mat khác nhau). `demo_*` đã re-render với counter "Frame: 1" nên không map ngược được session gốc; vẫn là output thật của pipeline.
- Frame naming: file `frame_0NNN_*.jpg` = **0-based index NNNN** trong `session_cam*_live.mp4`; overlay trong video hiển thị "Frame: NNNN+1". Đã xác minh pixel-identical: `frame_0336_handoff_matched_debug_cam1.jpg` ≡ frame 336 của `session_cam1_live.mp4` (absdiff = 0).
- Dataset "Session 2808_3 (3.827 frames / 153,08s)" trong docs **KHÔNG nằm trên ổ này** (repo cũ `TechGAR_Parking_Thai23_8`). Session dài nhất hiện có: `droidcam_shared_live15` = 5.730f / 229s.

---

## 1. INVENTORY

### A. Calibration (SA)
| File | Size | Nội dung / vai trò |
|---|---|---|
| `calib_cam1_raw.png` | 1.6 MB | Cam1 oblique, mat giấy, chưa đánh dấu |
| `calib_cam1_marked.png` | 1.6 MB | Cam1 + 4 điểm A–D vàng trên sàn → slide 5 "before" |
| `calib_cam2_raw.png` | 1.2 MB | Cam2 oblique raw |
| `calib_cam2_marked.png` | 1.2 MB | Cam2 + điểm A–D |
| `calib_checkerboard.png` | 493 KB | Shared-map checkerboard stitch — ⚠️ watermark "CALIBRATION DRAFT – MODEL INADEQUATE – 8 fitted pairs, NOT independent, p95=0.815 cm" |
| `calib_shared_roi.png` | 492 KB | Shared map + ROI (đen=cam1, đỏ=cam2, tím=overlap) — ⚠️ cùng watermark DRAFT |

### B. Frame-event (SA — nguồn `session_cam1_live.mp4`/`session_cam2_live.mp4`, 0-based index)
Mỗi event gồm `raw_cam1`, `raw_cam2`, `debug_cam1`, `debug_cam2`, `split_debug` (split = 2560×720 ghép 2 cam).
| Event | Frame | Nội dung đã xem |
|---|---|---|
| baseline | f0100 | Bãi đỗ tĩnh, slot ROI xanh/đỏ, chai-cột rõ → slide 1 |
| gid_created | f0278 | GID đầu tiên được tạo trên xe đang đi |
| handoff_opened | f0283 | Xe chạm cổng overlap, mở hồ sơ bàn giao |
| handoff_matched | f0336 | Xe trong overlap, cả 2 cam cùng thấy (debug_cam2 nhãn `G#1 moving`) → slide 4 |
| parked_confirmed | f0543 | Xe đỗ tại ô (D02 đỏ, "Parking: 14/24 free") → slide 11 |
| departure_token | f0705 | Xe nhích ra khỏi D02 kèm trajectory đuôi → slide 11 |

### C. Map / schematic
| File | Size | Nội dung |
|---|---|---|
| `SA\lane_graph.png` | 43 KB | Lane graph (không spots) — topology slide 8 |
| `SA\lane_graph_spots.png` | 77 KB | Lane graph + spot nodes: zone A–F, cạnh xanh (2 chiều)/đỏ (1 chiều), chấm xanh entry/exit — slide 3/8 |
| `SA\roi_active_map.png` | 274 KB | "ACTIVE ROI + PARKING SLOTS — used by tracking": đen=cam1 ROI, đỏ=cam2, tím=overlap vận hành — slide 7 map panel |
| `SA\roi_full_view.png` | 419 KB | "FULL CAMERA VIEW — 50/50 blend in shared world map" — 2 view ghép top-down + điểm calib — slide 5 "after" |
| `SA\template_bg.png` | 209 KB | Nền template deck cũ (không phải data asset) |

### D. Web UI (ảnh thật)
| File | Res | Nội dung |
|---|---|---|
| `SA\web_dashboard_desktop.png` | 1440×900 | Dashboard Smart Parking: zone F→A, ô xanh/đỏ, LỐI VÀO/RA, counter 42 trống/6 có xe, "2/2 camera online" |
| `SA\web_navigation_c06.png` | 1440×900 | Navigation tới C06, route xanh cyan |
| `SA\web_mobile_nav.png` | 390×844 | Mobile nav tới A08 |
| `FE\1440x900-desktop.png` | 1440×900 | Dashboard (bản Playwright artifact) |
| `FE\1440x900-c06-navigation.png`, `FE\1440x900-c10-navigation.png` | 1440×900 | Route nav C06/C10 |
| `FE\390x844-entry.png`, `FE\390x844-recommendation.png`, `FE\390x844-navigation.png` | 390×844 | Mobile entry/recommendation/nav |

### E. Video (SA — đã probe cv2, tất cả 25 FPS)
| File | Frames | Dur | Res | Nội dung |
|---|---|---|---|---|
| `demo_overlap_split.mp4` | 118 | 4.72 s | 1280×360 | Split cam1(PRIMARY)+cam2(OVERLAP), mat tối, xe chạy qua overlap, nhãn GID — **slide 7 core** |
| `demo_tracking_cam1.mp4` | 118 | 4.72 s | 1280×720 | Cam1 debug full-res cùng khoảnh khắc (mat tối, "0/30 free" → counter chạy) — slide 6 |
| `demo_tracking_cam2.mp4` | 118 | 4.72 s | 1280×720 | Cam2 debug cùng khoảnh khắc — slide 6 |
| `session_cam1_live.mp4` | 1604 | 64.16 s | 1280×720 | Debug overlay session mat giấy — **nguồn pixel-verified của frame_*_* (f0100–f0705)** |
| `session_cam2_live.mp4` | 1604 | 64.16 s | 1280×720 | Cam2 cùng session — chứa chu trình arrival→parked→departure f500–f760 |

### F. Sessions `OUT\droidcam_*` (mỗi session: raw_cam1/2.mp4 + debug_cam1/2.mp4 1280×720@25 + predictions.jsonl + ground_truth_*.csv + performance.csv + session_info.json)
| Session | Frames | Dur | Ghi chú nội dung |
|---|---|---|---|
| `session_full` | 1842 | 73.7 s | Replay test_gid_swap; handoff@f401, departure_token@f1258 |
| `droidcam_shared_hiep2` | 2340 | 93.6 s | Mat tối; **P0 failure documented: G#2 đỗ D01 → rời ô bị cấp G#4 @f1181** (status-report.md, ledger) |
| `droidcam_shared_hiep7` | 2503 | 100.1 s | **True split-identity @f1791–94: gid1 bound cam1#48+cam2#48 cách 60–67 cm** (ledger "REAL splits") |
| `droidcam_shared_hiep8` | 906 | 36.2 s | Bound-identity rejection storm f709–717 |
| `droidcam_shared_live15` | 5730 | 229.2 s | Session dài nhất; ghost GID storm; departure episodes E01@3360–3490, D01@4270–4330; dark dip f497; white-glove hand f1175–1200 |
| `droidcam_shared_vd_16` | 2445 | 97.8 s | Ghost storm ≥20/41 GIDs; **f2180–90 ghost pair G#40/G#41 trên chân người** (đã xem frame) |
| `droidcam_shared_vd_18` | 276 | 11.0 s | Ghost storm f97–127 |
| `droidcam_shared_toi1` | 379 | 15.2 s | **Session TỐI** (median gray ~45); flashlight "đèn pha" lọt vào frame ~f185–200 (đã xem f190: quả cầu sáng mé dưới); incomplete record count |
| `droidcam_shared_bt` | 1317 | 52.7 s | ~2 xe thật (đen+cyan); dup GID @f1070 direction-veto |
| `droidcam_live14` | 1055 | 42.2 s | Bound-identity churn f713–747 |
| (replay dirs `idfix_*`, `audit_*`, `continuation_*`, `runtime_*`) | — | — | Chủ yếu predictions/logs, không phải nguồn ảnh chính |

### G. Calibration maps `CFG\shared_map_01\`, `shared_map_02\`
| File | Nội dung |
|---|---|
| `capture_cam1.png`, `capture_cam2.png` | Capture thật 2 cam (mat tối, nhiều xe) — `capture_cam1.png` là ảnh tổng quan sạch nhất hiện có (top-down hơn, ít tay người) |
| `marked_cam1.png`, `marked_cam2.png` | Capture + điểm calib đánh dấu |
| `shared_map_full_view.png` | "DIAGNOSTIC FULL FRAME" — 2 cam warp về world frame + polygon FOV — slide 5 "after" |
| `shared_map_active_roi.png`, `shared_map_preview.png` | Active ROI / preview trên shared map — slide 7 map panel alt |
| `calibration_points.csv` | 4 cặp A–D mỗi cam (world cm) |
| `cross_camera_validation_points.json` | Cặp điểm kiểm tra độc lập (V1…) — nguồn con số 945 cặp/p50=1.13cm (chỉ map_01) |

### H. Bản trùng (cờ cảnh báo)
- `SNAP\docs\slides_tracking\slides_assets\` — bản sao đầy đủ (gồm demo_overlap_split.mp4, session_cam1_live.mp4). **Không dùng — luôn dùng bản active SA.**
- `Q\` chứa session cũ: `droidcam_shared_toi` (847f, tối), `toi2` (1190f), `sang` (1416f, sáng median ~195), `thai_s1/2/3` (3589/7893/8220f), `live002–007`, `vd_10/13/17`, `hiep1/3/4/5`, `droidcam_live*` — chỉ mở khi active thiếu nội dung (ghi cờ trong map).

---

## 2. ASSET MAP THEO SLIDE

| # | Yêu cầu visual của brief | Asset gán (đường dẫn đầy đủ) | Status | Nguồn/ghi chú |
|---|---|---|---|---|
| 1 | Ảnh tầng hầm thật, đánh dấu cột/điểm mù/FOV | **`SA\frame_0100_baseline_raw_cam1.jpg`** (mat giấy, chai-cột, nhiều xe) → annotate cột/blind spot/FOV. Alt sạch hơn: `CFG\shared_map_01\capture_cam1.png`. Backup split: `SA\frame_0100_baseline_split_debug.jpg` | **ready** (+job annotate) | session_cam1_live f100 (0-based) |
| 2 | Cùng tình huống: Cam1 bị cột che / Cam2 vẫn thấy | **`SA\frame_0336_handoff_matched_split_debug.jpg`** (2 cam cùng frame, xe trong overlap) + per-cam `..._raw_cam1.jpg`/`..._raw_cam2.jpg` làm 2 panel. Cần frame cam1-mất-xe-sau-chai mạnh hơn → job E9 | **ready** (split) / needs-extraction (occlusion pair rõ hơn) | session_cam*_live f336 |
| 3 | Full-width pipeline (diagram) | Diagram vẽ mới; supporting: `SA\lane_graph_spots.png` + `SA\roi_active_map.png` (minh họa map thật) | **ready** | — |
| 4 | Dual-view cùng thời điểm t + skew | **`SA\frame_0283_handoff_opened_split_debug.jpg`** (2560×720, 2 cam cùng "Frame: 284", xe vừa vào overlap thấy ở cả 2) | **ready** | session_cam*_live f283 |
| 5 | Before (ảnh xiên) → Homography → After (map top-down) | Before: `SA\calib_cam1_marked.png` (+`calib_cam2_marked.png`). After: `CFG\shared_map_01\shared_map_full_view.png` hoặc `SA\roi_full_view.png`. ⚠️ `calib_checkerboard.png`/`calib_shared_roi.png` có watermark "MODEL INADEQUATE — NOT independent p95=0.815cm" — tránh dùng nếu không muốn lộ draft warning | **ready** | config shared_map_01 |
| 6 | 3 tình huống tracking thật (moving/che/dừng): frame + mask/bbox/trajectory | Moving: `SA\demo_tracking_cam1.mp4`/`demo_tracking_cam2.mp4` (clip sẵn) + `SA\frame_0278_gid_created_debug_cam2.jpg` (bbox+label). Che/dừng: chưa có frame curated → jobs E6a/E6b | **needs-extraction** (2/3 panel) | session_cam*_live + sessions |
| 7 | 65% video overlap + 35% shared map | **`SA\demo_overlap_split.mp4`** (118f/4.72s — khớp brief "dùng đúng clip đó") + **`SA\roi_active_map.png`** (alt `CFG\shared_map_01\shared_map_preview.png`) | **ready** ✅ | — |
| 8 | Diagram topology + cost matrix + minh họa thuộc tính xe | Topology: `SA\lane_graph.png`/`lane_graph_spots.png`. Ảnh xe sạch cho panel "Vị trí 55/Màu 30/Size 10/Hướng 5": chưa có → job E8 (crop xe từ frame thật) | **needs-extraction** (car crop) | — |
| 9 | 3 ảnh TỐI / BÌNH THƯỜNG / LÓA ĐÈN | Chưa có curated → job E9: TỐI=`OUT\droidcam_shared_toi1\raw_cam1.mp4` f200 (median ~45, xe vẫn rõ); THƯỜNG=`OUT\droidcam_shared_hiep2\raw_cam1.mp4` f1200 (median ~110) alt live15 f1200/vd_16 f2200; LÓA=`OUT\droidcam_shared_toi1\raw_cam1.mp4` f190 (đèn pin rọi vào lens, đã xem) | **needs-extraction** | brightness scan đã chạy |
| 10 | Voting grid 5/9 (diagram chính) | Diagram vẽ; supporting ảnh ô đỗ thật: crop vùng slot từ `SA\frame_0543_parked_confirmed_debug_cam1.jpg` (job E10, optional) hoặc `SA\roi_active_map.png` | **ready** (+optional crop) | — |
| 11 | Lifecycle Moving→Parked→Departure→Re-ID | **`SA\frame_0278_gid_created_*`** (arrival), **`SA\frame_0543_parked_confirmed_*`** (parked, "14/24 free"), **`SA\frame_0705_departure_token_*`** (departure + trajectory). Đủ cho khung timeline. Clip ngắn arrival→departure: `SA\session_cam2_live.mp4` f500–f760 → job E11 | **ready** (frames) / needs-extraction (clip) | session_cam*_live |
| 12 | Results dashboard + failure case | Số liệu = text. Failure frame: **`OUT\droidcam_shared_hiep2\debug_cam2.mp4` f1181–82** (G#4 minted cho xe đen rời D01 — P0 documented trong status-report.md + ledger) → job E12a. Alt: `OUT\droidcam_shared_hiep7\debug_cam1/2.mp4` f1791–94 (split 60–67cm, ledger "REAL splits"); `OUT\droidcam_shared_vd_16\debug_cam1/2.mp4` f2180–90 (ghost pair trên chân người). Narrative "lóa đèn <1m": ảnh đèn pin `toi1` f190 làm minh họa điều kiện (khác rig — ghi chú) | **needs-extraction** | ledger/status-report verified |
| 13 | 3 contribution cards + limitation/roadmap | `SA\web_dashboard_desktop.png` + `SA\web_navigation_c06.png` + `SA\web_mobile_nav.png` (alt `FE\*` artifacts) + `SA\roi_full_view.png` cho card homography | **ready** | — |

---

## 3. TÓM TẮT STATUS
- **ready**: 1, 2*, 3, 4, 5, 7, 10, 11*, 13  (slide 2 & 11 ready về frame nhưng có job nâng cấp)
- **needs-extraction**: 6 (2 panel), 8 (car crop), 9 (cả 3), 12 (failure frames)
- **gap hoàn toàn**: không có slide nào thiếu hẳn dữ liệu — mọi nhu cầu đều có nguồn thật để extract.

## 4. CẢNH BÁO CHO TEAM DỰNG SLIDE
1. Đừng crop/mô tả footage như "bãi xe thật" — là mô hình thu nhỏ; nên nói "mô hình bãi đỗ thu nhỏ / scale-model testbed".
2. `calib_checkerboard.png` & `calib_shared_roi.png` mang watermark "CALIBRATION DRAFT – MODEL INADEQUATE"; `shared_map_full_view.png` ghi "DIAGNOSTIC FULL FRAME". Cân nhắc trước khi đưa lên slide 5.
3. Trên debug overlay: file `fNNNN` ↔ "Frame: NNNN+1" trong video (lệch 1 do 0-based/1-based).
4. `toi1` session thuộc rig mat tối nhỏ hơn & có watermark — chỉ dùng làm ảnh điều kiện ánh sáng, không dùng chứng minh tracking.
5. Narrative slide 12 "1 session fail do lóa đèn pha <1m trong overlap" **không truy được session cụ thể trên ổ này** (20-session audit gốc không kèm bằng chứng file). Failure documented gần nhất: hiep2 G#2→G#4 @f1181 (departure Re-ID) và hiep7 split @f1791–94 — chọn một trong hai làm failure case thật, hoặc giữ narrative lóa đèn kèm ảnh minh họa toi1 + ghi chú "điều kiện mô phỏng".
