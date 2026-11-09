@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "MAIN=%ROOT%\backend\main_detect"
set "PYTHON=%MAIN%\.venv\Scripts\python.exe"
set "RUNS=%ROOT%\sim3d\data\runs"

set "EXTRA="
set "SAVE="
set "PROF="
set "RUN="

:parse_args
if "%~1"=="" goto check_run_defined
if /i "%~1"=="save" (
    set "SAVE=1"
    shift
    goto parse_args
)
if /i "%~1"=="prof" (
    set "PROF=1"
    shift
    goto parse_args
)
if not defined RUN (
    if exist "%~1" (
        for %%I in ("%~1") do set "RUN=%%~fI"
        shift
        goto parse_args
    )
    if exist "%RUNS%\%~1" (
        for %%I in ("%RUNS%\%~1") do set "RUN=%%~fI"
        shift
        goto parse_args
    )
    for /d %%D in ("%RUNS%\*_%~1") do (
        set "RUN=%%~fD"
    )
    if defined RUN (
        shift
        goto parse_args
    )
)
set "EXTRA=%EXTRA% %1"
shift
goto parse_args

:check_run_defined
if defined RUN goto check_files

setlocal EnableDelayedExpansion
set /a count=0
echo Cac thu muc run:
for /d %%D in ("%RUNS%\*") do (
    set /a count+=1
    set "run[!count!]=%%~fD"
    echo !count!. %%~nxD
)
if !count! EQU 0 (echo Khong co run. & exit /b 1)
set "choice="
set /p "choice=Chon so run: "
if not defined choice (echo Chua chon run. & exit /b 1)
for /f "delims=0123456789" %%A in ("!choice!") do (echo So run khong hop le. & exit /b 1)
if not defined run[!choice!] (echo So run khong ton tai. & exit /b 1)
for %%I in ("!run[%choice%]!") do endlocal & set "RUN=%%~fI"

:check_files
if not exist "%PYTHON%" (echo Khong tim thay "%PYTHON%" & exit /b 1)
for %%F in (raw_cam1.mp4 raw_cam2.mp4 frame_timestamps.csv techgar_config\calibration.json techgar_config\roi_mask_cam1.json techgar_config\roi_mask_cam2.json techgar_config\parking_slots_cam1.json techgar_config\parking_slots_cam2.json) do (
    if not exist "%RUN%\%%F" (echo Thieu "%RUN%\%%F" & exit /b 1)
)
for /f %%T in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmssfff"') do set "STAMP=%%T"
if not defined STAMP (echo Khong tao duoc timestamp. & exit /b 1)
set "RUNTIME=%RUN%\techgar_live_%STAMP%_runtime"
set "SAVEFLAGS="
if defined SAVE set SAVEFLAGS=--session-dir "%RUN%\techgar_live_%STAMP%" --debug-video-only
if defined SAVE echo Se ghi debug_cam1/2.mp4 + predictions.jsonl vao "%RUN%\techgar_live_%STAMP%"

if not defined PROF if "%TECHGAR_PROFILE%"=="1" set "PROF=1"
if defined PROF (
    set "TECHGAR_PROFILE=1"
    echo Da bat TECHGAR_PROFILE=1 ^(P35_PROFILE^).
)

echo ===============================================================================
echo Dang khoi dong TechGAR LIVE 1:1 cho: "%RUN%"
echo Cau hinh: --live-mode (drop frame ^>300ms), --display-scale 1.0, pipeline mac dinh
echo Nhan phim 'q' hoac 'Esc' trong cua so video de thoat.
echo ===============================================================================

pushd "%MAIN%" || exit /b 1
"%PYTHON%" two_camera.py --replay-session "%RUN%" ^
    --live-mode --display-scale 1.0 --replay-realtime --replay-drop-frames --replay-async-vision ^
    --slots-cam1 "%RUN%\techgar_config\parking_slots_cam1.json" ^
    --slots-cam2 "%RUN%\techgar_config\parking_slots_cam2.json" ^
    --calibration "%RUN%\techgar_config\calibration.json" ^
    --mask-cam1 "%RUN%\techgar_config\roi_mask_cam1.json" ^
    --mask-cam2 "%RUN%\techgar_config\roi_mask_cam2.json" ^
    --detector-profile "config\two_camera.detector.json" ^
    --output-dir "%RUNTIME%" %SAVEFLAGS% %EXTRA% %TECHGAR_LIVE_EXTRA%
set "RESULT=%ERRORLEVEL%"
popd
if not "%RESULT%"=="0" (echo TechGAR that bai voi ma %RESULT%. & exit /b %RESULT%)
echo Da dong cua so TechGAR LIVE.
exit /b 0
