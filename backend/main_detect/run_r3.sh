#!/usr/bin/env bash
# Replay round 2: all 9 sessions through FIXED code (live main_detect)
# under per-session recovered calibrations. Baseline = idfix_era_* dirs.
set -u
MAIN="D:/TechGar2/backend/main_detect"
PY="$MAIN/.venv/Scripts/python.exe"
OUT="$MAIN/experiment_test/output"
CAL="$MAIN/experiment_test/recovered_cal"
SESSIONS="droidcam_shared_bt droidcam_shared_hiep2 droidcam_shared_hiep7 droidcam_shared_hiep8 droidcam_shared_live15 droidcam_shared_toi1 droidcam_shared_vd_16 droidcam_shared_vd_18 droidcam_live14"
cd "$MAIN" || exit 1
running=0
for s in $SESSIONS; do
  (
    "$PY" -u two_camera.py \
      --replay-session "$OUT/$s" \
      --session-dir "$OUT/idfix_r3_$s" \
      --output-dir "$OUT/idfix_r3_runtime_$s" \
      --slots-cam1 config/parking_slots_cam1.json \
      --slots-cam2 config/parking_slots_cam2.json \
      --calibration "$CAL/$s/calibration.json" \
      --no-session-video --no-display --opencv-threads 1 \
      > "$OUT/idfix_r3_$s.log" 2>&1
    echo "DONE $s exit=$?"
  ) &
  running=$((running+1))
  if [ "$running" -ge 3 ]; then wait -n; running=$((running-1)); fi
done
wait
echo "ALL_R2_DONE"
