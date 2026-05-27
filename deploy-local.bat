@echo off
echo ========================================
echo  本機 Docker 部署腳本
echo ========================================
echo.
cd /d d:\erp_cindy

REM ── 1. 讀出目前 Dockerfile 中的 BUILD_TS，序號 +1 ──────────────
for /f "tokens=2 delims==" %%A in ('findstr "ARG BUILD_TS=" Dockerfile') do set OLD_TS=%%A

REM 取日期部分（前8碼）和序號（後2碼）
set DATE_PART=%OLD_TS:~0,8%
set SEQ_PART=%OLD_TS:~9,2%

REM 今天日期（yyyymmdd）
for /f "tokens=*" %%D in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set TODAY=%%D

REM 若日期不同就從01開始；相同則 +1
if "%DATE_PART%"=="%TODAY%" (
  for /f "tokens=*" %%N in ('powershell -NoProfile -Command "'{0:D2}' -f ([int]'%SEQ_PART%' + 1)"') do set NEW_SEQ=%%N
) else (
  set NEW_SEQ=01
)
set NEW_TS=%TODAY%_%NEW_SEQ%

echo [1] BUILD_TS: %OLD_TS% ^-^> %NEW_TS%
powershell -NoProfile -Command "(Get-Content Dockerfile -Raw) -replace 'ARG BUILD_TS=\S+', 'ARG BUILD_TS=%NEW_TS%' | Set-Content Dockerfile -Encoding utf8"
echo     Dockerfile 已更新

REM ── 2. Build ─────────────────────────────────────────────────────
echo.
echo [2] docker compose build app ...
docker compose build app
if %ERRORLEVEL% NEQ 0 (
  echo [X] Build 失敗！請查看上方錯誤。
  pause & exit /b 1
)
echo     Build 完成 ^(image: erp_cindy:latest^)

REM ── 3. Force-recreate 容器（確保舊容器被換掉）────────────────────
echo.
echo [3] 重啟容器（force-recreate）...
docker compose up -d --force-recreate app
if %ERRORLEVEL% NEQ 0 (
  echo [X] 容器啟動失敗！
  pause & exit /b 1
)

REM ── 4. 等 3 秒後確認容器狀態 ─────────────────────────────────────
timeout /t 3 /nobreak >nul
echo.
docker compose ps app

echo.
echo ========================================
echo  完成！http://localhost:3000
echo  BUILD_TS = %NEW_TS%
echo ========================================
pause
