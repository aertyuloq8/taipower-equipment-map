param(
  [switch]$NoPush
)

# ==========================================
# 1. 設定環境與解決中文亂碼
# ==========================================
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8

# 建立容錯機制，確保各種環境下都不會報錯
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$env:PYTHONIOENCODING = "utf-8"


# ==========================================
# 2. 建立專屬 Git 工具 (具備抗紅字保護機制)
# ==========================================
function Run-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  
  # 執行 git 指令，並使用 "2>&1" 將惱人的錯誤提示流轉回一般文字
  # 這樣就能避免 PowerShell 動不動就噴出紅字嚇人
  & git @GitArgs 2>&1 | ForEach-Object { Write-Host $_ }
  
  if ($LASTEXITCODE -ne 0) {
    throw "Git 指令執行失敗: git $($GitArgs -join ' ')"
  }
}


# ==========================================
# 3. 確保在正確的專案資料夾中執行
# ==========================================
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path ".git")) {
  throw "此腳本必須在包含 .git 的專案資料夾內執行。"
}


# ==========================================
# 4. 安全檢查：確保沒有未存檔的其他網頁修改
# ==========================================
# 這是為了保護您手動修改的網頁原始碼，在強制更新時不會被覆蓋或衝突
$allowedDirty = @(
  "data/meta.json",
  "data/points.csv",
  "data/points.json",
  "update_database.ps1" # 允許腳本本身的變更
)

$dirty = & git status --porcelain
$blockedDirty = @(
  $dirty | Where-Object {
    $path = $_.Substring(3).Replace("\", "/").Trim('"')
    $allowedDirty -notcontains $path
  }
)

if ($blockedDirty.Count -gt 0) {
  Write-Host "【安全攔截】發現您有修改過以下網頁檔案，請先使用 git 存檔："
  $blockedDirty | ForEach-Object { Write-Host $_ }
  throw "工作目錄中有非資料庫的變更，請先存檔後再執行此腳本。"
}


# ==========================================
# 5. 抓取最新的 Excel 並執行 Python 轉換
# ==========================================
$source = Get-ChildItem -Path $Root -File |
  Where-Object { $_.Extension -match "^\.xls" -and -not $_.Name.StartsWith("~$") } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $source) {
  throw "找不到 Excel 檔案。請先將最新的 Excel 檔案放入專案資料夾中。"
}

Write-Host "讀取最新 Excel 來源: $($source.Name)"
Write-Host "正在轉換為地圖資料庫格式..."

& python ".\tools\convert_excel.py"
if ($LASTEXITCODE -ne 0) {
  throw "Excel 轉換失敗，請檢查 Python 程式或檔案內容。"
}


# ==========================================
# 6. 強制製造變更 (欺騙 Git 系統)
# ==========================================
# 偷偷在 meta.json 尾端加入一個空白，強迫 Git 承認檔案有更新
Write-Host "寫入強制更新標記..."
Add-Content -Path ".\data\meta.json" -Value " "


# ==========================================
# 7. 讀取數據並產生上傳紀錄
# ==========================================
# 使用 -Encoding UTF8 防止中文變成火星文
$meta = Get-Content ".\data\meta.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$converted = "{0:N0}" -f [int]$meta.converted
$message = "強制更新資料庫：$($meta.source) ($converted 筆資料)"

Run-Git add data/meta.json data/points.json data/points.csv

Write-Host "正在打包更新資料庫檔案..."
# 使用 --allow-empty 確保就算內容長得一樣，也能強行建立紀錄
Run-Git commit --allow-empty -m $message

if ($NoPush) {
  Write-Host "已建立 Commit。略過推送到遠端伺服器。"
  exit 0
}


# ==========================================
# 8. 強制與遠端同步並推送 (解決卡進度問題)
# ==========================================
Write-Host "正在與 GitHub 進行強制同步..."
# 加上 --rebase，先整理好本地端與遠端的順序，避免被 GitHub 拒絕
Run-Git pull --rebase origin main

Write-Host "正在將資料庫推送到 GitHub..."
Run-Git push origin main

Write-Host "✅ 資料庫已成功強制更新並推送到 GitHub！"