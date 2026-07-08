module Api

open Browser
open Browser.Types
open Fable.Core
open Fable.Core.JsInterop
open Types

let private parsePosition (t: obj) : PlayerPosition =
    { x = t?x |> unbox<float>
      y = t?y |> unbox<float> }

let private parseStats (stats: obj) : PlayerStats =
    { distanceM = stats?distanceM |> unbox<float>
      avgSpeedKmh = stats?avgSpeedKmh |> unbox<float>
      attackingThirdPct = stats?attackingThirdPct |> unbox<float>
      defensiveThirdPct = stats?defensiveThirdPct |> unbox<float>
      workRate = stats?workRate |> unbox<float> }

let private parsePlayer (p: obj) : Player =
    let trail =
        p?trail
        |> unbox<obj[]>
        |> Array.map parsePosition

    { id = p?id |> unbox<int>
      label = p?label |> unbox<string>
      color = p?color |> unbox<string>
      score = p?score |> unbox<float>
      team = p?team |> unbox<int>
      teamColor = p?teamColor |> unbox<string>
      avgPosition = parsePosition p?avgPosition
      trail = trail
      stats = parseStats p?stats }

let private parseAnalysis (data: obj) : AnalysisResult =
    let players =
        data?players |> unbox<obj[]> |> Array.map parsePlayer

    { matchId = data?matchId |> unbox<string>
      frameCount = data?frameCount |> unbox<int>
      durationSec = data?durationSec |> unbox<float>
      players = players
      message = data?message |> unbox<string> }

let private parseJobStatus (data: obj) : JobStatus =
    let result =
        match data?result with
        | null -> None
        | r -> Some (parseAnalysis r)

    let err =
        match data?error with
        | null -> None
        | e -> Some (unbox<string> e)

    { status = data?status |> unbox<string>
      progress = data?progress |> unbox<int>
      statusMessage = data?statusMessage |> unbox<string>
      result = result
      error = err }

[<Emit("new FormData()")>]
let private createFormData () : FormData = jsNative

[<Emit("fetch($0, $1)")>]
let private fetchApi (url: string) (options: obj) : JS.Promise<obj> = jsNative

let private fetchJson (url: string) (options: obj option) =
    async {
        let opts = defaultArg options (createObj [])
        let! response = fetchApi url opts |> Async.AwaitPromise

        if response?ok |> unbox<bool> then
            let! json = response?json () |> Async.AwaitPromise
            return Ok json
        else
            let! text = response?text () |> Async.AwaitPromise
            let status = response?status |> unbox<int>
            return Error $"Request failed ({status}): {text}"
    }

let submitClip (file: File) : Async<Result<string, string>> =
    async {
        try
            let fd = createFormData ()
            fd.append ("file", file) |> ignore

            let! result =
                fetchJson
                    "/api/analyze"
                    (Some(createObj [ "method" ==> "POST"; "body" ==> fd ]))

            match result with
            | Ok json -> return Ok (json?jobId |> unbox<string>)
            | Error msg -> return Error msg
        with _ ->
            return
                Error
                    "Could not reach the analyzer. Start it with: cd analyzer && python main.py"
    }

let submitYoutubeUrl (url: string) : Async<Result<string, string>> =
    async {
        try
            let body = createObj [ "url" ==> url ]

            let! result =
                fetchJson
                    "/api/analyze-url"
                    (Some(createObj [ "method" ==> "POST"; "headers" ==> createObj [ "Content-Type" ==> "application/json" ]; "body" ==> JS.JSON.stringify(body) ]))

            match result with
            | Ok json -> return Ok (json?jobId |> unbox<string>)
            | Error msg -> return Error msg
        with _ ->
            return
                Error
                    "Could not reach the analyzer. Start it with: cd analyzer && python main.py"
    }

let getJobStatus (jobId: string) : Async<Result<JobStatus, string>> =
    async {
        let! result = fetchJson $"/api/jobs/{jobId}" None

        match result with
        | Ok json ->
            let status = parseJobStatus json

            if status.status = "not_found" then
                return Error "Job not found"
            else
                return Ok status
        | Error msg -> return Error msg
    }

let private pollJob (jobId: string) (onProgress: int -> string -> unit) : Async<Result<AnalysisResult, string>> =
    async {
        onProgress 0 "Queued — processing in background…"

        let rec poll () =
            async {
                do! Async.Sleep 1200
                let! statusResult = getJobStatus jobId

                match statusResult with
                | Error msg -> return Error msg
                | Ok job ->
                    onProgress job.progress job.statusMessage

                    match job.status with
                    | "completed" ->
                        match job.result with
                        | Some result -> return Ok result
                        | None -> return Error "Job completed but no result returned"
                    | "failed" ->
                        return Error (job.error |> Option.defaultValue "Analysis failed")
                    | _ -> return! poll ()
            }

        return! poll ()
    }

let analyzeClipWithPolling (file: File) (onProgress: int -> string -> unit) : Async<Result<AnalysisResult, string>> =
    async {
        let! submitResult = submitClip file
        match submitResult with
        | Error msg -> return Error msg
        | Ok jobId -> return! pollJob jobId onProgress
    }

let analyzeYoutubeWithPolling (url: string) (onProgress: int -> string -> unit) : Async<Result<AnalysisResult, string>> =
    async {
        let! submitResult = submitYoutubeUrl url
        match submitResult with
        | Error msg -> return Error msg
        | Ok jobId -> return! pollJob jobId onProgress
    }
