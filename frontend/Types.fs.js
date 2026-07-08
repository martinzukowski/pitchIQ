
import { Record } from "./fable_modules/fable-library-js.5.6.0/Types.js";
import { bool_type, class_type, option_type, array_type, string_type, int32_type, record_type, float64_type } from "./fable_modules/fable-library-js.5.6.0/Reflection.js";

export class PlayerPosition extends Record {
    constructor(x, y) {
        super();
        this.x = x;
        this.y = y;
    }
}

export function PlayerPosition_$reflection() {
    return record_type("Types.PlayerPosition", [], PlayerPosition, () => [["x", float64_type], ["y", float64_type]]);
}

export class PlayerStats extends Record {
    constructor(distanceM, avgSpeedKmh, attackingThirdPct, defensiveThirdPct, workRate) {
        super();
        this.distanceM = distanceM;
        this.avgSpeedKmh = avgSpeedKmh;
        this.attackingThirdPct = attackingThirdPct;
        this.defensiveThirdPct = defensiveThirdPct;
        this.workRate = workRate;
    }
}

export function PlayerStats_$reflection() {
    return record_type("Types.PlayerStats", [], PlayerStats, () => [["distanceM", float64_type], ["avgSpeedKmh", float64_type], ["attackingThirdPct", float64_type], ["defensiveThirdPct", float64_type], ["workRate", float64_type]]);
}

export class Player extends Record {
    constructor(id, label, color, score, team, teamColor, avgPosition, trail, stats) {
        super();
        this.id = (id | 0);
        this.label = label;
        this.color = color;
        this.score = score;
        this.team = (team | 0);
        this.teamColor = teamColor;
        this.avgPosition = avgPosition;
        this.trail = trail;
        this.stats = stats;
    }
}

export function Player_$reflection() {
    return record_type("Types.Player", [], Player, () => [["id", int32_type], ["label", string_type], ["color", string_type], ["score", float64_type], ["team", int32_type], ["teamColor", string_type], ["avgPosition", PlayerPosition_$reflection()], ["trail", array_type(PlayerPosition_$reflection())], ["stats", PlayerStats_$reflection()]]);
}

export class AnalysisResult extends Record {
    constructor(matchId, frameCount, durationSec, players, message) {
        super();
        this.matchId = matchId;
        this.frameCount = (frameCount | 0);
        this.durationSec = durationSec;
        this.players = players;
        this.message = message;
    }
}

export function AnalysisResult_$reflection() {
    return record_type("Types.AnalysisResult", [], AnalysisResult, () => [["matchId", string_type], ["frameCount", int32_type], ["durationSec", float64_type], ["players", array_type(Player_$reflection())], ["message", string_type]]);
}

export class JobStatus extends Record {
    constructor(status, progress, statusMessage, result, error) {
        super();
        this.status = status;
        this.progress = (progress | 0);
        this.statusMessage = statusMessage;
        this.result = result;
        this.error = error;
    }
}

export function JobStatus_$reflection() {
    return record_type("Types.JobStatus", [], JobStatus, () => [["status", string_type], ["progress", int32_type], ["statusMessage", string_type], ["result", option_type(AnalysisResult_$reflection())], ["error", option_type(string_type)]]);
}

export class AppState extends Record {
    constructor(file, youtubeUrl, analyzing, progress, statusMessage, error, result, selectedPlayerId) {
        super();
        this.file = file;
        this.youtubeUrl = youtubeUrl;
        this.analyzing = analyzing;
        this.progress = (progress | 0);
        this.statusMessage = statusMessage;
        this.error = error;
        this.result = result;
        this.selectedPlayerId = selectedPlayerId;
    }
}

export function AppState_$reflection() {
    return record_type("Types.AppState", [], AppState, () => [["file", option_type(class_type("Browser.Types.File", undefined))], ["youtubeUrl", string_type], ["analyzing", bool_type], ["progress", int32_type], ["statusMessage", option_type(string_type)], ["error", option_type(string_type)], ["result", option_type(AnalysisResult_$reflection())], ["selectedPlayerId", option_type(int32_type)]]);
}

export const initialState = new AppState(undefined, "", false, 0, undefined, undefined, undefined, undefined);

