
import { equals, createAtom, round, disposeSafe, getEnumerator } from "./fable_modules/fable-library-js.5.6.0/Util.js";
import { concat, printf, toText } from "./fable_modules/fable-library-js.5.6.0/String.js";
import { append, map as map_1, ofArray, empty, singleton } from "./fable_modules/fable-library-js.5.6.0/List.js";
import { initialState, AppState } from "./Types.fs.js";
import { startImmediate } from "./fable_modules/fable-library-js.5.6.0/Async.js";
import { singleton as singleton_1 } from "./fable_modules/fable-library-js.5.6.0/AsyncBuilder.js";
import { analyzeClipWithPolling } from "./Api.fs.js";
import { bind, toArray, defaultArg, map } from "./fable_modules/fable-library-js.5.6.0/Option.js";
import { item, tryFind, tryHead } from "./fable_modules/fable-library-js.5.6.0/Array.js";
import { renderPitch } from "./PitchMap.fs.js";

export function el(tag, attrs, children) {
    const node = document.createElement(tag);
    const enumerator = getEnumerator(attrs);
    try {
        while (enumerator["System.Collections.IEnumerator.MoveNext"]()) {
            const forLoopVar = enumerator["System.Collections.Generic.IEnumerator`1.get_Current"]();
            node.setAttribute(forLoopVar[0], forLoopVar[1]);
        }
    }
    finally {
        disposeSafe(enumerator);
    }
    const enumerator_1 = getEnumerator(children);
    try {
        while (enumerator_1["System.Collections.IEnumerator.MoveNext"]()) {
            const child = enumerator_1["System.Collections.Generic.IEnumerator`1.get_Current"]();
            if (child instanceof Node) {
                node.appendChild(child);
            }
            else if (typeof child === "string") {
                node.appendChild(document.createTextNode(child));
            }
        }
    }
    finally {
        disposeSafe(enumerator_1);
    }
    return node;
}

export function text(s) {
    return s;
}

export function div(attrs, children) {
    return el("div", attrs, children);
}

export function h1(attrs, children) {
    return el("h1", attrs, children);
}

export function h2(attrs, children) {
    return el("h2", attrs, children);
}

export function p(attrs, children) {
    return el("p", attrs, children);
}

export function button(attrs, children) {
    return el("button", attrs, children);
}

export function span(attrs, children) {
    return el("span", attrs, children);
}

export function formatScore(score) {
    return round(score).toString();
}

export function formatPlayerMeta(player) {
    return toText(printf("%.0fm covered · %.1f km/h avg"))(player.stats.distanceM)(player.stats.avgSpeedKmh);
}

export function renderPlayerRow(player, selected, onSelect) {
    const row = div(singleton(["class", selected ? "player-row selected" : "player-row"]), empty());
    row.addEventListener("click", (_arg) => {
        onSelect(player.id);
    });
    const badge = div(ofArray([["class", "player-badge"], ["style", concat("background:", player.color)]]), singleton(text(player.label)));
    const info = div(empty(), ofArray([el("strong", empty(), singleton(text(concat("Player ", player.label)))), div(singleton(["class", "player-meta"]), singleton(text(formatPlayerMeta(player))))]));
    const score = div(singleton(["class", "player-score"]), singleton(text(formatScore(player.score))));
    row.appendChild(badge);
    row.appendChild(info);
    row.appendChild(score);
    return row;
}

export function renderStats(player) {
    const stat = (label, value) => div(singleton(["class", "stat-box"]), ofArray([div(singleton(["class", "label"]), singleton(text(label))), div(singleton(["class", "value"]), singleton(text(value)))]));
    return div(singleton(["class", "stats-grid"]), ofArray([stat("Distance", toText(printf("%.0f m"))(player.stats.distanceM)), stat("Avg speed", toText(printf("%.1f km/h"))(player.stats.avgSpeedKmh)), stat("Attacking third", toText(printf("%.0f%%"))(player.stats.attackingThirdPct)), stat("Defensive third", toText(printf("%.0f%%"))(player.stats.defensiveThirdPct)), stat("Work rate", toText(printf("%.0f/100"))(player.stats.workRate)), stat("Performance", toText(printf("%.0f/100"))(player.score))]));
}

export let renderFn = createAtom((value) => {
});

export let pollGeneration = createAtom(0);

export function setState(state) {
    renderFn()(state);
}

export function handleFile(file, current) {
    setState(new AppState(file, current.analyzing, current.progress, current.statusMessage, undefined, current.result, undefined));
}

export function analyze(state) {
    const matchValue = state.file;
    if (matchValue != null) {
        const file = matchValue;
        pollGeneration(pollGeneration() + 1);
        const myGen = pollGeneration() | 0;
        setState(new AppState(state.file, true, 0, "Submitting…", undefined, state.result, state.selectedPlayerId));
        startImmediate(singleton_1.Delay(() => singleton_1.Bind(analyzeClipWithPolling(file, (progress_1, msg) => {
            if (myGen === pollGeneration()) {
                setState(new AppState(state.file, true, progress_1, msg, undefined, state.result, state.selectedPlayerId));
            }
        }), (_arg) => {
            const result = _arg;
            if (myGen !== pollGeneration()) {
                return singleton_1.Zero();
            }
            else if (result.tag === 1) {
                setState(new AppState(state.file, false, 0, undefined, result.fields[0], state.result, state.selectedPlayerId));
                return singleton_1.Zero();
            }
            else {
                const data = result.fields[0];
                setState(new AppState(state.file, false, 100, undefined, undefined, data, map((p_1) => (p_1.id | 0), tryHead(data.players))));
                return singleton_1.Zero();
            }
        })));
    }
}

