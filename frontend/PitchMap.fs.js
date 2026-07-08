
import { join, printf, toText } from "./fable_modules/fable-library-js.5.6.0/String.js";
import { equals, disposeSafe, getEnumerator } from "./fable_modules/fable-library-js.5.6.0/Util.js";
import { ofArray } from "./fable_modules/fable-library-js.5.6.0/List.js";
import { map, item } from "./fable_modules/fable-library-js.5.6.0/Array.js";

export const pitchW = 68;

export const pitchH = 105;

export function toSvgX(x) {
    return (x / 100) * pitchW;
}

export function toSvgY(y) {
    return (y / 100) * pitchH;
}

/**
 * SofaScore-style rating band colors
 */
export function ratingColor(rating) {
    if (rating >= 8) {
        return "#38bdf8";
    }
    else if (rating >= 7) {
        return "#22c55e";
    }
    else if (rating >= 6) {
        return "#f59e0b";
    }
    else {
        return "#ef4444";
    }
}

export function formatRating(rating) {
    return toText(printf("%.1f"))(rating);
}

export function renderPitch(players, selectedId, onSelect) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${pitchW} ${pitchH}`);
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const make = (tag, attrs) => {
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
        return el;
    };
    const add = (tag_1, attrs_1) => {
        svg.appendChild(make(tag_1, attrs_1));
    };
    add("rect", ofArray([["x", "0"], ["y", "0"], ["width", pitchW.toString()], ["height", pitchH.toString()], ["fill", "#1a5c32"]]));
    for (let i = 0; i <= 9; i++) {
        const y = (i * pitchH) / 10;
        if ((i % 2) === 0) {
            add("rect", ofArray([["x", "0"], ["y", y.toString()], ["width", pitchW.toString()], ["height", (pitchH / 10).toString()], ["fill", "#1e6b3a"], ["opacity", "0.35"]]));
        }
    }
    add("rect", ofArray([["x", "1"], ["y", "1"], ["width", (pitchW - 2).toString()], ["height", (pitchH - 2).toString()], ["fill", "none"], ["stroke", "#ffffff55"], ["stroke-width", "0.4"]]));
    add("line", ofArray([["stroke", "#ffffff55"], ["stroke-width", "0.35"], ["x1", "0"], ["y1", (pitchH / 2).toString()], ["x2", pitchW.toString()], ["y2", (pitchH / 2).toString()]]));
    add("circle", ofArray([["cx", (pitchW / 2).toString()], ["cy", (pitchH / 2).toString()], ["r", "9.15"], ["fill", "none"], ["stroke", "#ffffff55"], ["stroke-width", "0.35"]]));
    add("rect", ofArray([["x", ((pitchW - 40.32) / 2).toString()], ["y", "0"], ["width", "40.32"], ["height", "16.5"], ["fill", "none"], ["stroke", "#ffffff44"], ["stroke-width", "0.3"]]));
    add("rect", ofArray([["x", ((pitchW - 40.32) / 2).toString()], ["y", (pitchH - 16.5).toString()], ["width", "40.32"], ["height", "16.5"], ["fill", "none"], ["stroke", "#ffffff44"], ["stroke-width", "0.3"]]));
    for (let idx = 0; idx <= (players.length - 1); idx++) {
        const player = item(idx, players);
        if (player.trail.length > 1) {
            add("polyline", ofArray([["points", join(" ", map((p) => (`${toSvgX(p.x)},${toSvgY(p.y)}`), player.trail))], ["fill", "none"], ["stroke", player.teamColor], ["stroke-width", "0.4"], ["opacity", "0.3"], ["stroke-linecap", "round"]]));
        }
    }
    for (let idx_1 = 0; idx_1 <= (players.length - 1); idx_1++) {
        const player_1 = item(idx_1, players);
        const cx = toSvgX(player_1.avgPosition.x);
        const cy = toSvgY(player_1.avgPosition.y);
        const isSelected = equals(selectedId, player_1.id);
        const dot = make("circle", ofArray([["cx", cx.toString()], ["cy", cy.toString()], ["r", isSelected ? "2.4" : "2.0"], ["fill", player_1.teamColor], ["stroke", isSelected ? "#ffffff" : "#ffffffaa"], ["stroke-width", isSelected ? "0.5" : "0.25"], ["class", isSelected ? "player-dot selected" : "player-dot"]]));
        dot.addEventListener("click", (_arg) => {
            onSelect(player_1.id);
        });
        svg.appendChild(dot);
        const label = make("text", ofArray([["x", cx.toString()], ["y", (cy + 0.7).toString()], ["text-anchor", "middle"], ["fill", "white"], ["font-size", "1.8"], ["font-weight", "700"], ["pointer-events", "none"]]));
        label.textContent = player_1.label;
        svg.appendChild(label);
        const pillX = cx - (6 / 2);
        const pillY = cy - 6.4;
        add("rect", ofArray([["x", pillX.toString()], ["y", pillY.toString()], ["width", (6).toString()], ["height", (3.2).toString()], ["rx", "1.1"], ["fill", ratingColor(player_1.score)], ["stroke", "#00000033"], ["stroke-width", "0.15"]]));
        const ratingText = make("text", ofArray([["x", cx.toString()], ["y", (pillY + 2.4).toString()], ["text-anchor", "middle"], ["fill", "white"], ["font-size", "2.2"], ["font-weight", "700"], ["pointer-events", "none"]]));
        ratingText.textContent = formatRating(player_1.score);
        svg.appendChild(ratingText);
    }
    return svg;
}

