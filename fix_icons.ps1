Add-Type -AssemblyName System.Drawing
$origPath = 'c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\logo.png'
$img = [System.Drawing.Image]::FromFile($origPath)

$ratio = $img.Width / $img.Height

function Generate-Icon {
    param($size, $margin, $path)
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    $safeSize = $size - (2 * $margin)
    
    if ($ratio -gt 1) {
        $w = $safeSize
        $h = [int]($safeSize / $ratio)
        $x = $margin
        $y = $margin + ($safeSize - $h) / 2
    } else {
        $h = $safeSize
        $w = [int]($safeSize * $ratio)
        $y = $margin
        $x = $margin + ($safeSize - $w) / 2
    }
    
    $g.DrawImage($img, $x, $y, $w, $h)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Generate-Icon -size 512 -margin 56 -path 'c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\icon-512.png'
Generate-Icon -size 192 -margin 21 -path 'c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\icon-192.png'

$img.Dispose()
Write-Output "Icons fixed successfully!"
