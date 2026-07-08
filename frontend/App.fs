module App

open Browser
open Browser.Types
open Fable.Core
open Fable.Core.JsInterop
open Types
open Api
open PitchMap

let el tag (attrs: (string * string) list) (children: obj list) =
    let node = Dom.document.createElement tag

    for k, v in attrs do
        node.setAttribute (k, v)

    for child in children do
        match child with
        | :? Node as n -> node.appendChild n |> ignore
        | :? string as s -> node.appendChild (Dom.document.createTextNode s) |> ignore
        | _ -> ()

    node

let text (s: string) = s

let div attrs children = el "div" attrs children
let h1 attrs children = el "h1" attrs children
let h2 attrs children = el "h2" attrs children
let p attrs children = el "p" attrs children
let button attrs children = el "button" attrs children
let span attrs children = el "span" attrs children

let formatPlayerMeta (player: Player) =
    sprintf "%.0fm covered · %.1f km/h avg" player.stats.distanceM player.stats.avgSpeedKmh

let formatRating (score: float) = sprintf "%.1f" score

let ratingColor (score: float) =
    if score >= 8.0 then "#16a34a"
    elif score >= 7.0 then "#22c55e"
    elif score >= 6.0 then "#eab308"
    elif score >= 5.0 then "#f97316"
    else "#ef4444"

let renderPlayerRow (player: Player) (selected: bool) (onSelect: int -> unit) =
    let row = div [ ("class", if selected then "player-row selected" else "player-row") ] []

    row.addEventListener ("click", fun _ -> onSelect player.id)

    let badge = div [ ("class", "player-badge"); ("style", $"background:{player.teamColor}") ] [ text player.label ]
    let info =
        div [] [
            el "strong" [] [ text $"Player {player.label}" ]
            div [ ("class", "player-meta") ] [
                text (formatPlayerMeta player)
            ]
        ]

    let score =
        div
            [ ("class", "player-score")
              ("style", $"background:{ratingColor player.score};color:#fff;border-radius:6px;padding:0.15rem 0.5rem") ]
            [ text (formatRating player.score) ]

    row.appendChild badge |> ignore
    row.appendChild info |> ignore
    row.appendChild score |> ignore
    row

let renderStats (player: Player) =
    let stat label value =
        div [ ("class", "stat-box") ] [
            div [ ("class", "label") ] [ text label ]
            div [ ("class", "value") ] [ text value ]
        ]

    div [ ("class", "stats-grid") ] [
        stat "Distance" (sprintf "%.0f m" player.stats.distanceM)
        stat "Avg speed" (sprintf "%.1f km/h" player.stats.avgSpeedKmh)
        stat "Attacking third" (sprintf "%.0f%%" player.stats.attackingThirdPct)
        stat "Defensive third" (sprintf "%.0f%%" player.stats.defensiveThirdPct)
        stat "Work rate" (sprintf "%.0f/100" player.stats.workRate)
        stat "Rating" (sprintf "%.1f" player.score)
    ]

let mutable renderFn: (AppState -> unit) = ignore
let mutable pollGeneration = 0

let setState state = renderFn state

let handleFile (file: File) (current: AppState) =
    setState
        { current with
            file = Some file
            error = None
            selectedPlayerId = None }

let handleYoutubeUrl (value: string) (current: AppState) =
    setState
        { current with
            youtubeUrl = value
            error = None
            selectedPlayerId = None }

let analyze state =
    let source =
        match state.file, state.youtubeUrl.Trim() with
        | Some file, _ -> Choice1Of2 file
        | None, url when url <> "" -> Choice2Of2 url
        | _ -> Choice2Of2 ""

    match source with
    | Choice2Of2 "" -> ()
    | _ ->
        pollGeneration <- pollGeneration + 1
        let myGen = pollGeneration

        setState
            { state with
                analyzing = true
                progress = 0
                statusMessage = Some "Submitting…"
                error = None }

        async {
            let onProgress progress msg =
                if myGen = pollGeneration then
                    setState
                        { state with
                            analyzing = true
                            progress = progress
                            statusMessage = Some msg
                            error = None }

            let! result =
                match source with
                | Choice1Of2 file -> analyzeClipWithPolling file onProgress
                | Choice2Of2 url -> analyzeYoutubeWithPolling url onProgress

            if myGen <> pollGeneration then
                ()
            else
                match result with
                | Ok data ->
                    let firstId = data.players |> Array.tryHead |> Option.map (fun p -> p.id)

                    setState
                        { state with
                            analyzing = false
                            progress = 100
                            statusMessage = None
                            result = Some data
                            selectedPlayerId = firstId
                            error = None }
                | Error msg ->
                    setState
                        { state with
                            analyzing = false
                            progress = 0
                            statusMessage = None
                            error = Some msg }
        }
        |> Async.StartImmediate

