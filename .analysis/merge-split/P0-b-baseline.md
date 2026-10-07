# P0-b — Dataset kiểm kê + baseline merge/split (THẬT, chỉ đọc)

Công cụ: `backend/main_detect/experiment_test/merge_split_report.py` (MỚI, stdlib, chỉ đọc).
Lệnh: `python merge_split_report.py output/session_* output/reidfix_*_session_* output/runtime_session_bt --json msr-raw.json` → `msr-out.txt` / `msr-raw.json` trong `.analysis/merge-split/`.

**Đơn-vị đếm, không trộn:**
- **[dòng]** — số event-line trong `predictions.jsonl` (`identity_events[].event_type`). `occlusion_group_expired` lặp lại theo frame cho cùng member-set (verified: `{13,14,15}` exp tại f648,659–664 = 7 dòng/1 set, session_thai6) ⇒ [dòng] ≠ số lần kết-thúc.
- **[set]** — member-set riêng (`local_track_ids` tuple). Terminal lặp ⇒ "last-terminal".
- **[ep]** — episode = union member-sets có overlap thời-gian (proxy, xem §5 giới-hạn chain).
- **[GT]** — nearest-anchor heuristic `--match-px 60`; **N/A toàn-bộ dataset** (xem §1).

## 1. Kiểm kê session

| nhóm | số | RAW mp4 | predictions.jsonl | GT csv | replay được |
|---|---|---|---|---|---|
| `session_*` | 18 | ✅ | ✅ | ⚠ header-only | ✅ (doc §6) |
| `runtime_session_bt` | 1 | ✅ | ✅ | ⚠ header-only | ✅ |
| `reidfix_{r0,r0b,r1,r1b}_session_*` | 9 | ❌ | ✅ | ⚠ header-only | ❌ chỉ log |
| `runtime_*` (20) | — | ❌ | ❌ | — | — |

**⚠ BLOCKER benchmark §6:** mọi `ground_truth_*.csv` (identity/events/slots, mọi session) = **1 dòng header, 0 data rows** — verified đọc trực-tiếp. ⇒ Không GT ⇒ **không đo được** ID-switch / false-new-ID / lost-vehicle / fragmentation mà cổng §6 yêu-cầu. Spec §1.2.10 giả-định "có GT" — sai thực-tế. Cần gán-nhãn hoặc pipeline sinh GT trước khi benchmark.

## 2. Baseline merge/split — số THẬT (dedup nguồn-video)

`reidfix_*` là replay-log cùng video với `session_*` → **dedup theo nguồn** (canonical_source, giữ 1 dir `session_*` mỗi video): **20 nguồn, 203 episodes**.

### 2.1 Phân-loại theo semantics đã verify với code (A §7 — og:61,90,100,119-120,131,220)

| kind [ep] | n | expired | recovered | none (censored — không terminal event) | ý-nghĩa |
|---|---|---|---|---|---|
| `implicit-2` (không `opened`, set ≤2) | **138 (68%)** | 137 | 1 | 0 | **UNKNOWN** — watch-group hết-vai hoặc thiếu lịch-sử; **KHÔNG phải bằng-chứng merge** |
| `active-2` (có `opened`, merge-2 thật) | **58 (29%)** | 10 | 1 | **47** | merge-2 thật đã activate; `none` = **censored** (không ghi-nhận terminal — không đủ khẳng-định còn active tới cuối) |
| `ge3-covering` (≥3 member) | 7 (3%) | 6 | 1* | 0 | merge ≥3 thật — *không-thể recover theo thiết kế* (`valid` yêu-cầu len==2) |

*recovered trong ge3 = event cho subset 2-member xen-kẽ.

→ **Số-thô "73.8% expired" của log KHÔNG được đọc thẳng thành lỗi identity**: 68% episode là implicit-2 (đa-phần watch-group, không hề merge). Subset chẩn-đoán đúng = active-2 + ge3 = **65 episode-proxy** (episode có opened/≥3 — **không** phải 65 merge vật-lý độc-lập; union member-set có-thể chain nhiều merge riêng).

