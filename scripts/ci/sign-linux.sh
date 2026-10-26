#!/usr/bin/env bash
set -euo pipefail
cp release-artifacts/SHA256SUMS.txt release-artifacts/SHA256SUMS-linux.txt
if [ -z "${OPENAEC_GPG_PRIVATE_KEY:-}" ] || [ -z "${OPENAEC_GPG_FINGERPRINT:-}" ]; then
  if [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    echo '::error::OPENAEC_GPG_PRIVATE_KEY and OPENAEC_GPG_FINGERPRINT are required for a signed Linux release.'
    exit 1
  fi
  printf '%s\n' '{"platform":"linux","signed":false,"reason":"OpenPGP key/fingerprint not configured; manual development build"}' > release-artifacts/linux-signing-evidence.json
  exit 0
fi
export GNUPGHOME
GNUPGHOME=$(mktemp -d)
chmod 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent; rm -rf "$GNUPGHOME"' EXIT
printf '%s' "$OPENAEC_GPG_PRIVATE_KEY" | gpg --batch --import
fingerprint=$(printf '%s' "$OPENAEC_GPG_FINGERPRINT" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
[[ "$fingerprint" =~ ^([A-F0-9]{40}|[A-F0-9]{64})$ ]]
actual=$(gpg --batch --with-colons --list-secret-keys "$fingerprint" | awk -F: '$1=="fpr" {print $10; exit}')
test "$actual" = "$fingerprint"
for package in release-artifacts/*.AppImage release-artifacts/*.deb release-artifacts/*.rpm release-artifacts/SHA256SUMS-linux.txt; do
  test -f "$package"
  printf '%s' "${OPENAEC_GPG_PASSPHRASE:-}" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --local-user "$fingerprint" --armor --detach-sign "$package"
  gpg --batch --verify "$package.asc" "$package"
done
gpg --armor --export "$fingerprint" > release-artifacts/linux-signing-public-key.asc
FINGERPRINT="$fingerprint" node --input-type=module -e 'import fs from "node:fs"; fs.writeFileSync("release-artifacts/linux-signing-evidence.json",JSON.stringify({platform:"linux",signed:true,fingerprint:process.env.FINGERPRINT,commit:process.env.GITHUB_SHA},null,2)+"\n");'
