# Fleet Ledger — TechGAR NCKH 13-slide deck
Spec: docs\TechGAR_13_Slides_Final_Brief.md | Output: docs\TechGAR_NCKH_13slides.pptx

| Agent | Task | Status | Evidence | Notes |
|---|---|---|---|---|
| R1 number-truth (2253376b) | Verify so lieu + nguon tham so + mau thuan | **terminated (~100 phut no output)** -> manager tu verify | research/verified_numbers.md (manager-authored) | KEY: equalizer that = 5x5=25 variants, vote >=12/25 (KHONG 5/9); gamma base 2.5-2.8; 48,4% -> 88,4% typo; token 5s OK; arrival 3 mau OK; vision 2x/~1.5s; cost weights @ccm:3095 OK; homography/skew/3827f/169ms/19-20/1714 = DOC-CLAIMED session 2808_3 (khong tren o) |
| R2 asset-scout (ca4d2bde) | Asset map per-slide + extraction jobs | **done** | research/asset_map.md, extraction_jobs.md, probe/ (~35 frames) | KEY: footage = scale-model testbed (khong phai bai xe that); dataset 3827f khong tren o; failure "loa den" khong truy duoc -> documented fail = hiep2 G#2->G#4 @f1181 / hiep7 split @f1791 |
| W academic-structure (b6c10055 -> W2 08f2711d reconcile) | outline_13.md + outline.json + layout_rotation | **done** | outline/ (13 slides, JSON valid, rotation A B C B D C D B D E C E B) | scale-model phrasing dung; failure=hiep2 G#4; numbers tagged -> can reconcile voi verified_numbers.md truoc GATE 1 |
| A1 assets s1-6 | agent died silent (RAM) -> manager tu san xuat | **done** | assets/ (7 file) + assets_manifest.json | slide1 annotate, s2 pair, s6 trio, clip_s01 |
| A2 assets s7-13 (d1d1d60b) | **done** | assets/ (10 file) | trio s9, failure s12, car crop, slot closeup, clip_s11+s12 |
| B deck-builder (0f08b8f5) | ppt-master Quick Generate route | **done** | docs\TechGAR_NCKH_13slides.pptx (40.7MB, 13 slides, editable) + build/techgar_nckh/svg_output (13 SVG) + build/previews (13 PNG) + build/build_report.md | 4 video embed dung slide 1/7/11/12 (media1-4.mp4 verified trong zip); postflight passed 0 err 0 warn; notes 13/13; OMML formulas S5/S8/S10; font Segoe UI (Inter ko co tren may) |
| Q spec-checker (b82b1d5f) | checklist muc 17 per-slide vs brief + outline + verified_numbers | **done — 13/13 PASS, 0 blocking, 6 minor** | qa/spec_check_report.md | manager da verify vat ly: media1-4.mp4 dung slide 1/7/11/12; oMath S5=3 S8=6 S10=3 |

## GATE 2 — manager inspect previews (da xong)
- 13/13 PNG da soi: dung narrative, dung so lieu da verify (25 variants, >=12/25, ~1.5s, 5s->15s, 88.4% khong phai 48.4%, weights 0.55/0.30/0.10/0.05, cos<0.25), captions scale-model trung thuc, failure hiep2 G#2->G#4 @f1181 dung, gioi han phat bieu day du, closing line dung spec.
- User duyet GATE 2 theo huong A: sua 6 minor roi GATE 3.

## GATE 2 rework (builder resume) — DONE
- S5: anh -> roi_full_view.png (50/50 blend, bo nhan DIAGNOSTIC); S7: anh -> shared_map_preview.png (coverage cam1/cam2/overlap)
- S8: them pictogram 3-case huong (cung huong cos~1 / lech vua / nguoc huong => REJECT)
- S3: tach thanh 7 rows (Cross-Camera | Matching rieng) dung spec
- S11: caption stage them ". mo hinh thu nho"; S1/S3/S4/S12/S13: font phu 14/15 -> 16 co chon loc
- outline_13.md/outline.json: glare f0190 -> f0005 (khop asset that)
- Manager fix them: S11 caption y538->552 (overlap moi phat hien) -> builder re-export
- Ket qua: final gate 13/13 pass 0/0; delivery check pass; pptx 38.57MB; videos S1/S7/S11/S12; OMML S5x1 S8x2 S10x1; 0 dangling rels

## GATE 3 — final state: PASS, ban giao docs\TechGAR_NCKH_13slides.pptx

## Manager notes
- Outline W dung so lieu brief (5/9, gamma 0.65/1.4, "2 lan/3s") — phai reconcile theo verified_numbers.md truoc khi build (sua slide 9/10/11).
- GATE 1 se trinh: outline + asset_map + verified_numbers + 2 quyet dinh narrative can user duyet (scale-model caption; sua 9/5-9 thanh 25/12-25).