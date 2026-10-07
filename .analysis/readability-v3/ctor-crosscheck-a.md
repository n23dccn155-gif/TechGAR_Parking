# CTOR CROSSCHECK — A (readonly) · phân-định mâu thuẫn B↔C

**Câu hỏi:** tc:2387-2388 nằm trong ctor nào — C nói *CrossCameraManager*, B nói *MotionVehicleTracker*?

## Đọc trực tiếp `backend/main_detect/two_camera.py`

| tc line | code thật | context ctor | param | arg source | runtime value | class default |
|---|---|---|---|---|---|---|
| **2227** | `manager = CrossCameraManager(` | mở CCM ctor | — | — | — | ccm ctor ccm:… |
| **2248** | `tracklet_gallery_size=args.global_gallery_max_samples` | **trong CCM ctor** | `tracklet_gallery_size` | `--global-gallery-max-samples` | **24** (tc:1967) | ccm:162 `=24` ✓ |
| 2365 | `trackers = {` | dict comprehension | — | — | — | — |
| **2366** | `camera_id: MotionVehicleTracker(` | mở MVT ctor | — | — | — | mt ctor |
| **2387** | `tracklet_max_samples=args.tracklet_max_samples` | **trong MVT ctor** | `tracklet_max_samples` | `--tracklet-max-samples` | **12** (tc:1965) | mt:50 `=12` ✓ |
| **2388** | `tracklet_sample_interval=args.tracklet_sample_interval` | **trong MVT ctor** | `tracklet_sample_interval` | `--tracklet-sample-interval` | **3** (tc:1966) | mt:51 `=3` ✓ |

Ngữ cảnh bao quanh xác nhận: 2227-2260 toàn tham số `handoff_*`/`identity_retention_*`/`dormant_*`/`trajectory_history_seconds` (thuộc manager xuyên-camera); 2366-2388+ toàn `motion_*`/`lost_track_ttl`/`min_visible_count`/`reject_cast_shadows` (thuộc tracker cục-bộ).

## Semantics sử dụng (verify consumer)

- `tracklet_gallery_size` → **gallery TOÀN CỤC xuyên-camera**: `cross_camera_manager.py:267` (ctor gán), ccm:446/551/573-574/585/1276 (append/cap gallery dùng cho match GID).
- `tracklet_max_samples` + `tracklet_sample_interval` → **tracklet CỤC BỘ mỗi camera**: `motion_tracker.py:201-202` (ctor gán), mt:2030-2031 (`max_samples=`/`sample_interval=` khi tạo tracklet).
- Nhất quán kích-thước: local 12 mẫu / mỗi 3 khung (nhẹ, mỗi vết), global 24 mẫu (gallery lớn hơn cho ReID xuyên-camera) — semantics hợp lý.

## Verdict

| claim | ai | đúng/sai |
|---|---|---|
| "tc:2387-2388 trong **CrossCameraManager** ctor; tracker ctor ở 2248" | C FINAL sourcecheck | **SAI** — đảo ngược hai ctor |
| "CrossCameraManager mở **tc:2227**, `tracklet_gallery_size` ở **2248**; MotionVehicleTracker mở **tc:2366**, `tracklet_*` ở **2387-88**" | B canonical-audit-b §6 | **ĐÚNG** |

**Metadata-B (canonical-audit-b §6) được xác nhận đúng.** C nên sửa mapping ctor: 2227=CCM (gallery 24), 2366=MVT (tracklet 12/3) trước khi facts đó xuất hiện trong Deep/shared docs. A không sửa file B/C — chỉ crosscheck readonly.

*Phương pháp: đọc `two_camera.py:2227-2260` + `2360-2395` + args tc:1965-1967 + ctor defaults `ccm:162`, `mt:50-51` + call-sites sử-dụng `ccm:267…1276`, `mt:201-202,2030-2031`.*
