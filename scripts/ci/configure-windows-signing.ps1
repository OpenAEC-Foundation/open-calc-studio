$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'TrustedSigning'
$signtool = Get-ChildItem $root -Recurse -Filter signtool.exe |
    Where-Object { $_.FullName -match '[\\/]x64[\\/]' } | Select-Object -First 1
$dlib = Get-ChildItem $root -Recurse -Filter Azure.CodeSigning.Dlib.dll |
    Where-Object { $_.FullName -match '[\\/]x64[\\/]' } | Select-Object -First 1
if (-not $signtool -or -not $dlib) { throw "Signing tools not found under $root" }
$metadata = Join-Path $env:RUNNER_TEMP 'trusted-signing-metadata.json'
@{
    Endpoint = $env:AZURE_ENDPOINT
    CodeSigningAccountName = $env:AZURE_ACCOUNT
    CertificateProfileName = $env:AZURE_PROFILE
} | ConvertTo-Json | Set-Content $metadata -Encoding utf8
@{ bundle = @{ windows = @{ signCommand = @{
    cmd = $signtool.FullName
    args = @('sign', '/v', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com',
        '/td', 'SHA256', '/dlib', $dlib.FullName, '/dmdf', $metadata, '%1')
} } } } | ConvertTo-Json -Depth 10 | Set-Content src-tauri/tauri.signing.conf.json -Encoding utf8
