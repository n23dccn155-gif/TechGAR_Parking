# TechGAR 13-slide deck — Extraction Jobs (asset-scout)
> Mỗi job: **target file | nguồn (video + frame range hoặc ảnh + annotate) | slide đích**.
> Frame index ghi theo 0-based (cv2 `CAP_PROP_POS_FRAMES`); overlay trong debug video hiển thị "Frame: idx+1".
> Mọi nguồn đã verify tồn tại + probe metadata. Tool sẵn có: `python` 3.11 + cv2 5.0, `experiment_test/render_gid_frames.py` (vẽ GID overlay lên raw frame), ffmpeg chưa kiểm chứng trên máy.
> Đích xuất đề xuất: `D:\TechGar2\slides_nckh\assets\` (chưa tạo — để fleet quyết định).

## JOB E1 — Slide 9 trio (Adaptive Equalizer) — ƯU TIÊN CAO
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E1a | `slide9_dark_cam1_f0200.jpg` | `OUT\droidcam_shared_toi1\raw_cam1.mp4` @ frame **200** (alt 185/253/30 — median gray ~44–45, cảnh tối xe vẫn phân biệt được). Nếu muốn tối hơn: f28–36 (mean 33). | 9 "TỐI" |
| E1b | `slide9_normal_cam1_f1200.jpg` | `OUT\droidcam_shared_hiep2\raw_cam1.mp4` @ frame **1200** (median ~110, mat tối rig mới, nhiều xe đỗ + 2 xe đang chạy trong làn). Alt: `OUT\droidcam_shared_live15\raw_cam1.mp4` f1200 (đã xem — sáng đều, có găng tay trắng góc phải); `OUT\droidcam_shared_vd_16\raw_cam1.mp4` f2200 (mean ~138). | 9 "BÌNH THƯỜNG" |
| E1c | `slide9_glare_cam1_f0190.jpg` | `OUT\droidcam_shared_toi1\raw_cam1.mp4` @ frame **190** — đèn pin cầm tay ("đèn pha" mô phỏng) lọt vào cạnh dưới frame, quả cầu sáng trắng rõ. Alt quét thêm 185–200 chọn glare to nhất; nguồn dự phòng (cờ quarantine): `Q\droidcam_shared_toi\raw_cam1.mp4` f10–50 (blob sáng ~660px). | 9 "LÓA ĐÈN" |

**Lưu ý E1:** trio phải cùng 1 camera/tỉ lệ cắt giống nhau cho cân slide; nếu cần đồng nhất rig, có thể lấy cả 3 từ toi1 (dark f30, normal khi đèn bật đầu video f0–10 mean~124, glare f190) — cùng session, cùng góc.

## JOB E2 — Slide 12 failure case
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E2a (chính) | `slide12_failure_gid4_f1182.jpg` (+ bản cam1) | `OUT\droidcam_shared_hiep2\debug_cam2.mp4` & `debug_cam1.mp4` @ frame **1181–1182** — nhãn `G#4 moving` trên xe đen vừa rời D01 (xe này trước đó là G#2 đỗ tại D01 → departure Re-ID fail, documented `docs\status-report.md` §"xe đen G#2→G#4 trong hiep2" + `idfix_ledger.md`). Đã xem frame — nhãn G#4 rõ trên cam2. | 12 |
| E2b (alt split) | `slide12_failure_split60cm_f1792.jpg` | `OUT\droidcam_shared_hiep7\debug_cam1.mp4` + `debug_cam2.mp4` @ **1791–1794** — true split-identity: gid1 bound đồng thời cam1#48 + cam2#48 cách 60–67 cm (ledger "REAL splits f1791-94"). Đã extract f1792 cả 2 cam trong `research\probe\`. | 12 |
| E2c (alt ghost) | `slide12_failure_ghostpair_f2181.jpg` | `OUT\droidcam_shared_vd_16\debug_cam1.mp4` + `debug_cam2.mp4` @ **2180–2190** — ghost pair G#40 (cam1) / G#41 (cam2) track trên chân người cạnh mat (ledger D3 "UNRESOLVED vd_16 40+41"). Đã xem frame. | 12 |
| E2d (glare narrative) | `slide12_glare_context_f0190.jpg` | `OUT\droidcam_shared_toi1\raw_cam1.mp4` f190 — minh họa điều kiện "lóa đèn pha cự ly gần" nếu giữ narrative 19/20 gốc. ⚠️ Khác rig (mat nhỏ); KHÔNG claim là session fail — chỉ minh họa điều kiện ánh sáng. | 12 |

