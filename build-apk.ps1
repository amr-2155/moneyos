# MoneyOS APK rebuild helper
# 1) Ensures the backend + public tunnel are running
# 2) Builds the web app pointed at the current tunnel URL
# 3) Syncs Capacitor and builds a fresh APK
# Usage: powershell -ExecutionPolicy Bypass -File .\build-apk.ps1

$ErrorActionPreference = "Stop"
$root = "C:\Users\A\Documents\New folder\moneyos"
$web = "$root\web"
$tools = "C:\Users\A\AppData\Local\Temp\opencode\cloudflared"
$tunnelLog = "$tools\tunnel.log"
$out = "C:\Users\A\Documents\New folder\MoneyOS.apk"

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:ANDROID_HOME = "C:\Android"
$env:ANDROID_SDK_ROOT = "C:\Android"

if (-not (Test-Path "$root\dist\server.js")) {
    Write-Host "Building backend..."
    Push-Location $root
    npm run build | Out-Host
    Pop-Location
}

if (-not (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host "Starting backend..."
    Start-Process node -ArgumentList '--env-file=.env', 'dist/server.js' -WorkingDirectory $root -WindowStyle Hidden
    Start-Sleep -Seconds 6
}

if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "Starting public tunnel..."
    Start-Process "$tools\cloudflared.exe" -ArgumentList 'tunnel', '--url', 'http://localhost:3001', '--no-autoupdate' -RedirectStandardOutput $tunnelLog -RedirectStandardError "$tunnelLog.err" -WindowStyle Hidden
    Start-Sleep -Seconds 20
}

$match = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue
$tunnelUrl = $match.Line | ForEach-Object { ($_ -split 'https://')[1] } | ForEach-Object { "https://$_" } | Select-Object -Last 1
if (-not $tunnelUrl) {
    $tunnelUrl = "https://$((Get-Content $tunnelLog -Raw) | Select-String -Pattern '[a-z0-9-]+\.trycloudflare\.com' -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -Last 1)"
}
if (-not $tunnelUrl) { throw "Could not read the tunnel URL from $tunnelLog" }
Write-Host "Public URL: $tunnelUrl"

Push-Location $web
Write-Host "Building web with API URL..."
$env:VITE_API_URL = $tunnelUrl
npm run build | Out-Host
Write-Host "Syncing Capacitor..."
npx cap sync android | Out-Host
Pop-Location

Write-Host "Building APK..."
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
Push-Location "$web\android"
Start-Process cmd.exe -ArgumentList '/c', 'gradlew.bat assembleDebug > gradle-build.log 2>&1' -WindowStyle Hidden
$deadline = (Get-Date).AddMinutes(20)
do {
    Start-Sleep -Seconds 10
    $log = Get-Content "$web\android\gradle-build.log" -Raw -ErrorAction SilentlyContinue
} while ($log -notmatch 'BUILD SUCCESSFUL|BUILD FAILED' -and (Get-Date) -lt $deadline)
Pop-Location

if ($log -match 'BUILD FAILED') {
    Write-Host "APK build failed. See $web\android\gradle-build.log"
    exit 1
}

Copy-Item "$web\android\app\build\outputs\apk\debug\app-debug.apk" $out -Force
Write-Host "APK ready: $out"
Write-Host "Note: the app works while this PC stays on (backend + tunnel)."
