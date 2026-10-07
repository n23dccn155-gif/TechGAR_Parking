# Tool C — make_sheets.py (V4 contact sheets, dùng chung A/B/C)

File: `backend/main_detect/experiment_test/verify/make_sheets.py` (mới, owner C).
Chạy bằng `.\.venv\Scripts\python.exe` từ `backend\main_detect\`. Read-only trên
input; chỉ ghi vào `--out`. Không quét `.venv`/`output` đệ quy — mọi đường dẫn
phải chỉ định tường minh.

## Ô ảnh

Mỗi cell = frame GỐC `raw_camN.mp4` + overlay:

- ROI polygon hiện tại (vàng), slot polygons hiện tại — xanh=free / đỏ=occupied
  theo `record.slots` của frame đó / xám=khi chưa có record;
- bbox mỗi observation của cam, màu theo `association_state` (kế thừa
  `render_gid_frames.state_color`), nhãn `G#<canonical_gid>|L<local>|<state>`;
- caption `camN f<idx> t=<giây>s` + tối đa 3 `identity_events` event_type.

⚠️ Overlay slot/bbox vẽ từ predictions của `--session` trỏ tới: nếu `--session`
là dir gốc thì trạng thái là của RECORD cũ, không phải kết quả replay current —
chỉ dùng `verify_cur_*` cho phán quyết chiến dịch.

## CLI

```powershell
.\.venv\Scripts\python.exe experiment_test\verify\make_sheets.py `
  --session experiment_test\output\verify_cur_<SESSION> `   # predictions.jsonl
  --video-dir experiment_test\output\<SESSION> `            # raw_cam1/2.mp4
  --cam both --grid 3x3 --cell-width 640 --quality 85 `
  --every 2.0 `                                            # mẫu đều ≥1f/2s/cam
  --windows-file ..\.analysis\verify-replay\flags\<SESSION>.jsonl `
  --out ..\.analysis\verify-replay\sheets\<SESSION>
```

Chọn frame — kết hợp tự do, union + clamp vào [1, frame_count]:

| cờ | nghĩa |
|---|---|
| `--frames "1,990-1000"` | chỉ định trực tiếp (1-based, giống render_gid_frames) |
| `--every 2.0` | mẫu đều: 1 frame mỗi N giây video **mỗi cam** (idx=1+round(k·N·fps)) |
| `--windows "120,480-500"` | tâm (→±`--window-pad` 15) hoặc range nguyên |
| `--windows-file FILE` | xem schema bên dưới |
| `--window-step 5` | bước lấy mẫu trong cửa sổ (mặc định 5) |

`--config-dir` mặc định `backend/main_detect/config` (config hiện tại — đúng
chiến dịch). `--no-overlay` bỏ mọi lớp vẽ (xem frame thô). `--cam 1|2|both`.

## `--windows-file` schema (contract với TOOLS-A)

Chấp nhận 3 dạng, auto-detect. **Tất cả đều là span THÔ** — tool tự
`pad ±--window-pad` (mặc định 15) rồi **gom span chồng/gần** (gap ≤
`--merge-gap`, mặc định 0) thành 1 cửa sổ theo §4, rồi mới lấy mẫu
`--window-step`:

1. **JSONL cờ V3** (`scan_frames.py` output, `flags/<session>.jsonl`):
   mỗi dòng `{"type":..,"cam":..,"frame_from":a,"frame_to":b,..}` → span
   `[frame_from, frame_to]` **thô — A chưa pad** (xác nhận qua source:
   `Flagger.add(f0,f1)` ghi interval phát hiện nguyên trạng).
   Lọc theo type/cam nếu cần: pre-filter bằng jq/python trước khi truyền.
2. **JSON list**: `[{"start":a,"end":b}, n]` — dict=range, số=span 1 frame.
3. **Text**: mỗi dòng `a-b` hoặc `n`; `#` comment.

Ví dụ merge thật: 1485 span thô của `session_thai6` → pad±15 → **28 cửa sổ**
→ 916 frame mẫu (step 5). stdout in danh sách cửa sổ đã gom để đối chiếu
coverage.

## Base frame (đã xác minh — không off-by-one)

`frame_idx` trong `predictions.jsonl`/`frame_timestamps.csv` là **1-based** và
khớp chỉ số video: session_thai8 → first=1, last=1952 = CAP_PROP_FRAME_COUNT.
Tool đọc `raw_camN.mp4` bằng `frame_idx-1` (kế thừa `render_gid_frames`),
đúng chuẩn.

## Cohort V1 (đầu vào chính thức)

Chỉ xử lý dir `experiment_test/output/verify_cur_session_<name>` có kết quả
**FINISH/PASS trong `V1-replay-results.md`** của B. KHÔNG dùng:
`verify_cur_test1` (pilot interrupt 236/298), `verify_cur_rt_*` (pilot rt),
`verify_cur_runtime_*` (runtime aux dirs). `--video-dir` trỏ dir record gốc
(`output/session_*`) vì replay chạy `--no-session-video`.

## Output

- `sheet_NNNN.jpg` — lưới `cols x rows` cell (`--cell-width` px, JPEG q85);
  thứ tự cell = frame tăng dần, cam1 trước cam2 mỗi frame (V4 "xem dày" cần
  giảm `--window-step`, xem rải tăng).
- `index.json` — `[{sheet, cells:[{frame_idx, cam, has_record}]}]` để V5
  trích dẫn `sheet → cell → frame` và tính coverage thật.

## Ví dụ dùng

```powershell
# V4 review một session sau khi có flags:
--session output\verify_cur_s8 --video-dir output\session_thai8 `
  --windows-file flags\session_thai8.jsonl --every 2.0

# V2 nhanh (frame đầu + giữa, overlay config):
--session output\<S> --frames "1,<mid>" --cam both --grid 2x2
```

Lưu ý: "12 frame/phút" trong MEGAPLAN §4 là lệch số học (25fps ⇒ 1f/2s = 50
frame; 12f/min ≈ 1f/5s). Dùng `--every 2.0` cho sàn tối thiểu đúng chỉ đạo.
