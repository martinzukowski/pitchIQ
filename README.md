# PitchIQ

A **free, local** soccer clip analyzer with a Fable 5 frontend. Upload match footage and get a player performance map with team-aware ratings.

No paid APIs, no cloud processing, no subscriptions.

## What it does

- Upload a soccer video clip (short clips or full matches)
- Queue analysis in the background (UI stays responsive)
- Detect players with local **YOLOv8n**
- Handle camera cuts/replays using shot-boundary detection
- Group players into team buckets (A/B) using jersey-color features
- Show a pitch map with movement trails and per-player ratings

## Architecture

```text
Frontend (Fable 5 + Vite)
  -> POST /api/analyze (returns jobId immediately)
  -> Poll /api/jobs/{jobId}
  -> Render progress + results

Backend (FastAPI + Python)
  -> Background thread job queue (in-memory)
  -> YOLOv8n person detection + association tracking
  -> Team assignment + slot clustering + rating output
```

## Tech stack

| Component | Tech | Cost |
|-----------|------|------|
| Frontend | Fable 5 + Vite | Free |
| Analyzer | FastAPI + OpenCV + Ultralytics YOLOv8n | Free |
| Job queue | In-process Python threads | Free |
| APIs | None | $0 |

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.11+

## Run locally

### Windows (quickest)

From project root, launch these in separate windows:

1. `start-analyzer.bat`
2. `start-frontend.bat`

Then open: [http://localhost:5173](http://localhost:5173)

> PowerShell note: if `npm` is blocked by policy (`npm.ps1`), use `npm.cmd`.

### Manual start

#### Terminal 1: Analyzer

```bash
cd analyzer
pip install -r requirements.txt
python main.py
```

Runs at `http://localhost:8000`

#### Terminal 2: Frontend

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

Runs at `http://localhost:5173`

## API flow

- `POST /analyze` -> returns `{ jobId, status }` immediately
- `GET /jobs/{jobId}` -> returns `{ status, progress, statusMessage, result }`
- `GET /health` -> analyzer status and active job count

## Performance notes

- Designed for regular use with ~10-15 minute clips
- Adaptive sampling targets about 500 processed samples per clip
- Progress updates stream while backend runs in background

## Current limitations

- Team assignment is heuristic from jersey-color features (not always perfect)
- No persistent database; jobs are stored in memory and reset on restart
- Positioning is screen-space projected to pitch percentages (not calibrated with true camera homography)
- Ratings are clip-relative heuristic ratings, not official match stats

## Project structure

```text
sportsProj/
+-- analyzer/          # FastAPI + YOLOv8n analysis backend
+-- frontend/          # Fable 5 app UI
+-- start-analyzer.bat
+-- start-frontend.bat
+-- README.md
```

## License

MIT
