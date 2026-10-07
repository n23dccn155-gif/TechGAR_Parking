# REVIEW track-lifecycle (builder-a, Task 6)

- Verify OK: ctor defaults min_visible 3/ttl 90f/history 10/min_disp 12/reid 720/tracklet 12-3 (:36-50), fragment-scoped monotonic ID + comment chính-xác (:2009-19), TENTATIVE trừ min_visible==1 (:2023), first_observation đóng-băng + comment bounded history (:2041-44), confirm = count≥3 & disp≥12 (priority 2+2obs & 3px, origin=first_observation khi multiscale) (:2071-94), EMA .75/.25 chỉ khi appearance_trusted (:2151-56), ring 8 measurements (:2146-50), frozen_ambiguous/coasting + occluded_prediction (:2278-80), roi_edge_starved sticky + comment GID (:2282-2301), expire invis>90f ∨ lost>4.5s (:2189-2205, :143-52 = 1.5×3.0), CONFIRMED→_exited_tracks vs TENTATIVE im-lặng (:2310-17), output chỉ CONFIRMED∪LOST (:2369), suspend → parked_local_track_suspended (:2175-87).
- Figure verified: lid18 f1404 tentative→f1407 frozen_ambiguous→f1500 confirmed/matched trong predictions.jsonl — caption đúng.
- OK — không vấn đề.
