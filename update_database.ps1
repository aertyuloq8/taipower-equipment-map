param(
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

function Run-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed"
  }
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path ".git")) {
  throw "This script must be run from the webpro Git repository."
}

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
  Write-Host "Please commit or stash these non-database changes before updating the database:"
  $blockedDirty | ForEach-Object { Write-Host $_ }
  throw "Working tree has non-database changes."
}

$source = Get-ChildItem -Path $Root -File |
  Where-Object { $_.Extension -match "^\.xls" -and -not $_.Name.StartsWith("~$") } |
  Where-Object { -not $_.Name.StartsWith("~$") } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $source) {
  throw "No Excel source file found in $Root. Put the latest *.xls* file in the project root first."
}

Write-Host "Using latest Excel source: $($source.Name)"
Write-Host "Converting Excel to data/points.json, data/points.csv, data/meta.json..."
& python ".\tools\convert_excel.py"
if ($LASTEXITCODE -ne 0) {
  throw "Excel conversion failed."
}

Run-Git add -- data/points.json data/points.csv data/meta.json

$cachedChanges = & git diff --cached --name-only
if (-not $cachedChanges) {
  Write-Host "No database changes to commit."
  exit 0
}

$meta = Get-Content ".\data\meta.json" -Raw | ConvertFrom-Json
$converted = "{0:N0}" -f [int]$meta.converted
$message = "Update map database from $($meta.source) ($converted points)"

Write-Host "Committing database update..."
Run-Git commit -m $message

if ($NoPush) {
  Write-Host "Commit created. Skipping push because -NoPush was used."
  exit 0
}

Write-Host "Checking GitHub for newer commits..."
Run-Git fetch origin main

$status = & git status -sb
if ($status -match "behind") {
  Write-Host "Remote main has newer commits. Rebasing local database update..."
  Run-Git pull --rebase origin main
}

Write-Host "Pushing database update to GitHub..."
Run-Git push origin main
Write-Host "Database update pushed successfully."
