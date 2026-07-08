module PitchMap

open Browser
open Browser.Types
open Fable.Core
open Fable.Core.JsInterop
open Types

// Pitch dimensions (meters) — standard FIFA proportions
let pitchW = 68.0
let pitchH = 105.0

let toSvgX (x: float) = x / 100.0 * pitchW
let toSvgY (y: float) = y / 100.0 * pitchH

/// SofaScore-style rating band colors
let ratingColor (rating: float) =
    if rating >= 8.0 then "#38bdf8"
    elif rating >= 7.0 then "#22c55e"
    elif rating >= 6.0 then "#f59e0b"
    else "#ef4444"

let formatRating (rating: float) = sprintf "%.1f" rating

let renderPitch (players: Player array) (selectedId: int option) (onSelect: int -> unit) : Browser.Types.Element =
    let svg = Browser.Dom.document.createElementNS ("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute ("viewBox", $"0 0 {pitchW} {pitchH}")
    svg.setAttribute ("xmlns", "http://www.w3.org/2000/svg")

    let make (tag: string) (attrs: (string * string) list) =
        let el = Browser.Dom.document.createElementNS ("http://www.w3.org/2000/svg", tag)

        for k, v in attrs do
            el.setAttribute (k, v)

        el

    let add (tag: string) (attrs: (string * string) list) =
        svg.appendChild (make tag attrs) |> ignore

    // Grass
    add "rect" [ "x", "0"; "y", "0"; "width", string pitchW; "height", string pitchH; "fill", "#1a5c32" ]

    // Stripes
    for i in 0..9 do
        let y = float i * pitchH / 10.0

        if i % 2 = 0 then
            add "rect" [ "x", "0"; "y", string y; "width", string pitchW; "height", string (pitchH / 10.0); "fill", "#1e6b3a"; "opacity", "0.35" ]

    let line color width attrs = add "line" (("stroke", color) :: ("stroke-width", width) :: attrs)

    // Outline
    add "rect" [ "x", "1"; "y", "1"; "width", string (pitchW - 2.0); "height", string (pitchH - 2.0); "fill", "none"; "stroke", "#ffffff55"; "stroke-width", "0.4" ]

    // Halfway
    line "#ffffff55" "0.35" [ "x1", "0"; "y1", string (pitchH / 2.0); "x2", string pitchW; "y2", string (pitchH / 2.0) ]

    // Center circle
    add "circle" [ "cx", string (pitchW / 2.0); "cy", string (pitchH / 2.0); "r", "9.15"; "fill", "none"; "stroke", "#ffffff55"; "stroke-width", "0.35" ]

    // Penalty areas
    add "rect" [ "x", string ((pitchW - 40.32) / 2.0); "y", "0"; "width", "40.32"; "height", "16.5"; "fill", "none"; "stroke", "#ffffff44"; "stroke-width", "0.3" ]
    add "rect" [ "x", string ((pitchW - 40.32) / 2.0); "y", string (pitchH - 16.5); "width", "40.32"; "height", "16.5"; "fill", "none"; "stroke", "#ffffff44"; "stroke-width", "0.3" ]

    // Player trails (faded so the rating map reads first)
    for player in players do
        if player.trail.Length > 1 then
            let points =
                player.trail
                |> Array.map (fun p -> $"{toSvgX p.x},{toSvgY p.y}")
                |> String.concat " "

            add "polyline" [ "points", points; "fill", "none"; "stroke", player.teamColor; "stroke-width", "0.4"; "opacity", "0.3"; "stroke-linecap", "round" ]

    // Player dots + rating pills
    for player in players do
        let cx = toSvgX player.avgPosition.x
        let cy = toSvgY player.avgPosition.y
        let isSelected = selectedId = Some player.id

        let dot =
            make "circle" [
                "cx", string cx
                "cy", string cy
                "r", (if isSelected then "2.4" else "2.0")
                "fill", player.teamColor
                "stroke", (if isSelected then "#ffffff" else "#ffffffaa")
                "stroke-width", (if isSelected then "0.5" else "0.25")
                "class", (if isSelected then "player-dot selected" else "player-dot")
            ]

        dot.addEventListener ("click", (fun _ -> onSelect player.id))
        svg.appendChild dot |> ignore

        // Label inside the dot
        let label = make "text" [
            "x", string cx
            "y", string (cy + 0.7)
            "text-anchor", "middle"
            "fill", "white"
            "font-size", "1.8"
            "font-weight", "700"
            "pointer-events", "none"
        ]
        label.textContent <- player.label
        svg.appendChild label |> ignore

        // Rating pill above the dot
        let pillW, pillH = 6.0, 3.2
        let pillX = cx - pillW / 2.0
        let pillY = cy - 6.4

        add "rect" [
            "x", string pillX
            "y", string pillY
            "width", string pillW
            "height", string pillH
            "rx", "1.1"
            "fill", ratingColor player.score
            "stroke", "#00000033"
            "stroke-width", "0.15"
        ]

        let ratingText = make "text" [
            "x", string cx
            "y", string (pillY + 2.4)
            "text-anchor", "middle"
            "fill", "white"
            "font-size", "2.2"
            "font-weight", "700"
            "pointer-events", "none"
        ]
        ratingText.textContent <- formatRating player.score
        svg.appendChild ratingText |> ignore

    svg
