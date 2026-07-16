Add-Type -AssemblyName System.Drawing
$origPath = 'c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\logo.png'
$img = [System.Drawing.Image]::FromFile($origPath)

# Create 512x512 Maskable Icon with white background
$bmp512 = New-Object System.Drawing.Bitmap(512, 512)
$g512 = [System.Drawing.Graphics]::FromImage($bmp512)
$g512.Clear([System.Drawing.Color]::White)
# Draw original logo centered and slightly scaled down to be safe (e.g. 400x400)
$g512.DrawImage($img, 56, 56, 400, 400)
$bmp512.Save('c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\icon-512.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g512.Dispose()
$bmp512.Dispose()

# Create 192x192 Maskable Icon
$bmp192 = New-Object System.Drawing.Bitmap(192, 192)
$g192 = [System.Drawing.Graphics]::FromImage($bmp192)
$g192.Clear([System.Drawing.Color]::White)
$g192.DrawImage($img, 21, 21, 150, 150)
$bmp192.Save('c:\Users\ABDUL WAHID\OneDrive\Desktop\registration\icon-192.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g192.Dispose()
$bmp192.Dispose()

$img.Dispose()
Write-Output "Icons generated successfully!"
