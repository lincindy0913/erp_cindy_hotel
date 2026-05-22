# ============================================================
#  deploy.ps1 — 一鍵部署到 Railway
#  使用方式：在 PowerShell 執行  .\deploy.ps1
# ============================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ERP Cindy — Railway 部署腳本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. 取得 Token ----------
$token = $env:RAILWAY_TOKEN
if (-not $token) {
    Write-Host "請輸入你的 Railway Token" -ForegroundColor Yellow
    Write-Host "（到 https://railway.app/account/tokens 建立，貼上後按 Enter）" -ForegroundColor Gray
    $token = Read-Host "RAILWAY_TOKEN"
}

if (-not $token) {
    Write-Host "[錯誤] Token 不可為空" -ForegroundColor Red
    exit 1
}

$env:RAILWAY_TOKEN = $token

# ---------- 2. 驗證 Token ----------
Write-Host ""
Write-Host "[1/4] 驗證 Railway Token..." -ForegroundColor Cyan
$whoami = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[錯誤] Token 無效：$whoami" -ForegroundColor Red
    Write-Host "請到 https://railway.app/account/tokens 重新建立 Token" -ForegroundColor Yellow
    exit 1
}
Write-Host "      已驗證：$whoami" -ForegroundColor Green

# ---------- 3. 確認目前程式碼 ----------
Write-Host ""
Write-Host "[2/4] 確認程式碼狀態..." -ForegroundColor Cyan
$gitLog = git log --oneline -3
Write-Host "      最新 commits：" -ForegroundColor Gray
$gitLog | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }

# ---------- 4. 部署到 Railway ----------
Write-Host ""
Write-Host "[3/4] 上傳並部署到 Railway..." -ForegroundColor Cyan
Write-Host "      （這會花 3~5 分鐘，請等待）" -ForegroundColor Gray
railway up --detach --service erp_cindy_hotel
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[!] railway up 失敗，嘗試不指定 service 名稱..." -ForegroundColor Yellow
    railway up --detach
}

# ---------- 5. 完成 ----------
Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "[4/4] 部署已送出！" -ForegroundColor Green
    Write-Host ""
    Write-Host "  查看部署進度：https://railway.app/dashboard" -ForegroundColor Cyan
    Write-Host "  正式站網址：  https://ligamanagement-system.up.railway.app" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  約 3~5 分鐘後網站更新完成。" -ForegroundColor Green
} else {
    Write-Host "[錯誤] 部署失敗，請截圖視窗內容傳給我。" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意鍵關閉..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
