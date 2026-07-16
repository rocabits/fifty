Add-Type -AssemblyName System.Drawing

function New-Icon($size, $outputPath) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'
  $g.InterpolationMode = 'HighQualityBicubic'

  $green = [System.Drawing.Color]::FromArgb(46, 204, 113)
  $white = [System.Drawing.Color]::FromArgb(255, 255, 255)

  $g.Clear($green)

  $s = [double]($size) / 100.0
  $wb = New-Object System.Drawing.SolidBrush($white)
  $gb = New-Object System.Drawing.SolidBrush($green)

  # White circle
  $g.FillEllipse($wb, [float]((50-38)*$s), [float]((50-38)*$s), [float](76*$s), [float](76*$s))

  # "50" text
  $fontSize = [float](36*$s)
  $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString("50", $font, $gb, [float](50*$s), [float](50*$s), $fmt)
  $font.Dispose()
  $fmt.Dispose()

  $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $wb.Dispose()
  $g.Dispose(); $bmp.Dispose()
}

$root = "C:\Users\PEPELUIS\Desktop\apps\fifty"
New-Icon 192 "$root\icon-192.png"
New-Icon 512 "$root\icon-512.png"
Write-Host "Iconos generados correctamente"
