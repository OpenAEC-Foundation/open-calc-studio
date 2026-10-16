#!/usr/bin/env bash
set -euo pipefail
bundle=src-tauri/target/universal-apple-darwin/release/bundle
dmg=$(find "$bundle/dmg" -maxdepth 1 -name '*.dmg' -print -quit)
test -n "$dmg"
mount_dir=$(mktemp -d)
mounted=false
cleanup() {
  if [ "$mounted" = true ]; then hdiutil detach "$mount_dir"; fi
  rmdir "$mount_dir"
}
trap cleanup EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg"
mounted=true
app_src=$(find "$mount_dir" -maxdepth 1 -name '*.app' -print -quit)
test -n "$app_src"
app="$RUNNER_TEMP/verify-app/Open Calc Studio.app"
mkdir -p "$(dirname "$app")"
ditto "$app_src" "$app"
hdiutil detach "$mount_dir"
mounted=false
codesign --verify --deep --strict --verbose=2 "$app"
spctl --assess --type execute --verbose=4 "$app"
xcrun stapler validate "$app"
# The artifact must really contain both Intel and Apple Silicon code.
lipo -verify_arch x86_64 arm64 "$app/Contents/MacOS/Open Calc Studio"
