
import { JobStatus, AnalysisResult, Player, PlayerStats, PlayerPosition } from "./Types.fs.js";
import { map } from "./fable_modules/fable-library-js.5.6.0/Array.js";
import { defaultOf, equals } from "./fable_modules/fable-library-js.5.6.0/Util.js";
import { singleton } from "./fable_modules/fable-library-js.5.6.0/AsyncBuilder.js";
import { some, defaultArg } from "./fable_modules/fable-library-js.5.6.0/Option.js";
import { sleep, awaitPromise } from "./fable_modules/fable-library-js.5.6.0/Async.js";
import { FSharpResult$2 } from "./fable_modules/fable-library-js.5.6.0/Result.js";
import { concat } from "./fable_modules/fable-library-js.5.6.0/String.js";

function parsePosition(t) {
    return new PlayerPosition(t.x, t.y);
}

function parseStats(stats) {
    return new PlayerStats(stats.distanceM, stats.avgSpeedKmh, stats.attackingThirdPct, stats.defensiveThirdPct, stats.workRate);
}

function parsePlayer(p) {
    const trail = map(parsePosition, p.trail);
    return new Player(p.id, p.label, p.color, p.score, parsePosition(p.avgPosition), trail, parseStats(p.stats));
}

function parseAnalysis(data) {
    const players = map(parsePlayer, data.players);
    return new AnalysisResult(data.matchId, data.frameCount, data.durationSec, players, data.message);
}

function parseJobStatus(data) {
    let result;
    const matchValue = data.result;
    result = (equals(matchValue, defaultOf()) ? undefined : parseAnalysis(matchValue));
    let err;
    const matchValue_1 = data.error;
    err = (equals(matchValue_1, defaultOf()) ? undefined : matchValue_1);
    return new JobStatus(data.status, data.progress, data.statusMessage, result, err);
}

function fetchJson(url, options) {
    return singleton.Delay(() => {
        const opts = defaultArg(options, {});
        return singleton.Bind(awaitPromise(fetch(url, opts)), (_arg) => {
            const response = _arg;
            return response.ok ? singleton.Bind(awaitPromise(response.json()), (_arg_1) => singleton.Return(new FSharpResult$2(0, [_arg_1]))) : singleton.Bind(awaitPromise(response.text()), (_arg_2) => {
                const status = response.status | 0;
                return singleton.Return(new FSharpResult$2(1, [`Request failed (${status}): ${_arg_2}`]));
            });
        });
    });
}

export function submitClip(file) {
    return singleton.Delay(() => singleton.TryWith(singleton.Delay(() => {
        const fd = new FormData();
        const value = fd.append("file", file);
        return singleton.Bind(fetchJson("/api/analyze", some({
            method: "POST",
            body: fd,
        })), (_arg) => {
            const result = _arg;
            return (result.tag === 1) ? singleton.Return(new FSharpResult$2(1, [result.fields[0]])) : singleton.Return(new FSharpResult$2(0, [result.fields[0].jobId]));
        });
    }), (_arg_1) => singleton.Return(new FSharpResult$2(1, ["Could not reach the analyzer. Start it with: cd analyzer && python main.py"]))));
}

export function getJobStatus(jobId) {
    return singleton.Delay(() => singleton.Bind(fetchJson(concat("/api/jobs/", jobId), undefined), (_arg) => {
        const result = _arg;
        if (result.tag === 1) {
            return singleton.Return(new FSharpResult$2(1, [result.fields[0]]));
        }
        else {
            const status = parseJobStatus(result.fields[0]);
            return (status.status === "not_found") ? singleton.Return(new FSharpResult$2(1, ["Job not found"])) : singleton.Return(new FSharpResult$2(0, [status]));
        }
    }));
}

export function analyzeClipWithPolling(file, onProgress) {
    return singleton.Delay(() => singleton.Bind(submitClip(file), (_arg) => {
        const submitResult = _arg;
        if (submitResult.tag === 0) {
            onProgress(0, "Queued — processing in background…");
            const poll = () => singleton.Delay(() => singleton.Bind(sleep(1200), () => singleton.Bind(getJobStatus(submitResult.fields[0]), (_arg_2) => {
                const statusResult = _arg_2;
                if (statusResult.tag === 0) {
                    const job = statusResult.fields[0];
                    onProgress(job.progress, job.statusMessage);
                    const matchValue = job.status;
                    switch (matchValue) {
                        case "completed": {
                            const matchValue_1 = job.result;
                            if (matchValue_1 == null) {
                                return singleton.Return(new FSharpResult$2(1, ["Job completed but no result returned"]));
                            }
                            else {
                                const result = matchValue_1;
                                return singleton.Return(new FSharpResult$2(0, [result]));
                            }
                        }
                        case "failed":
                            return singleton.Return(new FSharpResult$2(1, [defaultArg(job.error, "Analysis failed")]));
                        default:
                            return singleton.ReturnFrom(poll());
                    }
                }
                else {
                    return singleton.Return(new FSharpResult$2(1, [statusResult.fields[0]]));
                }
            })));
            return singleton.ReturnFrom(poll());
        }
        else {
            return singleton.Return(new FSharpResult$2(1, [submitResult.fields[0]]));
        }
    }));
}

