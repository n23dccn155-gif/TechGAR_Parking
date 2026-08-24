param(
    [ValidateRange(1, 65535)]
    [int]$ApiPort = 8001,
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$dataDir = Join-Path $projectRoot "data"
$timestampTarget = Join-Path $dataDir "frame_timestamps.csv"
$timestampSource = Join-Path $projectRoot "experiment_test\output\droidcam_shared_m_04\frame_timestamps.csv"

if (-not (Test-Path -LiteralPath $timestampTarget -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $timestampSource -PathType Leaf)) {
        throw "Khong tim thay frame_timestamps.csv tai: $timestampSource"
    }
    Copy-Item -LiteralPath $timestampSource -Destination $timestampTarget
    Write-Host "Da copy timestamp dung phien vao data\frame_timestamps.csv"
}

$pythonCandidates = @(
    (Join-Path $projectRoot "..\.venv\Scripts\python.exe"),
    (Join-Path $projectRoot ".venv\Scripts\python.exe")
)
$pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $pythonPath) {
    throw "Khong tim thay Python trong backend\.venv hoac main_detect\.venv"
}

$requiredFiles = @(
    (Join-Path $dataDir "raw_cam1.mp4"),
    (Join-Path $dataDir "raw_cam2.mp4"),
    $timestampTarget,
    (Join-Path $projectRoot "config\parking_slots_cam1.json"),
    (Join-Path $projectRoot "config\parking_slots_cam2.json"),
    (Join-Path $projectRoot "config\two_camera.shared_m_01.json"),
    (Join-Path $projectRoot "config\roi_mask_cam1.json"),
    (Join-Path $projectRoot "config\roi_mask_cam2.json")
)
foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Thieu file demo: $requiredFile"
    }
}

$runId = Get-Date -Format "yyyyMMdd_HHmmss"
$outputDir = Join-Path $projectRoot "experiment_test\output\runtime_frontend_$runId"
$sessionDir = Join-Path $projectRoot "experiment_test\output\session_frontend_$runId"
$runtimeArguments = @(
    (Join-Path $projectRoot "runtime_server.py"),
    "--cam1-video", (Join-Path $dataDir "raw_cam1.mp4"),
    "--cam2-video", (Join-Path $dataDir "raw_cam2.mp4"),
    "--slots-cam1", (Join-Path $projectRoot "config\parking_slots_cam1.json"),
    "--slots-cam2", (Join-Path $projectRoot "config\parking_slots_cam2.json"),
    "--calibration", (Join-Path $projectRoot "config\two_camera.shared_m_01.json"),
    "--mask-cam1", (Join-Path $projectRoot "config\roi_mask_cam1.json"),
    "--mask-cam2", (Join-Path $projectRoot "config\roi_mask_cam2.json"),
    "--output-dir", $outputDir,
    "--session-dir", $sessionDir,
    "--no-session-video",
    "--identity-retention-seconds", "60",
    "--show-motion-trails",
    "--tracklet-max-samples", "12",
    "--tracklet-sample-interval", "3",
    "--global-gallery-max-samples", "24",
    "--api-port", [string]$ApiPort,
    "--no-display"
)

Write-Host "TechGAR runtime demo"
Write-Host "  API:     http://127.0.0.1:$ApiPort/api/runtime/status"
Write-Host "  Output:  $outputDir"
Write-Host "  Session: $sessionDir"

if ($CheckOnly) {
    Write-Host "Kiem tra thanh cong. Bo -CheckOnly de chay demo."
    return
}

& $pythonPath @runtimeArguments
