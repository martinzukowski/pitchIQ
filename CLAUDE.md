# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PitchIQ — a free, local soccer clip analyzer. Upload match footage, get a player performance map with scores. No paid APIs, no cloud processing; everything runs on the user's machine.

```
Upload clip → Python/OpenCV (local) → Player map + scores in Fable UI
```

## Architecture

Two independent processes that talk over HTTP, started separately:

- **`analyzer/`** — Python FastAPI backend (port 8000). Single file, [main.py](analyzer/main.py). Does the actual computer-vision work: OpenCV HOG person detection to find players in the first sampled frame, then KCF tracker instances follow each detected box across subsequently sampled frames. Trackers re-detect every `REINIT_EVERY_SAMPLES` samples to recover from drift/occlusion. Positions are normalized to pitch-percentage coordinates, then turned into distance/speed/zone stats and a heuristic 0–100 score (see `_compute_stats` and `_score`).
- **`frontend/`** — F#/Fable 5 SPA compiled to JS via Vite (port 5173), no React/virtual DOM. [App.fs](frontend/App.fs) does direct DOM manipulation: `render` wipes and rebuilds `#app` from `AppState` on every `setState` call (a mutable `renderFn` ref set once in `init`). There is no framework-managed diffing — each state change re-renders the whole tree.

Analysis is asynchronous and job-based, not a single request/response:
1. Frontend `POST`s the clip to `/api/analyze` ([Api.fs](frontend/Api.fs) `submitClip`) → analyzer spawns a background `threading.Thread` running `_run_job`, returns a `jobId` immediately.
2. Frontend polls `/api/jobs/{jobId}` every 1.2s (`analyzeClipWithPolling`) until `status` is `completed` or `failed`.
3. The analyzer keeps job state in an in-memory dict (`_jobs`, guarded by `_jobs_lock`) — no database, no persistence. Jobs are lost on restart.
4. A `pollGeneration` counter in [App.fs](frontend/App.fs) invalidates stale polling loops if the user starts a new analysis mid-poll.

Vite proxies `/api/*` → `http://localhost:8000/*` in dev ([vite.config.js](frontend/vite.config.js)), stripping the `/api` prefix — the frontend never hardcodes the analyzer's host/port.

### Module load order (F#/Fable)

Fable compiles in dependency order, so [SportsProj.fsproj](frontend/SportsProj.fsproj) `<Compile>` order matters and mirrors the dependency chain: `Types.fs` (shared records: `Player`, `AnalysisResult`, `AppState`, ...) → `Api.fs` (fetch calls + manual JSON parsing into those types) → `PitchMap.fs` (SVG pitch renderer) → `App.fs` (top-level DOM render + event wiring). New modules must be added to the `fsproj` in the right position or the build fails.

### Data shape contract

`analyzer/main.py`'s `Player`/`PlayerStats`/`PlayerPosition` dataclasses are serialized with `asdict()` straight to JSON, and `frontend/Api.fs` hand-parses that JSON back into the matching F# records in `Types.fs` via untyped `obj` + `?field` + `unbox<T>` (no shared schema/codegen). If you change a field on one side, update the dataclass, the F# type, and the manual parser together.

## Commands

### Run (two terminals, from project root)

```bash
cd analyzer && pip install -r requirements.txt && python main.py   # http://localhost:8000
cd frontend && npm install && npm run dev                           # http://localhost:5173
```

Windows: `start-analyzer.bat` / `start-frontend.bat` do the same (using `npm.cmd`, needed when PowerShell blocks `npm.ps1`).

### Frontend build

```bash
cd frontend
npm run build      # vite build (compiles Fable → JS as part of the build)
npm run preview    # preview production build
```

There is no configured lint or test command in either `frontend/` or `analyzer/`.

## Notes for making changes

- The analyzer has tunable constants at the top of [main.py](analyzer/main.py) (`MAX_PLAYERS`, `MAX_ANALYSIS_WIDTH`, `TARGET_SAMPLES`, `REINIT_EVERY_SAMPLES`, `DEFAULT_MPP`) that govern detection/tracking quality vs. speed tradeoffs — full matches (~10–15 min) are handled by sampling ~500 frames rather than every frame.
- `DEFAULT_MPP` (meters-per-pixel) is a fixed heuristic constant, not derived from actual camera calibration — distance/speed stats are approximate by design (see README "Limitations").
- The frontend has no build-time type checking against the backend response shape; a mismatched field name fails silently or throws at runtime inside `Api.fs`'s `unbox` calls.
