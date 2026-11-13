# TechGAR — Smart Parking & In-Parking Navigation

Stack: React + TypeScript + Vite + Zustand + Canvas (`frontend/`); Python 3.11 + OpenCV + NumPy + lap, stdlib HTTP (`backend/`).
Flow: `backend/main_detect/runtime_server.py` (:8001) → `backend/gate_session_controller.py` (:8000) → frontend canvas.

## Layout
- `frontend/src/` — app; routing in `routing/routeEngine.ts` + `laneGraph.ts`; state in `stores/parkingStore.ts`
- `backend/main_detect/` — tracking runtime, `config/`, `tests/`, venv at `.venv`
- `docs/` — architecture & algorithm docs. Ignore `.analysis/`, `_snap/`, `.publish/`, `slides_nckh/` (artifacts).

## Verify
- Frontend (in `frontend/`): `npm run lint`, `npm run build`, `npm test`
- Backend (in `backend/main_detect/`): `.\.venv\Scripts\python.exe -m pytest -q`

## Rules
- TS: functional components, typed props; global state via Zustand; canvas in rAF loops.
- Python: PEP 8, type hints; release OpenCV captures / `cv2.destroyAllWindows()` on exit.
- Commits: clear Vietnamese or English, e.g. `fix: lỗi swap ID camera 2`.

## Reading files (token discipline)
- Grep/search first; read with `offset`/`limit`, not whole files.
- Don't re-read a file already read this session unless it changed.

## Pointers (read only when needed)
- Architecture, run commands, manual test checklist: `docs/ARCHITECTURE.md`
- Session-by-session runtime/replay commands: `backend/main_detect/docs/lenh-chay-theo-session.md`
- Multi-agent work: team Orca (`~/.claude/TEAM_ORCA.md`); briefs/reports in `.orca/`
