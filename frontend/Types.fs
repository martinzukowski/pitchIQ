module Types

open Browser.Types

type PlayerPosition = { x: float; y: float }

type PlayerStats =
    { distanceM: float
      avgSpeedKmh: float
      attackingThirdPct: float
      defensiveThirdPct: float
      workRate: float }

type Player =
    { id: int
      label: string
      color: string
      score: float
      team: int
      teamColor: string
      avgPosition: PlayerPosition
      trail: PlayerPosition array
      stats: PlayerStats }

type AnalysisResult =
    { matchId: string
      frameCount: int
      durationSec: float
      players: Player array
      message: string }

type JobStatus =
    { status: string
      progress: int
      statusMessage: string
      result: AnalysisResult option
      error: string option }

type AppState =
    { file: File option
      analyzing: bool
      progress: int
      statusMessage: string option
      error: string option
      result: AnalysisResult option
      selectedPlayerId: int option }

let initialState : AppState =
    { file = None
      analyzing = false
      progress = 0
      statusMessage = None
      error = None
      result = None
      selectedPlayerId = None }
