Add-Type -AssemblyName System.Drawing
$out = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force $out | Out-Null

# GrowthSure arrow, taken from logo.svg on growthsure.com.au (pure straight-line polygon)
$pts = @(
  @(23.565,14.788),@(23.565,26.068),@(19.108,26.068),@(19.108,22.425),@(17.737,23.815),
  @(16.879,24.685),@(11.62,30.018),@(6.708,35),@(0.332,35),@(6.643,28.592),
  @(15.796,19.309),@(12.695,19.309),@(12.695,14.788)
)
$minX = 0.332; $maxX = 23.565; $minY = 14.788; $maxY = 35

function Make-Icon([int]$size, [string]$file, [string]$bgHex, [string]$fgHex, [double]$fill) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($bgHex))
  $w = $maxX - $minX; $h = $maxY - $minY
  $scale = ($size * $fill) / [Math]::Max($w, $h)
  $ox = ($size - $w * $scale) / 2; $oy = ($size - $h * $scale) / 2
  $poly = New-Object 'System.Drawing.PointF[]' $pts.Count
  for ($i = 0; $i -lt $pts.Count; $i++) {
    $poly[$i] = New-Object System.Drawing.PointF ([single](($pts[$i][0] - $minX) * $scale + $ox)), ([single](($pts[$i][1] - $minY) * $scale + $oy))
  }
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($fgHex))
  $g.FillPolygon($brush, $poly)
  $g.Dispose()
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Blue tile, white arrow: iOS home screen (iOS rounds the corners itself) and Android maskable
Make-Icon 180 'apple-touch-icon.png' '#0D47A1' '#FFFFFF' 0.58
Make-Icon 192 'icon-192.png'         '#0D47A1' '#FFFFFF' 0.58
Make-Icon 512 'icon-512.png'         '#0D47A1' '#FFFFFF' 0.58
# Alternative: brand red tile, for comparison
Make-Icon 512 'icon-512-red.png'     '#DC3F4D' '#FFFFFF' 0.58
Get-ChildItem $out | Select-Object Name, Length