**Khuyến nghị E2:** dùng E2a làm failure case chính (documented, đúng cơ chế Departure Re-ID mà slide 11 vừa trình bày) hoặc E2b (đúng chủ đề overlap/cross-camera). Nếu brief bắt buộc narrative "lóa đèn", ghép E2d làm ảnh điều kiện + caption trung thực.

## JOB E3 — Slide 1 hero overview + annotate
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E3a | `slide1_overview_annotated.jpg` | Base `SA\frame_0100_baseline_raw_cam1.jpg` (đã sẵn) → vẽ: viền đỏ nét đứt quanh chai nước = "cột/điểm mù", đa giác FOV cam1, vùng overlap. Alt base sạch hơn: `CFG\shared_map_01\capture_cam1.png` (mat tối, ít tay). | 1 |
| E3b (optional) | `slide1_overview_cam2.jpg` | `SA\frame_0100_baseline_raw_cam2.jpg` nếu cần góc bổ sung. | 1 |

## JOB E4 — Slide 8 car crop (base minh họa thuộc tính cost)
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E4a | `slide8_car_crop.png` | Crop xe xanh dương moving khỏi `OUT\droidcam_shared_hiep2\debug_cam2.mp4` f1182 (bbox `G#1 moving` đã có sẵn trên debug — crop theo bbox hoặc từ raw cùng tọa độ để lấy xe sạch không overlay). Alt: xe trắng/đỏ đỗ tại `OUT\droidcam_shared_hiep2\raw_cam2.mp4` f1182 (ô A02–A10, xe lớn rõ). Alt 2: xe cyan trong `SA\session_cam2_live.mp4` f336 (G#1 moving trong overlap). Chọn xe >150px rộng, không bị tay người che. | 8 |

## JOB E5 — Slide 6 trio tracking (frame thật, không phải clip)
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E5a moving | `slide6_moving.jpg` | `SA\frame_0278_gid_created_debug_cam2.jpg` (đã sẵn — xe moving + bbox/label) hoặc frame từ `SA\demo_tracking_cam2.mp4` f60. | 6 |
| E5b occluded | `slide6_occluded.jpg` | Xe khuất sau chai-cột: quét `SA\session_cam1_live.mp4` f280–330 (xe đi sau chai trong overlap) hoặc `OUT\droidcam_shared_live15\debug_cam1.mp4` quanh episode cột; nếu không đủ rõ dùng `OUT\droidcam_shared_hiep2\debug_cam1.mp4` f1196–1203 (`occlusion_group_opened` events có trong predictions). | 6 |
| E5c stopped | `slide6_stopped.jpg` | `SA\frame_0543_parked_confirmed_debug_cam2.jpg` (xe đỗ tĩnh tại ô) hoặc `SA\session_cam2_live.mp4` f560–700 (xe dừng trước/lúc đỗ). | 6 |

## JOB E6 — Slide 2 occlusion pair (cam1 mất xe / cam2 thấy)
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E6 | `slide2_cam1_blind.jpg` + `slide2_cam2_sees.jpg` | Quét `SA\session_cam1_live.mp4` f280–330 tìm frame xe nằm sau chai (cam1) + cùng index `session_cam2_live.mp4` (cam2 vẫn thấy). Nếu không có frame đủ kịch tính, dùng `SA\frame_0336_handoff_matched_split_debug.jpg` tách 2 nửa + annotate "vùng mù sau cột". | 2 |

## JOB E7 — Slide 10/11 slot closeup (optional)
| Job | Target | Nguồn | Slide |
|---|---|---|---|
| E7 | `slide10_slot_closeup.jpg` | Crop ô D02 + xe đỗ từ `SA\frame_0543_parked_confirmed_debug_cam1.jpg` (ô đỏ occupied rõ). | 10 |

## JOB E8 — Video clips (extract từ nguồn thật)
| Job | Target | Nguồn + range | Poster | Slide |
|---|---|---|---|---|
| E8a | `clip_s07_overlap.mp4` | **ĐÃ SẴN: `SA\demo_overlap_split.mp4`** (118f, 4.72s) — verify tồn tại ✅ | f60 | 7 |
| E8b | `clip_s06_tracking_cam1.mp4` / `clip_s06_tracking_cam2.mp4` | **ĐÃ SẴN: `SA\demo_tracking_cam1.mp4` / `demo_tracking_cam2.mp4`** (118f, 4.72s mỗi cái) ✅ | f60 | 6 |
| E8c | `clip_s11_park_cycle.mp4` | `SA\session_cam2_live.mp4` frame **500–760** (~10.4s @25fps): xe vào → parked_confirmed f543 → departure_token f705. Cắt cv2 VideoWriter hoặc ffmpeg `-ss 20 -t 10.4`. | f543 | 11 |
| E8d | `clip_s01_overview.mp4` | `SA\session_cam1_live.mp4` frame **50–250** (~8s): cảnh bãi tĩnh → xe bắt đầu vào (mat giấy + chai-cột). | f100 | 1 |
| E8e | `clip_s12_failure_depart.mp4` | `OUT\droidcam_shared_hiep2\debug_cam2.mp4` frame **1140–1230** (~3.6s): xe đen rời D01 → G#4 minted f1181 (failure quay lại đúng cơ chế slide 11). | f1182 | 12 |
| E8f (alt) | `clip_s12_failure_ghost.mp4` | `OUT\droidcam_shared_vd_16\debug_cam1.mp4` + `debug_cam2.mp4` frame **2160–2200** ghép split: ghost pair trên chân người. | f2181 | 12 |
| E8g (optional) | `clip_s04_dualview.mp4` | `SA\session_cam1_live.mp4` + `session_cam2_live.mp4` cùng frame **270–390** hstack 640×360 (giống style demo_overlap_split nhưng session mat giấy) — nếu muốn clip "cùng thời điểm t" cho slide 4. | f336 | 4 |

**Lệnh cắt clip gợi ý (cv2):** `cap.set(CAP_PROP_POS_FRAMES, start)` → đọc → `cv2.VideoWriter(..., fourcc='mp4v', 25, (w,h))`. Hoặc ffmpeg: `ffmpeg -ss <t> -t <dur> -i src.mp4 -c:v libx264 -crf 20 out.mp4`.

## JOB E9 — (tùy chọn) Render GID overlay cho frame mới
Dùng `python experiment_test/render_gid_frames.py --session <REPLAY_DIR> --source-video-dir <RECORD_DIR> --frames <spec> --cam both --out <dir>` để render bbox `G#|L#|state` lên raw frame của session bất kỳ (ví dụ hiep2 f1182 với nhãn đầy đủ events, hiep7 f1792). Lưu ý: replay dirs (`idfix_*`) chứa predictions; pixel lấy từ record dir gốc (frame index khớp 1:1 trong full replay).

## ƯU TIÊN THỰC HIỆN
1. **E1** (slide 9 trio — brief bắt buộc "phải có ảnh tối/thường/lóa")
2. **E2a hoặc E2b** (slide 12 failure — brief bắt buộc)
3. **E4** (slide 8 car crop — brief: "phải có hình minh họa thuộc tính xe")
4. **E8c** (clip slide 11 — lifecycle)
5. E3, E5, E6 (nâng chất lượng slide 1/2/6)
6. E7, E8d–g (optional)

## NGUỒN ĐÃ PROBE (cv2 metadata — tất cả 25 FPS, 1280×720 trừ ghi chú)
| Video | Frames | Dur s |
|---|---|---|
| demo_overlap_split.mp4 | 118 | 4.72 (1280×360) |
| demo_tracking_cam1/2.mp4 | 118 | 4.72 |
| session_cam1/2_live.mp4 | 1604 | 64.16 |
| session_full raw/debug | 1842 | 73.68 |
| hiep2 raw/debug cam1/2 | 2340 | 93.6 |
| hiep7 raw/debug cam1 | 2503 | 100.12 |
| hiep8 raw_cam1 | 906 | 36.24 |
| live15 raw/debug cam1/2 | 5730 | 229.2 |
| vd_16 raw/debug cam1/2 | 2445 | 97.8 |
| vd_18 raw/debug cam1 | 276 | 11.04 |
| toi1 raw/debug cam1/2 | 379 | 15.16 |
| bt raw/debug cam1/2 | 1317 | 52.68 |
| live14 raw/debug cam1 | 1055 | 42.2 |
| Q: toi (847f/33.9s), toi2 (1190f/47.6s), sang (1416f/56.6s), thai_s1 (3589f/143.6s), thai_s2 (7893f/315.7s), thai_s3 (8220f/328.8s) | | |
