param(
  [switch]$NoPush
)

# 1. 設定環境與編碼
# 設定錯誤發生時立即停止腳本，避免產生更多錯誤
$ErrorActionPreference = "Stop"

# 設定 PowerShell 傳遞資料時的輸出編碼為 UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 使用 try-catch 建立容錯機制，確保在沒有標準終端機的環境下不會報錯
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # 靜默略過
}

$env:PYTHONIOENCODING = "utf-8"


# 2. 建立執行 Git 指令的專屬工具
function Run-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Git 指令執行失敗: git $($GitArgs -join ' ')"
  }
}


# 3. 定位腳本所在資料夾
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path ".git")) {
  throw "此腳本必須在包含 .git 的專案資料夾內執行。"
}


# 4. 檢查是否有尚未存檔的其他變更
$allowedDirty = @(
  "data/meta.json",
  "data/points.csv",
  "data/points.json"
)

$dirty = & git status --porcelain
$blockedDirty = @(
  $dirty | Where-Object {
    $path = $_.Substring(3).Replace("\", "/").Trim('"')
    $allowedDirty -notcontains $path
  }
)

if ($blockedDirty.Count -gt 0) {
  Write-Host "在更新資料庫之前，請先 commit 或 stash 這些非資料庫的變更檔案："
  $blockedDirty | ForEach-Object { Write-Host $_ }
  throw "工作目錄中有非資料庫的變更，請先處理。"
}


# 5. 尋找最新的 Excel 檔案
$source = Get-ChildItem -Path $Root -File |
  Where-Object { $_.Extension -match "^\.xls" -and -not $_.Name.StartsWith("~$") } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $source) {
  throw "找不到 Excel 檔案。請先將最新的 Excel 檔案放入專案資料夾中。"
}

Write-Host "使用最新的 Excel 來源檔案: $($source.Name)"
Write-Host "正在將 Excel 轉換為 JSON 與 CSV 格式..."


# 6. 執行 Python 轉換程式
& python ".\tools\convert_excel.py"
if ($LASTEXITCODE -ne 0) {
  throw "Excel 轉換失敗，請檢查 Python 程式或檔案內容。"
}


# 7. 將轉換結果加入 Git 並準備提交
Run-Git add -- data/points.json data/points.csv data/meta.json

$cachedChanges = & git diff --cached --name-only
if (-not $cachedChanges) {
  Write-Host "資料庫內容沒有變更，無需更新。"
  exit 0
}

# ==========================================
# 🌟 關鍵修復點在這裡 🌟
# 加入 -Encoding UTF8 強制使用正確的編碼讀取檔案，防止亂碼破壞 JSON 格式
# ==========================================
$meta = Get-Content ".\data\meta.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$converted = "{0:N0}" -f [int]$meta.converted
$message = "Update map database from $($meta.source) ($converted points)"

Write-Host "正在提交資料庫更新..."
Run-Git commit -m $message

if ($NoPush) {
  Write-Host "已建立 Commit。因為使用了 -NoPush 參數，略過上傳 (Push) 步驟。"
  exit 0
}


# 8. 推送更新到 GitHub 遠端伺服器
Write-Host "正在檢查 GitHub 遠端是否有其他人更新..."
Run-Git fetch origin main

$status = & git status -sb
if ($status -match "behind") {
  Write-Host "遠端 main 分支有更新。正在重新合併本地更新..."
  Run-Git pull --rebase origin main
}

Write-Host "正在將資料庫更新推送到 GitHub..."
Run-Git push origin main
Write-Host "✅ 資料庫更新已成功推送到 GitHub！"