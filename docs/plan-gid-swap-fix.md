# Plan: Fix GID Swap Bug - Two Vehicles Close Together

## Bug Scenario

```
2 xe đỗ gần nhau → chung GID → di chuyển → ReID lấy nhầm ID
→ Xe A lấy GID xe B → Xe B mất GID → Frontend hiển thị sai
```

## Root Cause

1. **Motion tracker merge nearby blobs** - Khi 2 xe đỗ sát nhau, foreground blobs có thể merge thành 1 detection
2. **LAPJV split assignment lỗi** - Khi vehicles tách ra, assignment có thể nhầm
3. **ReID appearance matching thất bại** - Xe tương tự (cùng màu) có histogram gần giống nhau
4. **Frontend không validate GID stability** - Khi GID thay đổi, frontend không phát hiện

## Technical Analysis

### Backend Safety Mechanisms (đã có)
- `provisional_since_frame` - new identities start provisional, must survive `merge_probation_frames` (5 frames)
- `_check_merge_collision_risk()` - blocks merge if both identities are mature/active
- Sticky ID in `SlotVehicleBinder` - vision-occupied slots keep vehicle_id
- `split_assignment_margin` - lineage-based margin adjustment

### Problem Areas
1. `cross_camera_manager.py` - ReID `_match_pending_handoffs()` fail on similar vehicles
2. `tracklet_descriptor.py` - histogram similarity threshold too low
3. `App.tsx` - no GID stability validation

## Solutions

### Option A: Backend Fix (P0 - Primary)

**A1. Add Spatial Consistency Check Post-ReID**
```python
# After appearance + size + direction cost
position_delta = np.linalg.norm(candidate.world_pos - predicted_world_pos)
spatial_cost = position_delta / max_distance_threshold
```

**A2. Increase Appearance Distance Weight**
- For close vehicles, appearance similarity alone is insufficient
- Increase appearance_weight in `_candidate_cost()` from 0.30 to 0.45
- Reduce position_weight from 0.55 to 0.40

**A3. Add Velocity Consistency**
- Track vehicle velocity from slot
- On departure, predict next position
- Reject ReID matches where velocity direction contradicts

### Option B: Frontend Fix (P1)

**B1. GID Change Detection**
- Cache last known GID from runtime snapshot
- On GID change, validate against `session.globalVehicleId`
- If mismatch, display warning and use last valid position

**B2. Position-Based Fallback**
- If GID changes, fallback to position-based matching
- Match by proximity to last known position

**B3. Session-Level GID Lock**
- When session enters PARKED, lock the GID
- Frontend ignores GID changes from runtime after lock

## Diagnostic Tools Available

### `diagnose_identity_churn.py`
```bash
python diagnose_identity_churn.py <session_dir> [--body-length-cm 7.0]
```
- `split_identity_rows` = frame where 1 GID is on 2 tracks > body_length_cm apart = **IDENTITY ERROR**
- `global_id_created/merged/recovered` events
- `dormant_global_id_recovered` với appearance_distance

### `validate_session.py`
```bash
python validate_session.py --session <session_dir>
```

### `evaluate.py`
```bash
python evaluate.py session_a session_b --fps 25
```
Session FAIL nếu có GID assignment error → điểm ≤ 49/100

## Setup Required

### Step 1: Create Python venv
```powershell
cd D:\TechGar2\backend\main_detect
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Step 2: Record test session
```powershell
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe runtime_server.py `
  --cam1-video "experiment_test\raw_cam1.mp4" `
  --cam2-video "experiment_test\raw_cam2.mp4" `
  --slots-cam1 "config\parking_slots_cam1.json" `
  --slots-cam2 "config\parking_slots_cam2.json" `
  --calibration "config\calibration.json" `
  --mask-cam1 "config\roi_mask_cam1.json" `
  --mask-cam2 "config\roi_mask_cam2.json" `
  --output-dir "experiment_test\output\test_gid_swap" `
  --session-dir "experiment_test\output\test_gid_swap" `
  --identity-retention-seconds 60 `
  --no-display
```

### Step 3: Run diagnostic
```bash
python diagnose_identity_churn.py experiment_test/output/test_gid_swap
```

### Step 4: Identify exact frame of GID swap
- Look for `split_identity_rows` in output
- Frame where 1 GID on 2 tracks > 7cm apart

## Implementation Plan

### Phase 1: Setup (User does)
- [ ] Create venv: `python -m venv .venv`
- [ ] Install dependencies: `.venv\Scripts\python.exe -m pip install -r requirements.txt`
- [ ] Record test session from videos
- [ ] Run diagnostic to confirm bug

### Phase 2: Backend Fix (Pi agent)
Files to modify:
- `src/techgar/cross_camera_manager.py`
- `src/techgar/tracklet_descriptor.py`

**Step 2.1:** Add spatial consistency in `_candidate_cost()`:
```python
# Weight: 0.40 * spatial + 0.45 * appearance + 0.10 * size + 0.05 * direction
```

**Step 2.2:** Add temporal consistency in `_match_pending_handoffs()`:
```python
# Track matches across frames, require >80% of window agree
```

### Phase 3: Frontend Fix (Pi agent)
Files to modify:
- `src/adapters/runtimeAdapter.ts`
- `src/app/App.tsx`

**Step 3.1:** Add GID stability check:
```typescript
// In runtimeAdapter.ts
if (vehicle.global_id !== lastKnownGid) {
  // Validate against session.globalVehicleId
}
```

**Step 3.2:** Position-based fallback:
```typescript
// If GID mismatch, find vehicle by proximity
```

### Phase 4: Testing
- [ ] Re-record test session with fix
- [ ] Verify no GID swap in test scenario
- [ ] Run existing test suite
- [ ] Performance test (no regression)

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `cross_camera_manager.py` | Spatial + temporal consistency | P0 |
| `tracklet_descriptor.py` | Tune distance weights | P0 |
| `runtimeAdapter.ts` | GID stability layer | P1 |
| `App.tsx` | GID change warning UI | P1 |
| `diagnose_identity_churn.py` | Enhanced logging | P3 |

## Priority Order

1. **P0 (Critical):** Backend spatial consistency check - prevents GID swap at source
2. **P1 (High):** Frontend GID stability - graceful degradation if swap occurs
3. **P2 (Medium):** Temporal consistency window - reduces false positives
4. **P3 (Low):** Enhanced logging for future diagnostics
