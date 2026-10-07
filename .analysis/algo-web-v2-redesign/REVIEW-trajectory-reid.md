# Review: trajectory-reid (builder-b) — reviewer: builder-c, 2026-10-06

OK — không vấn đề nghiêm trọng.

- Spot-check: score = 0.35·cor+0.25·app+0.15·dir+0.10·spd+0.10·min(tt,topo)+0.05·size khớp trajectory_memory.py:395-402 (đọc trực tiếp); match_threshold 0.78, margin 0.12 khớp cross_camera_manager.py:450-452.
- Ca sang8 f600: subst thật 0.35×0.9445+0.25×0.8331+0.15×0.0015+0.10×0.9708+0.10×0+0.05×0.6437=0.6683 <0.78 — tôi từng tái hiện chính case này trong gid-reacquire, khớp.
- 3 hard reject (teleport/topology/wrong-direction) khớp code L390-393; defer plausible 0.30/0.65/0.6·16.218/tt≥0.75 có cite :7073-7081.
- min(time,topology) trong code đúng là min(time_score, topology_score) — trang viết "min của time và topology" đúng.
- recent_window = handoff_ttl/fps thực (:5274-5288) — nhất quán với hiểu biết của tôi về dormant pass.