### 2.2 Trong 65 episode-proxy merge (active-2 + ge3)
- `recovered` event: **2/65 (3%)** — và per code og:213-220, recovered chỉ trả group về **watch** (`active=False, expires_at=inf`), có-thể re-open (thai6 f648 rec → f652 re-open → f659+ expire: recovery TẠM-THỜI thật).
- `expired` (member mất / quá 3.0s): 16.
- `none` — **censored: log không ghi-nhận terminal event cho episode** (group có-thể còn active, hoặc kết-thúc bằng đường-im-lặng không event — không đủ khẳng-định "47 còn active tới cuối"): **47/65 (72%)**.
- `member_lost_during` (member nhận lost/expired trong cửa-sổ group): active-2 **23/58**, implicit-2 3/138, ge3 1/7.
- **Proxy `new_ids_45f_after`**: local-id mới first-seen ≤45f sau **frame-cuối episode** (bất-kể outcome — KHÔNG chỉ expiry), cùng camera — weak proxy, không bbox: active-2 **43/58**, ge3 **7/7**, implicit-2 87/138. Consistent với "episode chưa-giải → ID mới sinh", nhưng chưa chứng-minh causal và không phân-tách được theo kết-cục.
- Episode rất ngắn: đa-số 0–1 frame (implicit); merge-thật top 11f≈4.1s.

### 2.3 Event phụ [dòng] (thai6)
`split_assignment_deferred` 13 (cost med 0.578 vs margin med 0.148 — near-miss lớn) · `association_recovery_pending` 219 · `new_local_id_deferred_unresolved_merge` 3 · `merged_detection_frozen` 198 · `local_track_lost` 101.

### 2.4 Đối-chiếu `diagnose_identity_churn.py` (thai6)
21 GID / **709 local fragments** (tới 22 fragment/GID) · 53.3% frame 0-gid · `coasting` 69.7% obs · `association_rejected_stale_track` 6886 [dòng]. → churn nặng; 0 case "1 GID trên 2 track >7cm".

## 3. Dataset đủ không? — mức-kết-luận

- Chẩn-đoán spec "merge→hiếm-recovery": **HỖ TRỢ** (2/65 merge-thật emit recovered; 47/65 unresolved tới hết log) — nhưng **CHƯA đủ** để claim improvement (không counterfactual, không GT).
- ID-switch/lost-vehicle thật: **KHÔNG đo được** (GT rỗng) → benchmark §6 **BLOCKED**.
- P5 learned model: **KHÔNG** — 0 nhãn, ~65 merge-event thật → ghi "không khuyến-nghị" đúng §6.
- Replay cờ tắt/bật: 19 nguồn RAW sẵn — đủ chỗ chạy, nhưng so-cải-thiện vẫn cần GT.

## 4. Event đáng regression-test (cho builder-c)

| session | frame | event | loại |
|---|---|---|---|
| session_thai6 | 641–681 | {13,15} open→{13,14,15}exp→{13,15}rec→re-open→exp chuỗi | S4/S8-like, lifecycle đầy-đủ |
| session_thai6 | 686–727 | {11,12,13}→{15..22} 6-member | chain-merge lớn |
| session_thai6 | 2191,3164 | birth-veto {44,49},{203,210} | S9-like new-ID suppression |
| session_thai6 | 1128,2192 | split_deferred cost.38/.58 vs margin .14 | near-miss margin |
| session_hiep_thai3 | 171,1119 | recovered {18,21},{47,48} | 2 case recovery hiếm |
| session_test1 | 97–108 | {59,111,116},{59,108,116,136} | ≥3-member |
| session_hiep_sang7 | 614–617 | {46,47,48} exp | ≥3 expire điển-hình |

## 5. Giới-hạn (ghi rõ)
- **Union member-set có-thể chain** các merge vật-lý riêng qua member chung → 1 episode có-thể >1 merge thật; không tách được từ log.
- `implicit-2` không phân-biệt được watch-group-vs-thiếu-log; `none` = **censored** (log không ghi terminal — không khẳng-định group còn active tới cuối; active-group chỉ có 2 đường-ra có-event og:65 expire / og:220 recovered→watch, watch-group xóa lặng og:100).
- `new_ids_45f_after` tính từ **frame-cuối episode** (mọi outcome, không riêng expiry), cùng camera, không bbox/proximity — proxy yếu, chỉ gợi-ý.
- "65" đếm episode-proxy có `opened` hoặc ≥3-member — **không** tương-đương 65 merge vật-lý độc-lập (union-chain có-thể gom nhiều merge riêng).
- ID-metrics GT **chưa verify** (csv rỗng); fps lấy `processing_fps` (4–8, ≠ fps camera).
- 5 file `.log` match glob báo no-predictions — không phải session.
- **Đề-nghị A verify** (đã được trả-lời §7): implicit/none semantics — ĐÃ ĐÓNG, kết-quả kind table §2.1 dùng đúng semantics đó.

## 6. Câu-hỏi mở cho LEAD/user
- GT trống ở mọi session — user có ý-định gán-nhãn, hay benchmark §6 phải tự ghi GT từ video? (hiện BLOCKED)
- `implicit-2` 138 episode = nhiễu log lớn: nên thêm event nhẹ cho watch-group lifecycle? (đề-xuất cho DESIGN P1, không phải B quyết)
