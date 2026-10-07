# build-wave1-a.md — Báo cáo W1 Builder A

## Trạng thái: CONTENT-READY, chờ CONTRACT.md (C publish)

## Đã làm
1. Đọc `algo-web-v2/SPEC.md` bản **APPROVED_FOR_BUILD** + `REVIEW-CHECKLIST.md` + `PROGRESS.md`.
2. `build-needs-a.md` hoàn tất (đã gửi trước) — canvas/HUD/interaction/API cho 10 trang.
3. **11 content dataset** tại `.analysis/algos-v2/content-a/<id>.json` — JSON-serializable, đúng shape SPEC §4 (`id/title/tier/nodes/problem/does/role/where/why/steps/sourceRefs/realParams/storyboard/qa/certainty`):
   - T1 (5): roi, motion, kalman, coasting, assignment
   - T2 (5): brightness, shadow, echo, track-lifecycle, occlusion
   - T3 (1): **routing** — chuyển từ C, dùng dossier C đã peer-PASS (off-route callsite **80px** `App.tsx:746-750` vs lib default 75 `voiceGuidance.ts:98`; freshRoute **mỗi tick vô điều kiện** `:753-758`, speak chỉ gate `:760-762`; heuristic `min(edge.distance/euclid)` `routeEngine.ts:38-47`)
4. Mọi param có `scope` (runtime/default/config) + `ref` file:dòng; số scene đánh `[minh họa]`; OFF/ON cùng cảnh/seed cho T1/T2; không tái dùng ví dụ cũ đã bị trả (ma trận LAPJV dùng bản sửa: greedy 1.15 vs global 0.75 cùng ma trận [0.30,0.50;0.25,0.85]).
5. Verify JSON: 11/11 parse OK; mỗi file ≥4 keyframes, 2 scenarios, steps 3-7 (kalman 5, brightness 4 — trong range), QA 2-3, refs ≥2.

## Chưa làm (theo rào)
- `js/content/<id>.js` + `js/pages/<id>.js`: **chờ CONTRACT.md** — registry shape chưa publish, không tự tạo API riêng (LEAD: "trước contract viết plan/dataset own vào analysis").
- Mount/implementation pages: chờ C API stable (W2).

## Nhu cầu gửi C qua LEAD (từ build-needs-a.md §4)
- `view.mode ∈ {off,on,both}` cho draw (OFF/ON là cốt lõi dossier).
- Primitives bổ sung: mask/ellipse/path/badge/gauge/grid (ngoài 7 có sẵn) — hoặc expose raw ctx2d.
- `state` phẳng per-keyframe → shell render HUD tự động (cần cho `association_state`/`observation_kind`/`prediction_source` — đã verify `mt:2268-2280`).
- `sourceRefs.excerpt/excerptStart` cho viewer trích đoạn.
- Scenario selector (≥2/trang) + glossary anchor từ content.

## Blockers
- Không. Dataset sẵn sàng wrap thành js/content ngay khi CONTRACT publish.

## Ghi chú bám SPEC
- `realParams.scope` dùng {runtime, default, config} theo §4; `minh_hoa` ghi trong caption/state annotation chứ không vào value.
- Routing tier T3 vẫn có OFF/ON (direction guard) vì dossier C storyboard có — giữ ý nghĩa cơ chế, ghi giả-lập rõ.
