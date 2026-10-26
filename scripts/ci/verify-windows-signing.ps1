$ErrorActionPreference = 'Stop'
function Assert-Signed([string]$file) {
    if (-not (Test-Path $file)) { throw "Expected signed file is missing: $file" }
    $signature = Get-AuthenticodeSignature $file
    Write-Output "$file : $($signature.Status)"
    if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature: $file" }
}
$bundle = 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle'
$nsis = @(Get-ChildItem "$bundle/nsis/*-setup.exe")
$msi = @(Get-ChildItem "$bundle/msi/*.msi")
if ($nsis.Count -ne 1 -or $msi.Count -ne 1) { throw 'Expected one NSIS and one MSI installer' }
foreach ($installer in @($nsis[0], $msi[0])) { Assert-Signed $installer.FullName }
# Verify the payload actually installed by NSIS, not only the outer container.
$installDir = Join-Path $env:RUNNER_TEMP 'ocs-signature-check'
$process = Start-Process $nsis[0].FullName -ArgumentList @('/S', "/D=$installDir") -PassThru
if (-not $process.WaitForExit(600000)) { $process.Kill(); throw 'Installer timed out' }
if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)" }
try {
    Assert-Signed (Join-Path $installDir 'Open Calc Studio.exe')
    Assert-Signed (Join-Path $installDir 'uninstall.exe')
} finally {
    $uninstaller = Join-Path $installDir 'uninstall.exe'
    if (Test-Path $uninstaller) {
        $cleanup = Start-Process $uninstaller -ArgumentList '/S' -PassThru
        if (-not $cleanup.WaitForExit(120000)) { $cleanup.Kill(); throw 'Uninstaller timed out' }
    }
}
