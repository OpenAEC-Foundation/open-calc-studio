#!/usr/bin/env bash
set -euo pipefail
if [ -z "${OPENAEC_GPG_PRIVATE_KEY:-}" ]; then
  if [[ "${GITHUB_REF:-}" == refs/tags/v* ]]; then
    echo '::error::OPENAEC_GPG_PRIVATE_KEY is required for a signed Linux release.'
    exit 1
  fi
  printf '%s\n' '{"platform":"linux","signed":false,"reason":"OpenPGP key not configured; manual development build"}' > release-artifacts/linux-signing-evidence.json
  exit 0
fi
export GNUPGHOME
GNUPGHOME=$(mktemp -d)
chmod 700 "$GNUPGHOME"
trap 'rm -rf "$GNUPGHOME"' EXIT
printf '%s' "$OPENAEC_GPG_PRIVATE_KEY" | gpg --batch --import
fingerprint=$(gpg --batch --with-colons --list-secret-keys | awk -F: '$1=="fpr" {print $10; exit}')
test -n "$fingerprint"
for package in release-artifacts/*.AppImage release-artifacts/*.deb release-artifacts/*.rpm; do
  test -f "$package"
  printf '%s' "${OPENAEC_GPG_PASSPHRASE:-}" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --local-user "$fingerprint" --armor --detach-sign "$package"
  gpg --batch --verify "$package.asc" "$package"
done
gpg --armor --export "$fingerprint" > release-artifacts/linux-signing-public-key.asc
FINGERPRINT="$fingerprint" node --input-type=module -e 'import fs from "node:fs"; fs.writeFileSync("release-artifacts/linux-signing-evidence.json",JSON.stringify({platform:"linux",signed:true,fingerprint:process.env.FINGERPRINT,commit:process.env.GITHUB_SHA},null,2)+"\n");'
