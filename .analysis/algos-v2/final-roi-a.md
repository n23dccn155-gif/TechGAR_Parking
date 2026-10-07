# final-roi-a.md — Discrepancy check: C QA flag `content/roi.js:25` "cap ≤diag·ratio :2875"

**Kết luận: STALE FLAG — file hiện tại đã sửa (không stamp theo report cũ, đọc trực tiếp).**

## Chứng cứ trực tiếp

- `js/content/roi.js` **mtime 2026-10-04 21:15:06** (sửa cùng đợt reverify C). `js/pages/roi.js` mtime 20:27 — không chứa wording sai.
- Grep toàn file (`js/content/roi.js` + `js/pages/roi.js`): **không còn** `cap ≤diag·ratio`, `≤ diag`, hay `cap` nào sai dấu. Match duy nhất của `≤` là `ov≤0` **bên trong** predicate đúng.

## Wording hiện tại (đã verify với source)

`content/roi.js:25` — sourceRef `svb:509` `signed-distance gate`:
> "gate thật: reject `signed < −diag×initial_ratio ∧ ov≤0` (`:508-509`); `radius=_token_radius` (`:2875-2876`), reject `sd < −r ∧ ov≤0 ∧ ¬ev` (`:3240-3247`), biên `sd=−r` GIỮ; origin `sd < −max 0.85·diag` (`:3237`)"

`limits` (:36) + QA (:39) đồng bộ cùng predicate — kèm phân biệt wakeup mask `:2653-2668` ≠ gate.

## Source verify (đọc lại, không theo dossier)

| cite | source thật | khớp |
|---|---|---|
| `svb:508-509` | `initial_radius = diagonal * recovery_initial_expand_ratio` · `if signed < -initial_radius and overlap <= 0.0: continue` | ✓ |
| `svb:2875-2876` | `radius = self._token_radius(token, timestamp_s)` · `max_radius = token.slot_diagonal * self.recovery_max_expand_ratio` — **dòng tính, không phải predicate** | ✓ (cite đúng vai trò) |
| `svb:3237` | `first_signed < -max_radius → origin_outside_max_gate` | ✓ |
| `svb:3240-3247` | `signed_distance < -radius and original_overlap <= 0.0 and not continuing_candidate → waiting_for_expanding_gate` | ✓ |
| `svb:2653-2668` | `_expanded_polygon` scale `1 + 2·radius/diag` — wakeup mask | ✓ |

## pages/roi.js — quét tương tự

- `:3` comment + `:26` pcode + `:63-64` EXPL: "wakeup mask ≠ signed-distance gate"; mô tả `1+2·r/diag` chỉ gắn **wakeup polygon** — không nơi nào diễn đạt predicate sai.
- Không sửa gì thêm.

## Trạng thái

- File A hiện tại **PASS** cho note này; flag trong `build-wave2-c.md`/QA.md của C viết trước 21:15 → xin C re-grep bản hiện tại (không đọc report).
- Không đụng `build-wave2-c.md`/QA.md/shared files.
