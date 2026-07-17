Add-Type -AssemblyName System.Drawing
$imgPath = 'c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\image.png'
$img = [System.Drawing.Image]::FromFile($imgPath)
$bmp = New-Object System.Drawing.Bitmap($img)

$y = [math]::Floor($bmp.Height / 2)
$left = -1
$right = -1

for ($x = 0; $x -lt $bmp.Width; $x++) {
    $c = $bmp.GetPixel($x, $y)
    if (($c.R -lt 245 -or $c.G -lt 245 -or $c.B -lt 245) -and $c.A -gt 50) {
        if ($left -eq -1) { $left = $x }
        $right = $x
    }
}

$x_mid = [math]::Floor($bmp.Width / 2)
$top = -1
$bottom = -1

for ($i = 0; $i -lt $bmp.Height; $i++) {
    $c = $bmp.GetPixel($x_mid, $i)
    if (($c.R -lt 245 -or $c.G -lt 245 -or $c.B -lt 245) -and $c.A -gt 50) {
        if ($top -eq -1) { $top = $i }
        $bottom = $i
    }
}

Write-Output "Left: $left, Right: $right, Top: $top, Bottom: $bottom"

$bmp.Dispose()
$img.Dispose()
