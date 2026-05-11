$ErrorActionPreference = "Stop"

Write-Host "1/4 Convert Excel to map data..."
python tools\convert_excel.py

Write-Host "2/4 Check generated files..."
if (!(Test-Path "data\points.json")) {
  throw "data\points.json was not generated."
}
if (!(Test-Path "data\meta.json")) {
  throw "data\meta.json was not generated."
}

Write-Host "3/4 Commit changes if needed..."
git add data\points.json data\points.csv data\meta.json
$changed = git diff --cached --quiet; $hasNoChanges = $LASTEXITCODE -eq 0
if ($hasNoChanges) {
  Write-Host "No data changes to commit."
} else {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "Update map data $stamp"
}

Write-Host "4/4 Push to GitHub..."
git push

Write-Host "Done. GitHub Pages will refresh automatically after the push finishes."
