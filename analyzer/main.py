"""
PitchIQ Analyzer — 100% free, runs locally.
YOLOv8-nano detection per sampled frame + shot-aware association tracking.
Built for highlight clips: camera cuts, replays, and zooms are detected and
handled instead of breaking the tracker. No paid APIs.
"""

from __future__ import annotations

import math
import threading
import tempfile
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import yt_dlp

app = FastAPI(title="PitchIQ Analyzer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pitch dimensions in meters (positions are stored as 0-100 pct of frame)
PITCH_W_M = 68.0
PITCH_H_M = 105.0

TEAM_COLORS = ["#ef4444", "#3b82f6"]
TEAM_LABELS = ["A", "B"]

MAX_ANALYSIS_WIDTH = 960
TARGET_SAMPLES = 500
MIN_SAMPLES = 150

# Detection
CONF_THRESHOLD = 0.35
DETECT_IMGSZ = 640

# Shot segmentation / replay filtering
SHOT_CORR_THRESHOLD = 0.5
MIN_DETECTIONS_PER_FRAME = 4
MAX_BOX_HEIGHT_FRAC = 0.35

# Track association
IOU_MATCH_THRESHOLD = 0.2
CENTROID_MATCH_FRAC = 0.05
TRACK_MAX_MISSES = 5
MIN_TRACK_SAMPLES = 5

# Team / slot clustering
MIN_TRACKS_PER_TEAM = 3
MAX_SLOTS_PER_TEAM = 7

# In-memory job store (no Redis/Celery needed for local use)
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()

# YOLO model is loaded once; predictions are serialized (not thread-safe)
_model: YOLO | None = None
_model_lock = threading.Lock()


def _get_model() -> YOLO:
    global _model
    with _model_lock:
        if _model is None:
            _model = YOLO("yolov8n.pt")
        return _model


@dataclass
class PlayerPosition:
    x: float
    y: float


@dataclass
class PlayerStats:
    distanceM: float
    avgSpeedKmh: float
    attackingThirdPct: float
    defensiveThirdPct: float
    workRate: float


@dataclass
class Player:
    id: int
    label: str
    color: str
    score: float
    team: int
    teamColor: str
    avgPosition: PlayerPosition
    trail: list[PlayerPosition]
    stats: PlayerStats


@dataclass
class Track:
    positions: list[PlayerPosition] = field(default_factory=list)
    color_features: list[np.ndarray] = field(default_factory=list)
    last_box: tuple[int, int, int, int] = (0, 0, 0, 0)
    misses: int = 0


def _resize_for_analysis(frame: np.ndarray, max_width: int) -> np.ndarray:
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


def _detect_people(frame: np.ndarray, model: YOLO) -> list[tuple[int, int, int, int]]:
    with _model_lock:
        results = model(frame, imgsz=DETECT_IMGSZ, conf=CONF_THRESHOLD, classes=[0], verbose=False)

    boxes: list[tuple[int, int, int, int]] = []
    for r in results:
        for xyxy in r.boxes.xyxy.cpu().numpy():
            x1, y1, x2, y2 = (int(v) for v in xyxy)
            boxes.append((x1, y1, x2 - x1, y2 - y1))
    return boxes


def _frame_histogram(frame: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist


def _is_shot_boundary(prev_hist: np.ndarray | None, hist: np.ndarray) -> bool:
    if prev_hist is None:
        return False
    corr = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
    return corr < SHOT_CORR_THRESHOLD


def _is_usable_frame(boxes: list[tuple[int, int, int, int]], frame_h: int) -> bool:
    """Reject close-ups, replays, and crowd shots."""
    if len(boxes) < MIN_DETECTIONS_PER_FRAME:
        return False
    heights = sorted(b[3] for b in boxes)
    median_h = heights[len(heights) // 2]
    return median_h <= MAX_BOX_HEIGHT_FRAC * frame_h


def _torso_color_feature(frame: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray | None:
    """Hue/saturation of the jersey region, as a circular-hue-safe 2D feature."""
    x, y, w, h = box
    fh, fw = frame.shape[:2]
    x1 = max(0, x + int(w * 0.25))
    x2 = min(fw, x + int(w * 0.75))
    y1 = max(0, y + int(h * 0.15))
    y2 = min(fh, y + int(h * 0.5))
    if x2 <= x1 or y2 <= y1:
        return None
    crop = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2HSV)
    hue = float(crop[:, :, 0].mean()) / 180.0 * 2 * math.pi
    sat = float(crop[:, :, 1].mean())
    return np.array([math.cos(hue) * sat, math.sin(hue) * sat], dtype=np.float32)


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by)
    x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    union = aw * ah + bw * bh - inter
    return inter / union if union else 0.0


def _center(box: tuple[int, int, int, int]) -> tuple[float, float]:
    x, y, w, h = box
    return x + w / 2, y + h / 2


def _to_pitch_pct(cx: float, cy: float, fw: int, fh: int) -> PlayerPosition:
    return PlayerPosition(
        x=round(max(0.0, min(100.0, cx / fw * 100)), 1),
        y=round(max(0.0, min(100.0, cy / fh * 100)), 1),
    )


def _sample_interval(total_frames: int, duration_sec: float) -> int:
    target = min(TARGET_SAMPLES, max(MIN_SAMPLES, int(duration_sec * 0.7)))
    return max(1, total_frames // target)


def _associate(
    open_tracks: list[Track],
    detections: list[tuple[int, int, int, int]],
    frame_w: int,
) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    """Greedy IoU-then-centroid matching. Returns (matches, unmatched_tracks, unmatched_dets)."""
    matched_tracks: set[int] = set()
    matched_dets: set[int] = set()
    matches: list[tuple[int, int]] = []

    iou_pairs = [
        (ti, di, _iou(t.last_box, d))
        for ti, t in enumerate(open_tracks)
        for di, d in enumerate(detections)
    ]
    iou_pairs.sort(key=lambda p: p[2], reverse=True)

    for ti, di, iou in iou_pairs:
        if iou < IOU_MATCH_THRESHOLD:
            break
        if ti in matched_tracks or di in matched_dets:
            continue
        matches.append((ti, di))
        matched_tracks.add(ti)
        matched_dets.add(di)

    max_dist = CENTROID_MATCH_FRAC * frame_w
    dist_pairs = []
    for ti, t in enumerate(open_tracks):
        if ti in matched_tracks:
            continue
        tcx, tcy = _center(t.last_box)
        for di, d in enumerate(detections):
            if di in matched_dets:
                continue
            dcx, dcy = _center(d)
            dist_pairs.append((ti, di, math.hypot(tcx - dcx, tcy - dcy)))
    dist_pairs.sort(key=lambda p: p[2])

    for ti, di, dist in dist_pairs:
        if dist > max_dist:
            break
        if ti in matched_tracks or di in matched_dets:
            continue
        matches.append((ti, di))
        matched_tracks.add(ti)
        matched_dets.add(di)

    unmatched_tracks = [ti for ti in range(len(open_tracks)) if ti not in matched_tracks]
    unmatched_dets = [di for di in range(len(detections)) if di not in matched_dets]
    return matches, unmatched_tracks, unmatched_dets


def _assign_teams(tracks: list[Track]) -> list[int]:
    """K-means on jersey color; single-team fallback when clustering degenerates."""
    features = []
    for t in tracks:
        if t.color_features:
            features.append(np.mean(t.color_features, axis=0))
        else:
            features.append(np.zeros(2, dtype=np.float32))

    data = np.array(features, dtype=np.float32)
    if len(tracks) < 2 * MIN_TRACKS_PER_TEAM:
        return [0] * len(tracks)

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, labels, _ = cv2.kmeans(data, 2, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
    labels = labels.flatten().tolist()

    counts = [labels.count(0), labels.count(1)]
    if min(counts) < MIN_TRACKS_PER_TEAM:
        return [0] * len(tracks)
    return labels


def _cluster_slots(team_tracks: list[Track]) -> list[list[Track]]:
    """Merge a team's tracks into up to MAX_SLOTS_PER_TEAM player slots by avg position."""
    k = min(len(team_tracks), MAX_SLOTS_PER_TEAM)
    if k == len(team_tracks):
        return [[t] for t in team_tracks]

    centroids = np.array(
        [
            [np.mean([p.x for p in t.positions]), np.mean([p.y for p in t.positions])]
            for t in team_tracks
        ],
        dtype=np.float32,
    )
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, labels, _ = cv2.kmeans(centroids, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS)

    slots: list[list[Track]] = [[] for _ in range(k)]
    for t, lbl in zip(team_tracks, labels.flatten()):
        slots[lbl].append(t)
    return [s for s in slots if s]


def _track_distance_m(positions: list[PlayerPosition]) -> float:
    dist = 0.0
    for i in range(1, len(positions)):
        dx = (positions[i].x - positions[i - 1].x) / 100.0 * PITCH_W_M
        dy = (positions[i].y - positions[i - 1].y) / 100.0 * PITCH_H_M
        dist += math.hypot(dx, dy)
    return dist


def _slot_stats(tracks: list[Track], sample_duration_sec: float) -> PlayerStats:
    all_positions = [p for t in tracks for p in t.positions]
    total_samples = len(all_positions)
    if total_samples < 2:
        return PlayerStats(0, 0, 0, 0, 0)

    # Distance is summed per track so cuts between tracks don't add fake meters
    dist_m = sum(_track_distance_m(t.positions) for t in tracks)
    tracked_sec = total_samples * sample_duration_sec
    avg_speed = (dist_m / tracked_sec) * 3.6 if tracked_sec > 0 else 0
    attacking = sum(1 for p in all_positions if p.y < 33.3) / total_samples * 100
    defensive = sum(1 for p in all_positions if p.y > 66.6) / total_samples * 100
    work_rate = min(100, dist_m * 0.35 + avg_speed * 2.5)

    return PlayerStats(
        distanceM=round(dist_m, 1),
        avgSpeedKmh=round(avg_speed, 1),
        attackingThirdPct=round(attacking, 1),
        defensiveThirdPct=round(defensive, 1),
        workRate=round(work_rate, 1),
    )


def _raw_score(stats: PlayerStats, positions: list[PlayerPosition]) -> float:
    """Composite 0-100 used only as input to the clip-relative rating."""
    if not positions:
        return 0.0
    movement = min(35, stats.distanceM * 0.15)
    speed = min(25, stats.avgSpeedKmh * 2.0)
    balance = 20 - abs(stats.attackingThirdPct - stats.defensiveThirdPct) * 0.15
    coverage = min(20, len(set((round(p.x), round(p.y)) for p in positions)) * 0.4)
    return max(0.0, min(100.0, movement + speed + balance + coverage))


def _to_ratings(raw_scores: list[float]) -> list[float]:
    """Map raw scores to SofaScore-style ratings: clip-relative, centered at 6.5."""
    if not raw_scores:
        return []
    arr = np.array(raw_scores, dtype=np.float64)
    std = arr.std()
    if std < 1e-6:
        return [6.5] * len(raw_scores)
    z = (arr - arr.mean()) / std
    return [round(float(max(4.0, min(10.0, 6.5 + zi * 1.2))), 1) for zi in z]


def _remap_to_half(slots_positions: list[list[PlayerPosition]], team: int) -> None:
    """Squeeze a team's positions into its half of the map (team 0 top, team 1 bottom)."""
    all_pos = [p for positions in slots_positions for p in positions]
    if not all_pos:
        return
    y_min = min(p.y for p in all_pos)
    y_max = max(p.y for p in all_pos)
    span = y_max - y_min
    lo, hi = (4.0, 46.0) if team == 0 else (54.0, 96.0)

    for positions in slots_positions:
        for p in positions:
            if span < 1e-6:
                p.y = (lo + hi) / 2
            else:
                p.y = round(lo + (p.y - y_min) / span * (hi - lo), 1)


def _update_job(job_id: str, **fields) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


class AnalyzeUrlRequest(BaseModel):
    url: str


def _download_youtube_to_temp(url: str) -> tuple[str, str]:
    """
    Download YouTube video to a temp MP4 path and return (path, title).
    Uses yt-dlp Python API so users can paste a URL instead of uploading files.
    """
    out_template = str(Path(tempfile.gettempdir()) / f"pitchiq-{uuid.uuid4().hex}.%(ext)s")
    ydl_opts = {
        # Prefer progressive MP4 so ffmpeg is not required.
        "format": "b[ext=mp4][height<=720]/b[height<=720]/best",
        "outtmpl": out_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        import imageio_ffmpeg

        ydl_opts["ffmpeg_location"] = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        # Without ffmpeg, merged (video+audio) formats abort — stick to single-file formats
        ydl_opts["format"] = "b[ext=mp4][height<=720]/best[height<=720]/best"

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_path = ydl.prepare_filename(info)
        if not video_path.lower().endswith(".mp4"):
            mp4_candidate = str(Path(video_path).with_suffix(".mp4"))
            if Path(mp4_candidate).exists():
                video_path = mp4_candidate
        if not Path(video_path).exists():
            raise ValueError("Failed to download YouTube video")
        title = str(info.get("title") or "YouTube video")
        return video_path, title


def analyze_video(path: str, on_progress: Callable[[int, str], None] | None = None) -> dict:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("Could not open video file")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps > 0 else 0

    if duration_sec <= 0:
        cap.release()
        raise ValueError("Video has no readable duration")

    sample_every = _sample_interval(total_frames, duration_sec)
    sample_duration_sec = sample_every / fps

    if on_progress:
        on_progress(2, "Loading detection model…")
    model = _get_model()

    open_tracks: list[Track] = []
    closed_tracks: list[Track] = []
    prev_hist: np.ndarray | None = None
    shot_count = 1
    processed = 0
    frame_idx = -1
    last_report = 0

    def close_track(track: Track) -> None:
        if len(track.positions) >= MIN_TRACK_SAMPLES:
            closed_tracks.append(track)

    if on_progress:
        on_progress(4, "Scanning clip for players…")

    while True:
        if not cap.grab():
            break
        frame_idx += 1
        if frame_idx % sample_every != 0:
            continue

        ret, frame = cap.retrieve()
        if not ret:
            break

        processed += 1
        frame = _resize_for_analysis(frame, MAX_ANALYSIS_WIDTH)
        fh, fw = frame.shape[:2]

        hist = _frame_histogram(frame)
        if _is_shot_boundary(prev_hist, hist):
            shot_count += 1
            for t in open_tracks:
                close_track(t)
            open_tracks = []
        prev_hist = hist

        boxes = _detect_people(frame, model)

        if not _is_usable_frame(boxes, fh):
            for t in open_tracks:
                t.misses += 1
            expired = [t for t in open_tracks if t.misses > TRACK_MAX_MISSES]
            for t in expired:
                close_track(t)
            open_tracks = [t for t in open_tracks if t.misses <= TRACK_MAX_MISSES]
            continue

        matches, unmatched_tracks, unmatched_dets = _associate(open_tracks, boxes, fw)

        for ti, di in matches:
            track = open_tracks[ti]
            box = boxes[di]
            track.last_box = box
            track.misses = 0
            cx, cy = _center(box)
            track.positions.append(_to_pitch_pct(cx, cy, fw, fh))
            feat = _torso_color_feature(frame, box)
            if feat is not None:
                track.color_features.append(feat)

        for ti in unmatched_tracks:
            open_tracks[ti].misses += 1

        still_open: list[Track] = []
        for t in open_tracks:
            if t.misses > TRACK_MAX_MISSES:
                close_track(t)
            else:
                still_open.append(t)
        open_tracks = still_open

        for di in unmatched_dets:
            box = boxes[di]
            track = Track(last_box=box)
            cx, cy = _center(box)
            track.positions.append(_to_pitch_pct(cx, cy, fw, fh))
            feat = _torso_color_feature(frame, box)
            if feat is not None:
                track.color_features.append(feat)
            open_tracks.append(track)

        if on_progress and frame_idx - last_report >= sample_every * 5:
            pct = min(95, int(frame_idx / max(total_frames, 1) * 100))
            on_progress(pct, f"Analyzing footage… {pct}%")
            last_report = frame_idx

    cap.release()

    for t in open_tracks:
        close_track(t)

    if not closed_tracks:
        raise ValueError(
            "No players tracked. Try footage where the pitch and multiple players are visible."
        )

    if on_progress:
        on_progress(96, "Assigning teams…")

    team_labels = _assign_teams(closed_tracks)
    teams_present = sorted(set(team_labels))

    if on_progress:
        on_progress(98, "Building rating map…")

    players: list[Player] = []
    raw_scores: list[float] = []
    player_id = 0

    for team in teams_present:
        team_tracks = [t for t, lbl in zip(closed_tracks, team_labels) if lbl == team]
        slots = _cluster_slots(team_tracks)

        slot_positions = [[p for t in slot for p in t.positions] for slot in slots]
        if len(teams_present) == 2:
            _remap_to_half(slot_positions, team)

        for slot_idx, (slot, positions) in enumerate(zip(slots, slot_positions)):
            stats = _slot_stats(slot, sample_duration_sec)
            avg_x = sum(p.x for p in positions) / len(positions)
            avg_y = sum(p.y for p in positions) / len(positions)
            step = max(1, len(positions) // 50)
            player_id += 1
            players.append(
                Player(
                    id=player_id,
                    label=f"{TEAM_LABELS[team]}{slot_idx + 1}",
                    color=TEAM_COLORS[team],
                    score=0.0,
                    team=team,
                    teamColor=TEAM_COLORS[team],
                    avgPosition=PlayerPosition(round(avg_x, 1), round(avg_y, 1)),
                    trail=positions[::step],
                    stats=stats,
                )
            )
            raw_scores.append(_raw_score(stats, positions))

    for player, rating in zip(players, _to_ratings(raw_scores)):
        player.score = rating

    players.sort(key=lambda p: (p.team, -p.score))
    mins = int(duration_sec // 60)
    secs = int(duration_sec % 60)
    team_msg = "2 teams" if len(teams_present) == 2 else "1 group (team colors unclear)"

    return {
        "matchId": str(uuid.uuid4())[:8],
        "frameCount": processed,
        "durationSec": round(duration_sec, 1),
        "sampleEvery": sample_every,
        "players": [asdict(p) for p in players],
        "message": (
            f"Analyzed {mins}m {secs}s across {shot_count} camera shots — "
            f"{len(players)} players rated, {team_msg}."
        ),
    }


def _run_job(job_id: str, video_path: str) -> None:
    def report(pct: int, msg: str) -> None:
        _update_job(job_id, progress=pct, statusMessage=msg)

    try:
        _update_job(job_id, status="processing", progress=1, statusMessage="Starting analysis…")
        result = analyze_video(video_path, on_progress=report)
        _update_job(job_id, status="completed", progress=100, statusMessage="Done", result=result)
    except Exception as exc:
        _update_job(job_id, status="failed", progress=0, statusMessage=str(exc), error=str(exc))
    finally:
        Path(video_path).unlink(missing_ok=True)


def _run_url_job(job_id: str, url: str) -> None:
    try:
        _update_job(job_id, status="processing", progress=1, statusMessage="Downloading YouTube video…")
        video_path, title = _download_youtube_to_temp(url)
        _update_job(job_id, statusMessage=f"Downloaded: {title}. Starting analysis…")
        _run_job(job_id, video_path)
    except Exception as exc:
        _update_job(job_id, status="failed", progress=0, statusMessage=str(exc), error=str(exc))


@app.get("/health")
def health():
    with _jobs_lock:
        active = sum(1 for j in _jobs.values() if j["status"] in ("queued", "processing"))
    return {"status": "ok", "engine": "yolov8n-local", "activeJobs": active}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """Queue a clip for background analysis. Returns immediately with a job ID."""
    job_id = str(uuid.uuid4())[:8]
    suffix = Path(file.filename or "clip.mp4").suffix or ".mp4"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    with _jobs_lock:
        _jobs[job_id] = {
            "jobId": job_id,
            "status": "queued",
            "progress": 0,
            "statusMessage": "Queued — processing in background",
            "filename": file.filename or "clip.mp4",
            "createdAt": time.time(),
            "result": None,
            "error": None,
        }

    thread = threading.Thread(target=_run_job, args=(job_id, tmp_path), daemon=True)
    thread.start()

    return {
        "jobId": job_id,
        "status": "queued",
        "message": "Analysis queued. Poll /jobs/{jobId} for progress.",
    }


@app.post("/analyze-url")
def analyze_url(payload: AnalyzeUrlRequest):
    """Queue a YouTube URL for background download + analysis."""
    url = payload.url.strip()
    if not url:
        return {"status": "failed", "error": "URL is required"}

    job_id = str(uuid.uuid4())[:8]
    with _jobs_lock:
        _jobs[job_id] = {
            "jobId": job_id,
            "status": "queued",
            "progress": 0,
            "statusMessage": "Queued — downloading from YouTube…",
            "filename": url,
            "createdAt": time.time(),
            "result": None,
            "error": None,
        }

    thread = threading.Thread(target=_run_url_job, args=(job_id, url), daemon=True)
    thread.start()

    return {
        "jobId": job_id,
        "status": "queued",
        "message": "YouTube analysis queued. Poll /jobs/{jobId} for progress.",
    }


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return {"status": "not_found", "error": "Job not found"}
        return dict(job)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
