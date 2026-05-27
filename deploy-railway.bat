@echo off
echo ========================================
echo  Railway 部署腳本（Token 模式）
echo ========================================
echo.

cd /d d:\erp_cindy

REM ===== 請將你的 Railway Token 貼到下面等號後面 =====
REM 到 https://railway.app/account/tokens 建立 Token
REM 格式範例：set RAILWAY_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
set RAILWAY_TOKEN=

REM ====================================================

if "%RAILWAY_TOKEN%"=="" (
    echo [!] 尚未設定 RAILWAY_TOKEN
    echo.
    echo 請用記事本開啟此檔案，找到第 12 行：
    echo   set RAILWAY_TOKEN=
    echo 在等號後面貼上你的 Token，儲存後再雙擊執行。
    echo.
    echo 取得 Token：https://railway.app/account/tokens
    echo.
    pause
    exit /b 1
)

echo [1] 驗證 Token...
railway whoami
if %ERRORLEVEL% NEQ 0 (
    echo Token 無效，請重新取得。
    pause
    exit /b 1
)

echo.
echo [2] 部署到 Railway...
railway up --detach

echo.
if %ERRORLEVEL% EQU 0 (
    echo 部署已送出！約 3-5 分鐘後生效。
    echo 查看進度：https://railway.app/dashboard
    echo 網站網址：https://ligamanagement-system.up.railway.app
) else (
    echo 部署失敗，請截圖這個視窗傳給我。
)

echo.
pause
