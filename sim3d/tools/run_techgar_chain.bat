@echo off
rem Chay LIVE 1:1 (hien cua so) lan luot cac video: 5p -> 10p -> 20p.
rem Moi video chay dung bang thoi luong video. Dong cua so (q/Esc) de sang video ke tiep.
rem Dung: run_techgar_chain.bat            (sang_5p, sang_10p, sang_20p)
rem       run_techgar_chain.bat toi        (toi_5p, toi_10p)
rem       run_techgar_chain.bat [toi|sang] [save] [prof] [co_khac...]
setlocal EnableExtensions DisableDelayedExpansion

set "MODE=sang"
set "PASSTHROUGH="

:parse_loop
if "%~1"=="" goto after_parse
if /i "%~1"=="toi" (
    set "MODE=toi"
) else if /i "%~1"=="sang" (
    set "MODE=sang"
) else if /i "%~1"=="save" (
    set "PASSTHROUGH=%PASSTHROUGH% save"
) else if /i "%~1"=="prof" (
    set "PASSTHROUGH=%PASSTHROUGH% prof"
) else (
    set "PASSTHROUGH=%PASSTHROUGH% %1"
)
shift
goto parse_loop

:after_parse
set "RUNS=%~dp0..\data\runs"
if "%MODE%"=="toi" (
    set "LIST=20261106-134724_toi_5p 20261106-135452_toi_10p"
) else (
    set "LIST=20261106-130217_sang_5p 20261106-131033_sang_10p 20261106-131804_sang_20p"
)

for %%R in (%LIST%) do (
    echo ===============================================================================
    echo ===== BAT DAU CHUOI: %%R =====
    echo ===============================================================================
    call "%~dp0run_techgar_live.bat" "%RUNS%\%%R"%PASSTHROUGH%
    echo ===== XONG: %%R =====
)
echo Hoan tat chuoi video.
exit /b 0
