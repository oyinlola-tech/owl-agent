& {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $Repo = 'oyinlola-tech/owl-agent'
    $ApiUrl = "https://api.github.com/repos/$Repo/releases"
    $ChecksumFile = 'SHA256SUMS.txt'

    function Write-OwlMessage([string]$Text) {
        Write-Information "owl-install: $Text" -InformationAction Continue
    }

    function Exit-OwlInstall([string]$Text) {
        throw "owl-install: error: $Text"
    }

    function Show-OwlHelp {
        @'
Install the OWL desktop app on Windows from GitHub Releases.

Usage (PowerShell):
  irm https://raw.githubusercontent.com/oyinlola-tech/owl-agent/main/scripts/install/owl.install.ps1 | iex

Environment variables:
  $env:OWL_VERSION = "vX.Y.Z"      Install this release tag instead of the latest one.
  $env:OWL_INSTALL_FORMAT = "msi"  Use the .msi installer instead of the -setup.exe one.
  $env:OWL_SKIP_CHECKSUM = "1"     Install even when SHA256SUMS.txt is missing or does not match.
                                   Not recommended.
  $env:OWL_RELEASE_JSON = "FILE"   Read release details from FILE instead of the GitHub API (testing).
  $env:OWL_DRY_RUN = "1"           Show which file would be installed, then stop.
  $env:OWL_HELP = "1"              Show this help.
'@ | ForEach-Object { Write-Information $_ -InformationAction Continue }
    }

    function Get-OwlRelease {
        if ($env:OWL_RELEASE_JSON) {
            return Get-Content -Raw -LiteralPath $env:OWL_RELEASE_JSON | ConvertFrom-Json
        }
        $headers = @{ 'User-Agent' = 'owl-installer'; 'Accept' = 'application/vnd.github+json' }
        $url = if ($env:OWL_VERSION) { "$ApiUrl/tags/$($env:OWL_VERSION)" } else { "$ApiUrl/latest" }
        try {
            return Invoke-RestMethod -Uri $url -Headers $headers
        } catch {
            if ($env:OWL_VERSION) { Exit-OwlInstall "release $($env:OWL_VERSION) was not found" }
            Exit-OwlInstall 'could not read the latest release (none published yet?)'
        }
    }

    function Get-OwlAssetPattern {
        $arch = if ($env:OWL_ARCH) { $env:OWL_ARCH } else { $env:PROCESSOR_ARCHITECTURE }
        $archTag = switch ($arch) {
            'AMD64' { 'x64' }
            'ARM64' { 'arm64' }
            default { Exit-OwlInstall "unsupported processor '$arch'" }
        }
        $format = if ($env:OWL_INSTALL_FORMAT) { $env:OWL_INSTALL_FORMAT.ToLowerInvariant() } else { 'exe' }
        switch ($format) {
            'exe' { return "_$archTag-setup\.exe$" }
            'nsis' { return "_$archTag-setup\.exe$" }
            'msi' { return "_$archTag" + '_[A-Za-z-]+\.msi$' }
            default { Exit-OwlInstall "unknown install format '$format' (use exe or msi)" }
        }
    }

    function Find-OwlAsset($Release, [string]$Pattern) {
        return @($Release.assets | Where-Object { $_.name -match $Pattern }) | Select-Object -First 1
    }

    function Get-OwlExpectedHash([string]$SumsPath, [string]$FileName) {
        foreach ($line in Get-Content -LiteralPath $SumsPath) {
            $parts = $line -split '\s+', 2
            if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $FileName) {
                return $parts[0].ToLowerInvariant()
            }
        }
        return ''
    }

    function Confirm-OwlChecksum([string]$FilePath, [string]$FileName, $SumsAsset, [string]$WorkDir) {
        $skip = $env:OWL_SKIP_CHECKSUM -eq '1'
        if (-not $SumsAsset) {
            if ($skip) {
                Write-Warning "This release has no $ChecksumFile; installing WITHOUT checking the download."
                return
            }
            Exit-OwlInstall "this release has no $ChecksumFile, so the download cannot be checked. Set `$env:OWL_SKIP_CHECKSUM='1' to install anyway (not recommended)."
        }
        $sumsPath = Join-Path $WorkDir $ChecksumFile
        Invoke-WebRequest -Uri $SumsAsset.browser_download_url -OutFile $sumsPath -UseBasicParsing
        $expected = Get-OwlExpectedHash $sumsPath $FileName
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $FilePath).Hash.ToLowerInvariant()
        if ($expected -and $expected -eq $actual) {
            Write-OwlMessage "checksum OK ($actual)"
            return
        }
        if ($skip) {
            Write-Warning "Checksum check FAILED for $FileName (expected '$expected', got '$actual'). Installing anyway because OWL_SKIP_CHECKSUM=1."
            return
        }
        Exit-OwlInstall "checksum mismatch for $FileName (expected '$expected', got '$actual'). Nothing was installed."
    }

    function Install-Owl {
        if ($env:OWL_HELP -eq '1') { Show-OwlHelp; return }
        $release = Get-OwlRelease
        $tag = $release.tag_name
        $asset = Find-OwlAsset $release (Get-OwlAssetPattern)
        if (-not $asset) { Exit-OwlInstall "release $tag has no matching Windows installer" }
        $sumsAsset = Find-OwlAsset $release "^$([regex]::Escape($ChecksumFile))$"
        Write-OwlMessage "release:  $tag"
        Write-OwlMessage "file:     $($asset.name)"
        Write-OwlMessage "checksum: $(if ($sumsAsset) { $sumsAsset.browser_download_url } else { 'MISSING' })"
        if ($env:OWL_DRY_RUN -eq '1') {
            Write-OwlMessage 'dry run: nothing downloaded or installed'
            return
        }
        if (-not $sumsAsset -and $env:OWL_SKIP_CHECKSUM -ne '1') {
            Exit-OwlInstall "this release has no $ChecksumFile, so the download cannot be checked. Set `$env:OWL_SKIP_CHECKSUM='1' to install anyway (not recommended)."
        }

        $workDir = Join-Path ([System.IO.Path]::GetTempPath()) ("owl-install-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $workDir | Out-Null
        try {
            $installer = Join-Path $workDir $asset.name
            Write-OwlMessage "downloading $($asset.name)"
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -UseBasicParsing
            Confirm-OwlChecksum -FilePath $installer -FileName $asset.name -SumsAsset $sumsAsset -WorkDir $workDir

            Write-OwlMessage ''
            Write-OwlMessage 'OWL is not code-signed yet. Windows SmartScreen may show "Windows protected your PC".'
            Write-OwlMessage 'If it does, click "More info" and then "Run anyway". Only do this for files that passed the checksum above.'
            Write-OwlMessage ''
            Write-OwlMessage "starting the installer: $($asset.name)"
            if ($asset.name -like '*.msi') {
                $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$installer`"") -Wait -PassThru
            } else {
                $process = Start-Process -FilePath $installer -Wait -PassThru
            }
            if ($process.ExitCode -ne 0) { Exit-OwlInstall "the installer exited with code $($process.ExitCode)" }
            Write-OwlMessage 'done. Start OWL from the Start menu.'
        } finally {
            Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Install-Owl
}
