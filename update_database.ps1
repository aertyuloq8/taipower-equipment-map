param(
  [switch]$NoPush
)

# 1. 設定環境與編碼
# 設定錯誤發生時立即停止腳本，避免產生更多錯誤
$ErrorActionPreference = "Stop"

# 設定 PowerShell 傳遞資料時的輸出編碼為 UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 使用 try-catch 建立容錯機制。
# 確保在沒有標準終端機的環境下 (例如 PowerShell ISE) 執行時，不會因為「控制代碼無效」而報錯中斷。
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # 如果無法設定 Console 編碼，就靜默略過，不影響程式執行
}

$env:PYTHONIOENCODING = "utf-8"


# 2. 建立執行 Git 指令的專屬工具
function Run-Git {
  # 使用 $GitArgs 接收指令，避免使用系統保留字產生衝突
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  
  # 執行 git 指令
  & git @GitArgs
  
  # 檢查上一個指令是否成功執行 (0 代表成功)
  if ($LASTEXITCODE -ne 0) {
    throw "Git 指令執行失敗: git $($GitArgs -join ' ')"
  }
}


# 3. 定位腳本所在資料夾
# 取得目前腳本所在的資料夾路徑，並將工作目錄切換到該處
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# 檢查是否在正確的 Git 專案資料夾內 (必須有 .git 隱藏資料夾)
if (-not (Test-Path ".git")) {
  throw "此腳本必須在包含 .git 的專案資料夾內執行。"
}


# 4. 檢查是否有尚未存檔的其他變更
# 只允許以下三個資料庫相關檔案有變更
$allowedDirty = @(
  "data/meta.json",
  "data/points.csv",
  "data/points.json"
)

# 抓取目前 Git 的變更狀態
$dirty = & git status --porcelain
$blockedDirty = @(
  $dirty | Where-Object {
    $path = $_.Substring(3).Replace("\", "/").Trim('"')
    $allowedDirty -notcontains $path
  }
)

# 如果有非資料庫的檔案被修改了，則阻擋執行，要求您先處理
if ($blockedDirty.Count -gt 0) {
  Write-Host "在更新資料庫之前，請先 commit 或 stash 這些非資料庫的變更檔案："
  $blockedDirty | ForEach-Object { Write-Host $_ }
  throw "工作目錄中有非資料庫的變更，請先處理。"
}


# 5. 尋找最新的 Excel 檔案
# 自動抓取資料夾中最晚修改的 .xls 或 .xlsx 檔案，並排除開啟時產生的 ~$ 暫存檔
$source = Get-ChildItem -Path $Root -File |
  Where-Object { $_.Extension -match "^\.xls" -and -not $_.Name.StartsWith("~$") } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

# 如果找不到 Excel 檔案，則停止並提醒
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

# 檢查是否有實際的變更準備提交
$cachedChanges = & git diff --cached --name-only
if (-not $cachedChanges) {
  Write-Host "資料庫內容沒有變更，無需更新。"
  exit 0
}

# 讀取 meta.json 取得轉換資訊，準備產生自動備註 (Commit 訊息)
$meta = Get-Content ".\data\meta.json" -Raw | ConvertFrom-Json
$converted = "{0:N0}" -f [int]$meta.converted
$message = "Update map database from $($meta.source) ($converted points)"

Write-Host "正在提交資料庫更新..."
Run-Git commit -m $message

# 如果您執行時加上了 -NoPush 參數，則到此結束，不推送到遠端
if ($NoPush) {
  Write-Host "已建立 Commit。因為使用了 -NoPush 參數，略過上傳 (Push) 步驟。"
  exit 0
}


# 8. 推送更新到 GitHub 遠端伺服器
Write-Host "正在檢查 GitHub 遠端是否有其他人更新..."
Run-Git fetch origin main

# 檢查本地端是否落後於遠端，如果是則自動重新整理 (Rebase)
$status = & git status -sb
if ($status -match "behind") {
  Write-Host "遠端 main 分支有更新。正在重新合併本地更新..."
  Run-Git pull --rebase origin main
}

Write-Host "正在將資料庫更新推送到 GitHub..."
Run-Git push origin main
Write-Host "✅ 資料庫更新已成功推送到 GitHub！"