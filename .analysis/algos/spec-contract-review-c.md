# spec-contract-review-c — Review hợp đồng `algo-web/SPEC.md` (builder-c, Phase 1 cuối)

Phạm vi: CHỈ contract — schema lesson, trace/draw env, classic-script order, hash+alias, phân quyền 3 pack, QA gate. Không đọc lại source, không đề xuất đổi nội dung 117 ID, không viết web/index/js/css/QA script.

## Verdict: **READY — không blocker API**

Contract đủ chặt để 3 pack triển khai độc lập + builder-c ghép engine/QA mà không phải đoán API. Các điểm dưới đây là **làm rõ nhỏ** (clarification), không phải blocker — giữ API hiện tại.

## Kiểm tra theo mảng contract

| Mảng | Kết quả | Chi tiết |
|---|---|---|
| Catalog/đếm | OK | Đếm tay: frontend 37 + cv 57 + integration 23 = **117 canonical**; 6 alias; `replay-session-sync` đúng vắng khỏi canonical cv (chỉ là alias → `replay-timestamp-pairing`). 23 ID integration khớp 1-1 dossier C đã duyệt. |
| Script order | OK | `engine→frontend→cv→integration→app`, classic + `defer` giữ thứ tự trên cả file:// và http://; `window.TechGarAlgo` + `registerPack` trước khi pack load; app.js sau cả 3 register. Không dynamic import/fetch boot → file://-safe đúng claim. |
| Phân quyền file | OK | a=`packs/frontend.js`+README-frontend; b=`packs/cv.js`+README-cv; c=`index.html`/`styles.css`/`shared/engine.js`/`app.js`/`packs/integration.js`/`README.md`/`QA.md`/`qa-results.json`/`qa/`. Không overlap; đổi API chung → báo LEAD trước (`§3`). |
| Schema lesson | OK | Mọi field dossier map đủ: Nhóm→`topic`, Vai trò→`role`, Input/Output→`inputTypes`/`outputTypes`, Cấu trúc→`structures`, Độ phức tạp→`complexity{time,space,variables,simulation}`, Code→`codeRefs{path,line,endLine,symbol,note}`, Edge→`edgeCases`, `[sim-omits]`→`simplifications`, Liên quan→`related`, Sample+Expected→`scenarios`, Storyboard→`scene`/`draw`. |
| Trace contract | OK | `{frames,result,expected,checks}`; frame có `id/activeLines/explanation/state/metrics/scene/durationMs`; ≥3 frame, checks **tính thật** không hardcode pass — khớp triết lý fixture của dossier C (expected = output đã verify, nên scenario bug-teaching vẫn pass vì expected là hành vi code thật). |
| Draw env | OK | `{width,height,progress,previousFrame,palette,reducedMotion}` — engine lo resize/DPR/reset transform; draw không tạo timer/DOM; `previousFrame` nullable được khai báo. |
| Hash/alias | OK | `#/` + `#/algo/<id>`; alias → canonical + thông báo; id tồn tại sai → thông báo VN. Alias chỉ qua field `aliases` của canonical lesson (toàn bộ 6 alias thuộc integration — đúng phân quyền §2). |
| Fixture/units §4 | OK | Dossier C đã tuân thủ: ISO-time/numeric offset (không `T+`), ≤10 objects, mask 8×8/12×8, không token thật. Infinity→null/sentinel rule khớp. |
| Source links | OK | `../<path>#L<line>` resolve đúng cả file:// (từ algo-web/) và http **serve project root** (QA §9-1 bắt buộc root-serve → nhất quán); §10 đã ghi caveat serve riêng algo-web → link chết. Anchor chỉ mở khi click → không sinh 404 asset. |
| §8 pinned | OK | C1–C5 chỉ đích `occupancy-correction-c.md` v1.1; peer-review artifacts `cv-crosscal-review-c.md`, `cv-source-review-a.md`, `cv-motion-binder-review-a.md` được dẫn đúng. |
| QA gates §9 | OK | 9 mục khả thi: file:// + http root-serve, đếm 117/6/3pack, per-scenario checks, controls, console/pageerror, 390px, screenshots, QA.md+qa-results.json (no-PASS-nếu-chưa-chạy). Playwright 1.62 + chromium-1234 có sẵn trong `frontend/node_modules` (đã probe trước, không install). |

## Clarification nhỏ — không block, nên pin trong README/engine khi build

1. **`scenarios[].edgeCase` chưa ghi type** — hiểu ngầm boolean flag phân biệt default/edge (QA §9-3 đòi render cả hai). Pin `edgeCase:boolean` trong README/engine validation cho đồng nhất 3 pack.
2. **`trace.expected` vs `scenario.expected` trùng field** — nên pin `trace.expected === scenario.expected` (hoặc engine override) để tránh trôi giữa metadata và checks.
3. **`pseudocode.id` format** — pack tự đặt (gợi ý `p1..pn`); `activeLines` phải ⊆ ids — engine validate đã được QA §9-3 cover.
4. **Params persist hay reset khi đổi scenario** — §7 chỉ nói rebuild+frame0; engine-owned, chọn 1 chính sách và ghi README (UX, không API).
5. **`draw` nhận `frame.scene`** — scene-shape do pack định nghĩa (đã ghi "object do pack định nghĩa"), đủ; pack tự chứa helper (§5: "không dựa helper chưa đặc tả từ engine").

## Giới hạn review

- Review tĩnh SPEC vs dossier C/schema; không kiểm lại source production, không validate JSON từng scenario của A/B pack.
- Phán đoán "không blocker" dựa trên surface API `registerPack` + lesson/trace/draw — phần engine internals do chính builder-c viết nên rủi ro mismatch chéo owner tối thiểu.
- Playwright/browser chỉ probe tồn tại, chưa launch; QA thực thuộc Phase sau.
