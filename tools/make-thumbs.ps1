# Crea las miniaturas que falten en data/thumbs/ a partir de data/images/.
# El panel nuevo ya genera la miniatura al subir cada foto; este script es para
# las fotos subidas con el panel anterior. Se puede correr las veces que haga falta.
#
# Uso (desde la carpeta del proyecto):  powershell -File tools\make-thumbs.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root    = Split-Path -Parent $PSScriptRoot
$images  = Join-Path $root 'data\images'
$thumbs  = Join-Path $root 'data\thumbs'
$maxSide = 480

New-Item -ItemType Directory -Force $thumbs | Out-Null

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = New-Object System.Drawing.Imaging.EncoderParameters 1
$quality.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 80L

$created = 0
# Solo JPG: Windows no sabe leer WebP, y las fotos WebP las sube el panel nuevo ya con su miniatura
foreach ($file in Get-ChildItem $images -File | Where-Object { $_.Extension -match '^\.jpe?g$' }) {
    $target = Join-Path $thumbs $file.Name
    if (Test-Path $target) { continue }

    $source = [System.Drawing.Image]::FromFile($file.FullName)
    try {
        # 1.0 y no 1: con un entero PowerShell elige Min(int, int) y redondea la escala a 0 o 1
        $scale  = [Math]::Min(1.0, $maxSide / [Math]::Max($source.Width, $source.Height))
        $width  = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
        $height = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))

        $thumb = New-Object System.Drawing.Bitmap $width, $height
        $graphics = [System.Drawing.Graphics]::FromImage($thumb)
        $graphics.InterpolationMode = 'HighQualityBicubic'
        $graphics.PixelOffsetMode = 'HighQuality'
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.DrawImage($source, 0, 0, $width, $height)
        $graphics.Dispose()

        $thumb.Save($target, $jpeg, $quality)
        $thumb.Dispose()
        $created++
    }
    finally {
        $source.Dispose()
    }
}

Write-Output "Miniaturas creadas: $created"
