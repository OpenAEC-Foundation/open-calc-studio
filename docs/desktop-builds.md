# Signed desktop builds

The `Signed desktop test builds` workflow builds Windows x64 (NSIS + MSI),
Linux x64 (AppImage + DEB + RPM), and a universal macOS DMG (Intel + Apple
Silicon). It runs unit tests first. All expected packages must exist and pass
the platform's signature checks before they are uploaded as Actions artifacts.
The implementation follows the signing approach in
[Open PDF Studio's release workflow](https://github.com/OpenAEC-Foundation/open-pdf-studio/blob/main/.github/workflows/release.yml).

## Start and download a test build

After the workflow is on the default branch, select Actions → Signed desktop
test builds → Run workflow and choose the source branch. Alternatively:

```sh
gh workflow run desktop-builds.yml --repo OpenAEC-Foundation/open-calc-studio --ref main
gh run list --repo OpenAEC-Foundation/open-calc-studio --workflow desktop-builds.yml
gh run watch RUN_ID --repo OpenAEC-Foundation/open-calc-studio --exit-status
gh run download RUN_ID --repo OpenAEC-Foundation/open-calc-studio --dir test-builds
```

The initial `codex/signed-test-builds` branch also triggers the workflow on push,
so it can be tested before merging. Artifacts are retained for 14 days. A test
run does not create a stable release, move a tag, publish to npm, or replace an
existing release. Select a completed run's Artifacts section to download
`open-calc-studio-Windows`, `open-calc-studio-Linux`, or
`open-calc-studio-macOS-universal`.

The existing Build & Release workflow calls the same signing workflow for
version tags and manual runs. Only a version tag with all builds successful can
create a draft release. This avoids a draft presented as complete when one
platform failed signing.

## Required signing secrets

Provide these as repository secrets, or organization secrets with access granted
to **open-calc-studio**. Having them in open-pdf-studio alone does not make them
available here. GitHub only exposes secret names to administrators, not their
existing values. Do not commit certificate files, private keys or passwords.

| Platform | Secret names |
| --- | --- |
| Windows | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME` |
| macOS signing | `APPLE_CERTIFICATE` (base64 PKCS#12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (Developer ID Application), `APPLE_TEAM_ID` |
| macOS notarization | `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_CONTENT` (App Store Connect private key) |

Preflight checks report missing **names**, never values. Windows and macOS jobs
fail rather than uploading unsigned installers. The checked-in ad-hoc macOS
identity remains available for local builds; CI overrides it with an explicit
Developer ID identity and enables the hardened runtime. The App Store Connect
key is written to a runner-private temporary file and removed after the macOS
steps, including on failure.

## Updates through the OpenAEC Installer

The OpenAEC Installer updates Open Calc Studio silently and only after it has
checked a minisign signature ([OpenAEC-Blueprint#33](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/33)):

- `bundle.createUpdaterArtifacts` is on, so the build writes a `.sig` next to
  the NSIS installer, the MSI and the AppImage. It signs with the repository
  secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
  the public key is the repository variable `UPDATER_PUBKEY`.
- The `.sig` files go into the release next to the installers.
- When a release is published, `.github/workflows/latest-json.yml` runs the
  [release kit](https://github.com/OpenAEC-Foundation/openaec-installer/tree/main/release-kit):
  it checks every signature against `UPDATER_PUBKEY`, checks that the tag equals
  the version in `src-tauri/tauri.conf.json`, refuses drafts and pre-releases,
  and attaches `latest.json` last. Run it by hand with a tag to make it again.

The signing key is kept offline by the OpenAEC Foundation. Without it, no update
can be published that the installer accepts.

## What gets verified

- **Windows:** Azure signing is installed after compilation. Tauri's
  `bundle.windows.signCommand` signs at bundling time, including the NSIS
  uninstaller. Both outer installers are checked with `Get-AuthenticodeSignature`.
  The NSIS installer is then installed on the runner and the installed executable
  and uninstaller must also have valid signatures. The test installation is removed.
- **macOS:** Tauri signs and notarizes using the App Store Connect API key.
  Verification mounts the delivered DMG, copies out the app, checks its strict
  code signature, Gatekeeper acceptance and stapled notarization ticket, and
  confirms both CPU architectures. No `continue-on-error` bypass is used.
- **All platforms:** SHA-256 checksums and GitHub build-provenance attestations
  cover the final packages. These attestations are cryptographically signed
  claims connecting each artifact to this repository's build. Tagged Linux releases require `OPENAEC_GPG_PRIVATE_KEY` and optionally
  `OPENAEC_GPG_PASSPHRASE`, plus the pinned repository/organization variable
  `OPENAEC_GPG_FINGERPRINT`; the workflow creates and verifies detached `.asc`
  signatures and exports the public key/fingerprint. A manual build without
  the key is explicitly recorded as unsigned. No successful release signing
  with these credentials is claimed by this source change.
  An attestation does not replace Apple notarization or Windows Authenticode.

Verify a downloaded installer (substitute its real filename):

```sh
gh attestation verify PATH_TO_INSTALLER --repo OpenAEC-Foundation/open-calc-studio
```

Checksums detect file changes; the attestation establishes their build provenance.
The workflows need `contents: read`, `id-token: write` and `attestations: write`
for attestation creation. Signing runs are restricted to the trusted push branch,
manual dispatch and calls from the release workflow, not fork pull requests.

## Troubleshooting

Missing secrets require a repository/organization administrator to provision the
credentials or grant this repository access to existing organization secrets.
An Apple rejection or invalid Windows signature remains a failed build: inspect
the failing step before retrying. A green build verifies packaging and signing;
it is not a full interactive test of every application feature.

References: [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/),
[Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/),
[GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations).

## Calendar versions

`node scripts/version.mjs next` chooses the next patch in the current ISO week; `set YYYY.W.N` synchronizes all product packages and MSI mapping. The Prepare calendar release workflow proposes these changes in a PR. Tag builds fail if any package disagrees with the tag. The file-format version remains independent. Platform and API artifacts include licenses and build metadata; the platform workflow tests its container before a tag publishes it to GHCR. See [acceptance evidence](issue-readiness.md).

## Retest one platform

Manual desktop builds accept `platform=windows`, `linux`, `macos` or `all`:

```sh
gh workflow run desktop-builds.yml --ref YOUR_BRANCH -f platform=macos
```

The release workflow keeps the default `all`. macOS universal packaging runs
`prepare-universal-binaries.mjs` after compilation and before bundling. It
combines both architectures of every additional Cargo binary (including the
PDF utilities), verifies the slices and retains them in the signed app.