let render (state: AppState) =
    let root = Dom.document.getElementById "app"
    root.innerHTML <- ""

    let header =
        el "header" [] [
            h1 [] [
                text "PitchIQ"
                span [ ("class", "badge-free") ] [ text "100% free · runs locally" ]
            ]
            p [] [ text "Upload a soccer clip and get a player performance map — no paid APIs, all analysis on your machine." ]
        ]

    // Upload card
    let uploadZone = div [ ("class", "upload-zone"); ("id", "drop-zone") ] [
        div [ ("class", "icon") ] [ text "⚽" ]
        p [] [ text "Drop a match clip here or click to browse" ]
        p [] [ text "MP4, MOV, AVI · full matches up to ~15 min supported" ]
    ]

    let fileInput = Dom.document.createElement "input" :?> HTMLInputElement
    fileInput.setAttribute ("type", "file")
    fileInput.setAttribute ("accept", "video/*")
    uploadZone.appendChild fileInput |> ignore

    uploadZone.addEventListener (
        "click",
        fun _ -> fileInput.click ()
    )

    uploadZone.addEventListener (
        "dragover",
        fun e ->
            e.preventDefault ()
            uploadZone.classList.add ("dragover")
    )

    uploadZone.addEventListener (
        "dragleave",
        fun _ -> uploadZone.classList.remove ("dragover")
    )

    uploadZone.addEventListener (
        "drop",
        fun ev ->
            let e = ev :?> DragEvent
            e.preventDefault ()
            uploadZone.classList.remove ("dragover")

            match e.dataTransfer.files with
            | files when files.length > 0 -> handleFile files.[0] state
            | _ -> ()
    )

    fileInput.addEventListener (
        "change",
        fun e ->
            let input = e.target :?> HTMLInputElement

            match input.files with
            | files when files.length > 0 -> handleFile files.[0] state
            | _ -> ()
    )

    let ytInput = Dom.document.createElement "input" :?> HTMLInputElement
    ytInput.setAttribute ("type", "url")
    ytInput.setAttribute ("placeholder", "or paste a YouTube link (https://youtube.com/...)")
    ytInput.setAttribute ("class", "url-input")
    ytInput.value <- state.youtubeUrl
    ytInput.addEventListener ("input", fun e -> handleYoutubeUrl (unbox<HTMLInputElement> e.target).value state)

    let fileLabel =
        match state.file with
        | None -> "No file selected"
        | Some f -> $"Selected: {f.name}"

    let sourceHint =
        if state.youtubeUrl.Trim() <> "" then
            $"YouTube URL: {state.youtubeUrl.Trim()}"
        else
            fileLabel

    let analyzeBtnAttrs =
        let baseAttrs = [ ("class", "btn btn-primary") ]

        if Option.isNone state.file && state.youtubeUrl.Trim() = "" then
            baseAttrs @ [ ("disabled", "true") ]
        else
            baseAttrs

    let analyzeBtn =
        button
            analyzeBtnAttrs
            [ text (
                if state.analyzing then "Queue another analysis"
                else "Analyze clip"
              ) ]

    analyzeBtn.addEventListener ("click", fun _ -> analyze state)

    let progressEl =
        if state.analyzing then
            Some(
                div [ ("class", "progress-wrap") ] [
                    div [ ("class", "progress-bar") ] [
                        div
                            [ ("class", "progress-fill")
                              ("style", sprintf "width:%d%%" state.progress) ]
                            []
                    ]
                    p [ ("class", "progress-label") ] [
                        text (
                            state.statusMessage
                            |> Option.defaultValue "Processing in background…"
                        )
                    ]
                ]
            )
        else
            None

    let statusEl =
        match state.error, state.result with
        | Some err, _ -> Some(div [ ("class", "status error") ] [ text err ])
        | None, Some res -> Some(div [ ("class", "status success") ] [ text res.message ])
        | _ -> None

    let leftCard =
        let children =
            [ h2 [] [ text "Upload" ]
              uploadZone
              ytInput
              p [] [ text sourceHint ]
              div [ ("class", "actions") ] [ analyzeBtn ] ]
            @ (progressEl |> Option.toList)
            @ (statusEl |> Option.toList)

        div [ ("class", "card") ] (List.map box children)

    // Right side — pitch map or placeholder
    let rightChildren =
        match state.result with
        | None ->
            [ h2 [] [ text "Player map" ]
              p [ ("style", "color:var(--muted);font-size:0.9rem") ] [
                  text "Upload and analyze a clip to see player positions, movement trails, and performance scores."
              ] ]
        | Some result ->
            let selected =
                state.selectedPlayerId
                |> Option.bind (fun id -> result.players |> Array.tryFind (fun p -> p.id = id))

            let onSelect id = setState { state with selectedPlayerId = Some id }

            let pitchWrap = div [ ("class", "pitch-wrap") ] []
            let pitchSvg = renderPitch result.players state.selectedPlayerId onSelect
            pitchWrap.appendChild pitchSvg |> ignore

            let playerList =
                let list = div [ ("class", "player-list") ] []

                let teams =
                    result.players
                    |> Array.map (fun p -> p.team)
                    |> Array.distinct
                    |> Array.sort

                for team in teams do
                    let teamPlayers = result.players |> Array.filter (fun p -> p.team = team)

                    if teams.Length > 1 then
                        let teamColor = teamPlayers.[0].teamColor
                        let teamName = if team = 0 then "Team A" else "Team B"

                        let header =
                            div
                                [ ("class", "team-header")
                                  ("style", $"color:{teamColor};font-weight:700;margin:0.75rem 0 0.35rem") ]
                                [ text teamName ]

                        list.appendChild header |> ignore

                    for player in teamPlayers do
                        let row =
                            renderPlayerRow player (state.selectedPlayerId = Some player.id) (fun id ->
                                setState { state with selectedPlayerId = Some id })

                        list.appendChild row |> ignore

                list

            let summary =
                p [ ("style", "color:var(--muted);font-size:0.85rem;margin:0 0 1rem") ] [
                    text (sprintf "%d players tracked · %.1fs · %d frames" result.players.Length result.durationSec result.frameCount)
                ]

            let statsPanel =
                match selected with
                | Some p -> renderStats p
                | None -> div [] []

            [ h2 [] [ text "Player map" ]
              summary
              pitchWrap
              h2 [ ("style", "margin-top:1.25rem") ] [ text "Players" ]
              playerList
              statsPanel ]

    let rightCard = div [ ("class", "card") ] (List.map box rightChildren)

    let layout = div [ ("class", "layout") ] [ leftCard; rightCard ]

    root.appendChild header |> ignore
    root.appendChild layout |> ignore

let init () =
    renderFn <- render
    render initialState

init ()
