@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "MAIN=%ROOT%\backend\main_detect"
set "PYTHON=%MAIN%\.venv\Scripts\python.exe"
set "RUNS=%ROOT%\sim3d\data\runs"
if not "%~1"=="" (
    for %%I in ("%~1") do set "RUN=%%~fI"
    goto selected
)
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
:selected
if not exist "%PYTHON%" (echo Khong tim thay "%PYTHON%" & exit /b 1)
for %%F in (raw_cam1.mp4 raw_cam2.mp4 frame_timestamps.csv techgar_config\calibration.json techgar_config\roi_mask_cam1.json techgar_config\roi_mask_cam2.json techgar_config\parking_slots_cam1.json techgar_config\parking_slots_cam2.json) do (
    if not exist "%RUN%\%%F" (echo Thieu "%RUN%\%%F" & exit /b 1)
)
for /f %%T in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmssfff"') do set "STAMP=%%T"
if not defined STAMP (echo Khong tao duoc timestamp. & exit /b 1)
set "SESSION=%RUN%\techgar_debug_%STAMP%"
set "RUNTIME=%RUN%\techgar_debug_%STAMP%_runtime"

set "DEBUG_MODE_FLAG=--debug-video-only"
if /i "%~2"=="pred" set "DEBUG_MODE_FLAG="
if /i "%~2"=="predictions" set "DEBUG_MODE_FLAG="
if "%TECHGAR_WRITE_PREDICTIONS%"=="1" set "DEBUG_MODE_FLAG="

if defined DEBUG_MODE_FLAG (
    echo Video debug se duoc ghi vao "%SESSION%"
) else (
    echo Video debug va predictions se duoc ghi vao "%SESSION%"
)
pushd "%MAIN%" || exit /b 1
"%PYTHON%" two_camera.py --replay-session "%RUN%" ^
    --slots-cam1 "%RUN%\techgar_config\parking_slots_cam1.json" ^
    --slots-cam2 "%RUN%\techgar_config\parking_slots_cam2.json" ^
    --calibration "%RUN%\techgar_config\calibration.json" ^
    --mask-cam1 "%RUN%\techgar_config\roi_mask_cam1.json" ^
    --mask-cam2 "%RUN%\techgar_config\roi_mask_cam2.json" ^
    --detector-profile "config\two_camera.detector.json" ^
    --output-dir "%RUNTIME%" --session-dir "%SESSION%" ^
    %DEBUG_MODE_FLAG% --no-display
set "RESULT=%ERRORLEVEL%"
popd
if not "%RESULT%"=="0" (echo TechGAR that bai voi ma %RESULT%. & exit /b %RESULT%)
echo Xong: "%SESSION%\debug_cam1.mp4"
echo Xong: "%SESSION%\debug_cam2.mp4"
if exist "%SESSION%\predictions.jsonl" echo Xong: "%SESSION%\predictions.jsonl"
exit /b 0