export function render(state) {
    let matchValue_6, result, selected, pitchWrap, pitchSvg, playerList, list, arr, summary, arg_1, statsPanel;
    const root = document.getElementById("app");
    root.innerHTML = "";
    const header = el("header", empty(), ofArray([h1(empty(), ofArray([text("PitchIQ"), span(singleton(["class", "badge-free"]), singleton(text("100% free · runs locally")))])), p(empty(), singleton(text("Upload a soccer clip and get a player performance map — no paid APIs, all analysis on your machine.")))]));
    const uploadZone = div(ofArray([["class", "upload-zone"], ["id", "drop-zone"]]), ofArray([div(singleton(["class", "icon"]), singleton(text("⚽"))), p(empty(), singleton(text("Drop a match clip here or click to browse"))), p(empty(), singleton(text("MP4, MOV, AVI · full matches up to ~15 min supported")))]));
    const fileInput = document.createElement("input");
    fileInput.setAttribute("type", "file");
    fileInput.setAttribute("accept", "video/*");
    uploadZone.appendChild(fileInput);
    uploadZone.addEventListener("click", (_arg) => {
        fileInput.click();
    });
    uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadZone.classList.add("dragover");
    });
    uploadZone.addEventListener("dragleave", (_arg_1) => {
        uploadZone.classList.remove("dragover");
    });
    uploadZone.addEventListener("drop", (ev) => {
        const e_1 = ev;
        e_1.preventDefault();
        uploadZone.classList.remove("dragover");
        const matchValue = e_1.dataTransfer.files;
        if (matchValue.length > 0) {
            handleFile(matchValue[0], state);
        }
    });
    fileInput.addEventListener("change", (e_2) => {
        const input = e_2.target;
        const matchValue_1 = input.files;
        if (matchValue_1.length > 0) {
            handleFile(matchValue_1[0], state);
        }
    });
    let fileLabel;
    const matchValue_2 = state.file;
    if (matchValue_2 != null) {
        const f = matchValue_2;
        fileLabel = concat("Selected: ", f.name);
    }
    else {
        fileLabel = "No file selected";
    }
    const analyzeBtn = button(ofArray([["class", "btn btn-primary"], ["disabled", (state.file == null) ? "true" : ""]]), singleton(text(state.analyzing ? "Queue another analysis" : "Analyze clip")));
    analyzeBtn.addEventListener("click", (_arg_2) => {
        analyze(state);
    });
    const progressEl = state.analyzing ? div(singleton(["class", "progress-wrap"]), ofArray([div(singleton(["class", "progress-bar"]), singleton(div(ofArray([["class", "progress-fill"], ["style", toText(printf("width:%d%%"))(state.progress)]]), empty()))), p(singleton(["class", "progress-label"]), singleton(text(defaultArg(state.statusMessage, "Processing in background…"))))])) : undefined;
    let statusEl;
    const matchValue_3 = state.error;
    const matchValue_4 = state.result;
    statusEl = ((matchValue_3 == null) ? ((matchValue_4 != null) ? div(singleton(["class", "status success"]), singleton(text(matchValue_4.message))) : undefined) : div(singleton(["class", "status error"]), singleton(text(matchValue_3))));
    const layout = div(singleton(["class", "layout"]), ofArray([div(singleton(["class", "card"]), map_1((value_2) => value_2, append(ofArray([h2(empty(), singleton(text("Upload"))), uploadZone, p(empty(), singleton(text(fileLabel))), div(singleton(["class", "actions"]), singleton(analyzeBtn))]), append(ofArray(toArray(progressEl)), ofArray(toArray(statusEl)))))), div(singleton(["class", "card"]), map_1((value_5) => value_5, (matchValue_6 = state.result, (matchValue_6 != null) ? ((result = matchValue_6, (selected = bind((id) => tryFind((p_1) => (p_1.id === id), result.players), state.selectedPlayerId), (pitchWrap = div(singleton(["class", "pitch-wrap"]), empty()), (pitchSvg = renderPitch(result.players, state.selectedPlayerId, (id_1) => {
        setState(new AppState(state.file, state.analyzing, state.progress, state.statusMessage, state.error, state.result, id_1));
    }), (void pitchWrap.appendChild(pitchSvg), (playerList = ((list = div(singleton(["class", "player-list"]), empty()), ((arr = result.players, (() => {
        for (let idx = 0; idx <= (arr.length - 1); idx++) {
            const player = item(idx, arr);
            const row = renderPlayerRow(player, equals(state.selectedPlayerId, player.id), (id_2) => {
                setState(new AppState(state.file, state.analyzing, state.progress, state.statusMessage, state.error, state.result, id_2));
            });
            list.appendChild(row);
        }
    })()), list))), (summary = p(singleton(["style", "color:var(--muted);font-size:0.85rem;margin:0 0 1rem"]), singleton(text((arg_1 = (result.players.length | 0), toText(printf("%d players tracked · %.1fs · %d frames"))(arg_1)(result.durationSec)(result.frameCount))))), (statsPanel = ((selected == null) ? div(empty(), empty()) : renderStats(selected)), ofArray([h2(empty(), singleton(text("Player map"))), summary, pitchWrap, h2(singleton(["style", "margin-top:1.25rem"]), singleton(text("Players"))), playerList, statsPanel])))))))))) : ofArray([h2(empty(), singleton(text("Player map"))), p(singleton(["style", "color:var(--muted);font-size:0.9rem"]), singleton(text("Upload and analyze a clip to see player positions, movement trails, and performance scores.")))]))))]));
    root.appendChild(header);
    root.appendChild(layout);
}

export function init() {
    renderFn((state) => {
        render(state);
    });
    render(initialState);
}

init();

