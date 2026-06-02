#!/bin/bash
# Run GUI test for Symitech Calc Studio
set -e

cd "C:/Users/rickd/Documents/GitHub/open-calc-studio"

# Create output directory
mkdir -p output/screenshots

# Install Playwright if not already installed
if ! npx playwright --version >/dev/null 2>&1; then
  echo "Installing Playwright..."
  npm install -D @playwright/test
  npx playwright install chromium
fi

# Run the test
echo "Running GUI test..."
npx playwright test tests/gui-test.spec.ts --reporter=list

echo ""
echo "Screenshots saved to output/screenshots/"
ls -la output/screenshots/
