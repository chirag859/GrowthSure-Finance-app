# Builds deploy/index.html (a complete standalone page with app-install tags) from growthsure-finance.html,
# which stays the single source of truth for the claude.ai artifact.
$src = Join-Path $PSScriptRoot 'growthsure-finance.html'
$out = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force $out | Out-Null

$body = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)

$head = @'
<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="GrowthSure Finance — repayment and stamp duty calculators for every Australian state, government grants and concessions, and the RBA cash rate, kept current every week.">
<meta name="theme-color" content="#0D47A1">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="GrowthSure">
<meta name="application-name" content="GrowthSure Finance">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
[hidden]{display:none!important}
img{max-width:100%}
</style>
</head>
<body>
'@
$tail = "`n</body>`n</html>`n"

[System.IO.File]::WriteAllText((Join-Path $out 'index.html'), $head + $body + $tail, (New-Object System.Text.UTF8Encoding $false))

$manifest = @'
{
  "name": "GrowthSure Finance",
  "short_name": "GrowthSure",
  "description": "Home loan repayments, stamp duty for every state, government grants and the RBA cash rate — from GrowthSure Finance.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F2F6FC",
  "theme_color": "#0D47A1",
  "lang": "en-AU",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
'@
[System.IO.File]::WriteAllText((Join-Path $out 'manifest.webmanifest'), $manifest, (New-Object System.Text.UTF8Encoding $false))

# GitHub Pages custom domain
[System.IO.File]::WriteAllText((Join-Path $out 'CNAME'), "app.growthsure.com.au`n", (New-Object System.Text.UTF8Encoding $false))
# Tell GitHub Pages not to run its Jekyll processor
[System.IO.File]::WriteAllText((Join-Path $out '.nojekyll'), '', (New-Object System.Text.UTF8Encoding $false))

Get-ChildItem $out -Force | Select-Object Name, Length
