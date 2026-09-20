# Build Report — TechGAR NCKH 13-slide deck

## Deliverable

- **PPTX:** `D:\TechGar2\docs\TechGAR_NCKH_13slides.pptx` (13 slides, 16:9, ~38.6 MB, editable native shapes/groups)
- **Project:** `D:\TechGar2\slides_nckh\build\techgar_nckh`
- **Previews:** `D:\TechGar2\slides_nckh\build\previews\` (13 × 1280×720 PNG, headless-Chrome render of authored SVGs)

## Route / mode / style

- Route: **Generate PPTX — Quick Generate** (`--quick-generate`, flat structure, no spec_lock/spec per profile)
- Mode: `instructional` · Style: `swiss-minimal`
- Canvas: `ppt169` 1280×720 · Language: `vi-VN`
- Typeface: Segoe UI (+Arial fallback) — calibrated via `text_measure.py`; Consolas for code roles
- Icons: single library `tabler-outline` (35 synced)
- Layout rotation per outline: `A→B→C→B→D→C→D→B→D→E→C→E→B` — no two adjacent slides share a family

## Pipeline executed (mandatory order)

1. `SKILL.md` → `attribution_guard.py` (exit 0) → `routing.md` → `quick-generate.md` profile
2. Project init + asset import (30 images + 4 videos) → `text_measure.py` calibration → `icon_sync.py` (25 + 10 icons)
3. Hand-authored 13 SVG pages; native chevron presets via `preset_shape_svg.py` render-batch (S3); 4 native formula markers (`data-pptx-replace-with="formula"` → OMML) on S5/S8×2/S10
4. **Early gate** after P05: `--stage early --canonical-authoring --quick-generate` → first run 6 blocking issues → fixed (bounds/text overflow, icon sync, paragraph runs) → PASS
5. `compact_svg_styles.py --inplace` (canonical normalization, 82 decls)
6. **Final gate**: `--stage final` → **13/13 fully passed, 0 errors, 0 warnings**
7. `notes/total.md` (exact `speaker_notes` from outline) → `total_md_split.py` → 13/13 one-to-one
8. Export: `svg_to_pptx.py --quick-generate -f ppt169 --primary-language vi-VN --with-notes --native-charts-and-tables -o docs\TechGAR_NCKH_13slides.pptx` → postflight **passed**
9. Video post-step (`python-pptx add_movie`, cv2 poster frames):
   | Slide | Clip | Poster frame |
   |---|---|---|
   | 1 | `clip_s01_overview.mp4` (200f/25FPS) | f100 |
   | 7 | `demo_overlap_split.mp4` (118f/25FPS) | f60 |
   | 11 | `clip_s11_park_cycle.mp4` (261f/25FPS) | idx 43 (f543-equivalent, clip ≈ f500–760) |
   | 12 | `clip_s12_failure_depart.mp4` (91f/25FPS) | idx 42 (f1182-equivalent, clip ≈ f1140–1230) |
10. Validation: OPC `verify_internal_relationships` → **0 problems**; `pptx_delivery_check.py` → **status: passed** (13 slides / 13 notes / 31 media parts, timing slides {1,7,11,12})

## Verification of invariants

- Exactly 13 slides; every slide has speaker notes verbatim from outline.
- All session-2808_3 figures tagged `[doc-claimed: session 2808_3]`; tuning values tagged `[design-param]` with file:line.
- Evidence captions say "mô hình bãi đỗ thu nhỏ / scale-model testbed"; no outdoor/real-garage claims.
- Departure Re-ID = "đã triển khai + unit-tested, đang kiểm chứng trên replay"; `hiep2` G#2→G#4 @f1181 shown as documented failure (S11 status band + S12 failure panel).
- Verified numbers only: 1,13 cm / 4,39 cm / 945 cặp · 18/47/110 ms · 120 ms · 3.827 f / 153,08 s / 25 FPS · 169 ms · 19/20 · 88,4% (3.383/3.827) · 25 = 5Δγ×5ΔCLAHE · ≥12/25 · 5 frame · 0.55/0.30/0.10/0.05 · cos θ<0.25 · ≥3 mẫu · ≥2 lần/~1.5 s · token 5 s→≤15 s.
- Vote threshold worded as majority-vote configuration, not "optimized" (no sweep).

## Issues encountered & resolutions

- Chrome `--headless` (legacy) silently failed → used `--headless=new`.
- Bash quoting mangled `--screenshot` path → previews generated via `build/make_previews.py` (Python loop).
- Icon `map-pin` missing from first pool → re-synced with 10 additional icons.
- Outline asset names `slide9_glare_cam1_f0190` / `slide12_glare_context_f0190` → actual files are `..._f0005`; used real files + honest captions.

## Gate-2 minor revision (post-approval fixes)

Manager approved 13/13 spec-check with 6 MINOR points — all fixed **in SVG sources only** (no PPTX patching), then full pipeline re-run.

### Changes applied

| # | Slide | Change |
|---|---|---|
| 1 | S5 `05_homography_mat_san.svg` | `shared_map_full_view.png` → **`roi_full_view.png`**; caption → "Blend 50/50 hai camera trong shared world map — vạch sàn trùng nhau = H1/H2 chuẩn"; blue `#004FFF` border kept |
| 2 | S7 `07_cross_camera_gid.svg` | map panel → **`shared_map_preview.png`**; caption → "Coverage cam1/cam2 + vùng overlap trên shared map — grid 10 cm"; title "SHARED MAP — CÙNG VỊ TRÍ VẬT LÝ" kept; bounds reflowed |
| 3 | S8 `08_topology_cost_matrix.svg` | two-line explainer → single line + **3-case angle pictogram**: cùng hướng `cos≈1` (blue, 2 right arrows) · lệch vừa (gray, 1 flat + 1 angled ~16°) · ngược hướng ⇒ REJECT (red #B91C1C, opposing arrows; rule `cos θ < 0.25` shown on red band above) |
| 4 | S3 `03_pipeline_tong_the.svg` | combined row split → **Cross-Camera** (`2 Local ID cho 1 xe` → `Canonical GID`) + **Matching** (`ghép nhầm` → `Topology + Cost`); mechanism table now 7 rows (baselines 312–528, separators every 36 px); 2 closing notes 15→16 px re-wrapped |
| 5 | S11 `11_lifecycle_parked_reid.svg` | `· mô hình thu nhỏ` appended (as second tspan line) to the 3 stage captions (GID tạo @f278 · Ô D02 đỏ @f543 · Departure @f705); stage bounds expanded; `stage-reid` bounds +8 px for descent margin |
| 6 | Type bump 14/15→16 px (only where it fits) | S1 video-block secondary text; S3 table notes; S4 `parallel-note` group (original wording kept — PIL-measured 257 px ≤ 360 px avail); S12 caveat box + context/failure text (caveat re-wrapped to 5 lines at x=916 after shrinking glare image 284→240 px; header disclaimer moved under rule as single line); S13 roadmap list + limitations |

### Doc consistency

- `outline_13.md`, `outline.json`, `layout_rotation.md`: glare frame refs `f0190`/`f190` → **`f0005`/`f005`** matching real assets `slide9_glare_cam1_f0005.jpg`, `slide12_glare_context_f0005.jpg`; frame-change note added.

### Manager touch-up (S11)

- Manager moved `stage-departure` caption `Departure + trajectory đuôi @f705` y=538 → **y=552** (clears `rời thật → giải phóng ô` at baseline 532). Second tspan then sat at y=570 → content bottom 574.5 exceeded stage bounds (572) by 0.8% → advisory warning.
- Resolution: `stage-departure` bounds extended 326→328 (bottom 574, edge-touching status-band — zero-area intersection, allowed) + tspan `dy` 18→16 (line-2 baseline 568, bottom ~572.5).
- Re-run: gate **13/13, 0 errors, 0 warnings**; previews regenerated; re-export + re-embed OK; delivery check passed; pixel-verified preview — clear gaps above/below caption, no overlap with status band.

### Post-fix pipeline results

- `compact_svg_styles.py --inplace`: 0 changes needed (styles already canonical).
- Final gate `--stage final --quick-generate --canonical-authoring --json`: **13/13 fully passed · 0 errors · 0 warnings** (fresh `svg_quality_report.json`).
  - One transient warning during iteration (S12 header disclaimer 1.5 % vertical overflow) → fixed by raising baseline to y=132.
  - Note: running the checker **without** `--quick-generate` reports a spec_lock/theme-contract error — not applicable to this lockless Quick Generate project (correct flag used; same as initial build).
- Previews regenerated: 13/13 PNG, 1280×720, non-blank; pixel-verified: S5 region = `roi_full_view` (Δ 3.1), S7 region = `shared_map_preview` (Δ 2.1), S8 pictogram blue/red/gray strokes present, S3 = 8 separator lines (7 rows), S11 3 caption line-2s present.
- Re-export: `svg_to_pptx.py --quick-generate --with-notes` → postflight **passed**, 13 slides + 13 notes.
- Re-embedded 4 videos via `embed_videos.py` (positions unchanged — poster spots identical).
- Postflight/package verification: 13 slides · 13 notesSlides · **4 MP4** media parts · `videoFile` rels on slides 1/7/11/12 · **4 native OMML formulas** (S5×1, S8×2, S10×1) · **0 dangling relationships** · `pptx_delivery_check` → errors: [], advisories: [] · package **38.57 MB**.

## Remaining limitations / advisories

- Deck uses fade transition on all slides (exporter default); no per-object animations.
- Video poster frames cover the designed poster/picture spots; playback is click-to-play in PowerPoint.
- `inter` font unavailable on machine → Segoe UI used deck-wide (per calibration decision).
- No stock/web imagery; all media are project-local assets.
