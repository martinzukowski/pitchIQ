# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PitchIQ — a free, local soccer clip analyzer. Upload match footage, get a player performance map with scores. No paid APIs, no cloud processing; everything runs on the user's machine.

```
Upload clip → Python/OpenCV (local) → Player map + scores in Fable UI
```

## Architecture

Two independent processes that talk over HTTP, started separately:

- **`analyzer/`** — Python FastAPI backend (port 8000). Single file, [main.py](analyzer/main.py). Vision pipeline built for highlight clips (camera cuts, replays, zooms): YOLOv8-nano detects people on each of ~500 sampled frames; HSV-histogram correlation between consecutive samples detects shot boundaries (all tracks reset at a cut); frames with too few detections or too-large boxes are rejected as replays/close-ups; detections are stitched into tracks with greedy IoU-then-centroid association (SORT-lite, `_associate`). Finished tracks are k-means-clustered into two teams by jersey torso color (`_assign_teams`, single-team fallback if degenerate), then per-team into up to 7 "player slots" by average position (`_cluster_slots`) — identity can't survive cuts without ReID, so slots approximate players. Stats per slot feed a clip-relative SofaScore-style 4.0–10.0 rating (`_to_ratings`, z-score centered at 6.5). With two teams, positions are remapped so team 0 occupies the top half of the map, team 1 the bottom (`_remap_to_half`). Clips can also be submitted as YouTube URLs (`POST /analyze-url`), downloaded via yt-dlp using the static ffmpeg bundled by `imageio-ffmpeg` (no system ffmpeg needed).
- **`frontend/`** — F#/Fable 5 SPA compiled to JS via Vite (port 5173), no React/virtual DOM. [App.fs](frontend/App.fs) does direct DOM manipulation: `render` wipes and rebuilds `#app` from `AppState` on every `setState` call (a mutable `renderFn` ref set once in `init`). There is no framework-managed diffing — each state change re-renders the whole tree.

Analysis is asynchronous and job-based, not a single request/response:
1. Frontend `POST`s the clip to `/api/analyze` ([Api.fs](frontend/Api.fs) `submitClip`) or a YouTube URL to `/api/analyze-url` (`submitYoutubeUrl`) → analyzer spawns a background `threading.Thread` running `_run_job`/`_run_url_job`, returns a `jobId` immediately.
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
cd analyzer && .venv/Scripts/python.exe main.py    # http://localhost:8000
cd frontend && npm install && npm run dev          # http://localhost:5173
```

Windows: `start-analyzer.bat` / `start-frontend.bat` do the same (using `npm.cmd`, needed when PowerShell blocks `npm.ps1`).

The analyzer uses a venv at `analyzer/.venv` — install deps with `analyzer/.venv/Scripts/python.exe -m pip install -r analyzer/requirements.txt`. Do NOT install into the Microsoft Store Python: PyTorch's deep header paths exceed the Windows 260-char path limit there and the install fails; the shorter venv prefix avoids this. `start-analyzer.bat` prefers the venv automatically.

### Frontend build

```bash
cd frontend
npm run build      # vite build (compiles Fable → JS as part of the build)
npm run preview    # preview production build
```

There is no configured lint or test command in either `frontend/` or `analyzer/`.

## Notes for making changes

- The analyzer has tunable constants at the top of [main.py](analyzer/main.py) (detection confidence, shot-boundary threshold, replay-filter limits, association thresholds, slots per team) that govern quality vs. robustness tradeoffs — full matches (~10–15 min) are handled by sampling ~500 frames rather than every frame. Several of these encode soccer-broadcast assumptions (e.g. `MAX_BOX_HEIGHT_FRAC` rejects frames where players fill the frame, which would misfire on close-camera indoor sports).
- Distance/speed stats convert pitch-percentage deltas through fixed 68×105m pitch dimensions with no camera calibration — approximate by design. Ratings are clip-relative (z-scored within one analysis), so they're not comparable across clips.
- The frontend has no build-time type checking against the backend response shape; a mismatched field name fails silently or throws at runtime inside `Api.fs`'s `unbox` calls.
- The first analysis after a fresh install downloads `yolov8n.pt` (~6MB) into `analyzer/`.
