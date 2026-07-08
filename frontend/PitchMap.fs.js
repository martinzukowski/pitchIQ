
import { equals, disposeSafe, getEnumerator } from "./fable_modules/fable-library-js.5.6.0/Util.js";
import { ofArrayWithTail, ofArray } from "./fable_modules/fable-library-js.5.6.0/List.js";
import { map, item } from "./fable_modules/fable-library-js.5.6.0/Array.js";
import { join } from "./fable_modules/fable-library-js.5.6.0/String.js";

export const pitchW = 68;

export const pitchH = 105;

export function toSvgX(x) {
    return (x / 100) * pitchW;
}

export function toSvgY(y) {
    return (y / 100) * pitchH;
}

export function renderPitch(players, selectedId, onSelect) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${pitchW} ${pitchH}`);
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const add = (tag, attrs) => {
        const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        const enumerator = getEnumerator(attrs);
        try {
            while (enumerator["System.Collections.IEnumerator.MoveNext"]()) {
                const forLoopVar = enumerator["System.Collections.Generic.IEnumerator`1.get_Current"]();
                el.setAttribute(forLoopVar[0], forLoopVar[1]);
            }
        }
        finally {
            disposeSafe(enumerator);
        }
        svg.appendChild(el);
    };
    add("rect", ofArray([["x", "0"], ["y", "0"], ["width", pitchW.toString()], ["height", pitchH.toString()], ["fill", "#1a5c32"]]));
    for (let i = 0; i <= 9; i++) {
        const y = (i * pitchH) / 10;
        if ((i % 2) === 0) {
            add("rect", ofArray([["x", "0"], ["y", y.toString()], ["width", pitchW.toString()], ["height", (pitchH / 10).toString()], ["fill", "#1e6b3a"], ["opacity", "0.35"]]));
        }
    }
    const line = (color, width, attrs_1) => {
        add("line", ofArrayWithTail([["stroke", color], ["stroke-width", width]], attrs_1));
    };
    add("rect", ofArray([["x", "1"], ["y", "1"], ["width", (pitchW - 2).toString()], ["height", (pitchH - 2).toString()], ["fill", "none"], ["stroke", "#ffffff55"], ["stroke-width", "0.4"]]));
    line("#ffffff55", "0.35", ofArray([["x1", "0"], ["y1", (pitchH / 2).toString()], ["x2", pitchW.toString()], ["y2", (pitchH / 2).toString()]]));
    add("circle", ofArray([["cx", (pitchW / 2).toString()], ["cy", (pitchH / 2).toString()], ["r", "9.15"], ["fill", "none"], ["stroke", "#ffffff55"], ["stroke-width", "0.35"]]));
    add("rect", ofArray([["x", ((pitchW - 40.32) / 2).toString()], ["y", "0"], ["width", "40.32"], ["height", "16.5"], ["fill", "none"], ["stroke", "#ffffff44"], ["stroke-width", "0.3"]]));
    add("rect", ofArray([["x", ((pitchW - 40.32) / 2).toString()], ["y", (pitchH - 16.5).toString()], ["width", "40.32"], ["height", "16.5"], ["fill", "none"], ["stroke", "#ffffff44"], ["stroke-width", "0.3"]]));
    line("#ffffff22", "0.25", ofArray([["x1", "0"], ["y1", (pitchH / 3).toString()], ["x2", pitchW.toString()], ["y2", (pitchH / 3).toString()]]));
    line("#ffffff22", "0.25", ofArray([["x1", "0"], ["y1", ((2 * pitchH) / 3).toString()], ["x2", pitchW.toString()], ["y2", ((2 * pitchH) / 3).toString()]]));
    for (let idx = 0; idx <= (players.length - 1); idx++) {
        const player = item(idx, players);
        if (player.trail.length > 1) {
            add("polyline", ofArray([["points", join(" ", map((p) => (`${toSvgX(p.x)},${toSvgY(p.y)}`), player.trail))], ["fill", "none"], ["stroke", player.color], ["stroke-width", "0.5"], ["opacity", "0.55"], ["stroke-linecap", "round"]]));
        }
    }
    for (let idx_1 = 0; idx_1 <= (players.length - 1); idx_1++) {
        const player_1 = item(idx_1, players);
        const cx = toSvgX(player_1.avgPosition.x);
        const cy = toSvgY(player_1.avgPosition.y);
        const isSelected = equals(selectedId, player_1.id);
        const cls = isSelected ? "player-dot selected" : "player-dot";
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", cx.toString());
        circle.setAttribute("cy", cy.toString());
        circle.setAttribute("r", isSelected ? "2.2" : "1.8");
        circle.setAttribute("fill", player_1.color);
        circle.setAttribute("class", cls);
        circle.setAttribute("opacity", "0.95");
        circle.addEventListener("click", (_arg) => {
            onSelect(player_1.id);
        });
        svg.appendChild(circle);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", cx.toString());
        text.setAttribute("y", (cy - 2.8).toString());
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "white");
        text.setAttribute("font-size", "2.5");
        text.setAttribute("font-weight", "600");
        text.textContent = player_1.score.toString();
        svg.appendChild(text);
    }
    return svg;
}

