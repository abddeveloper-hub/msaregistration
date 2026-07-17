Add-Type -AssemblyName System.Drawing
$imgPath = 'c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\image.png'
$img = [System.Drawing.Image]::FromFile($imgPath)

# Shrinking the size by 10 pixels (5 pixels per side) to remove any white edge
$size = 346
$centerX = 466
$centerY = 290

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $size, $size)
$g.SetClip($path)

$x = -($centerX - [math]::Floor($size/2))
$y = -($centerY - [math]::Floor($size/2))
$g.DrawImage($img, $x, $y, $img.Width, $img.Height)

$bmp.Save('c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\logo.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()

$bmp512 = New-Object System.Drawing.Bitmap(512, 512)
$g512 = [System.Drawing.Graphics]::FromImage($bmp512)
$g512.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g512.Clear([System.Drawing.Color]::Transparent)
$g512.DrawImage($bmp, 56, 56, 400, 400)
$bmp512.Save('c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\icon-512.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g512.Dispose()
$bmp512.Dispose()

$bmp192 = New-Object System.Drawing.Bitmap(192, 192)
$g192 = [System.Drawing.Graphics]::FromImage($bmp192)
$g192.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g192.Clear([System.Drawing.Color]::Transparent)
$g192.DrawImage($bmp, 21, 21, 150, 150)
$bmp192.Save('c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\icon-192.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g192.Dispose()
$bmp192.Dispose()

$bmp.Dispose()
$img.Dispose()
Write-Output "Shrunk circle icons generated successfully!"
