#!/bin/bash

# Round 3 Lighthouse verification against preview URL
PREVIEW_URL="https://crushroom.myshopify.com"
PREVIEW_THEME_ID="158279991548"
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"

echo "=== Round 3 Lighthouse Verification (Preview URL) ==="
echo ""
echo "Expected baseline (round-2):"
echo "  Mobile: 80 perf / FCP 1.9s / LCP 3.2s / TBT 340ms / CLS 0 / SI 5.3s"
echo "  Desktop: 91-92 perf / LCP ~1.5s / TBT ~0ms / CLS 0"
echo ""

cd "$(dirname "$0")"

# Desktop run
echo "=== DESKTOP (1366x768) ==="
npx lighthouse@13.3.0 \
  "${PREVIEW_URL}?preview_theme_id=${PREVIEW_THEME_ID}" \
  --preset=desktop \
  --throttling-method=simulate \
  --output=json \
  --output-path="./round3-preview-desktop-1.json" \
  --quiet \
  --chrome-flags="--headless --disable-gpu --no-sandbox" \
  --only-categories=performance 2>&1 | grep -v "CLI is slow"

if [ -f "./round3-preview-desktop-1.json" ]; then
  PERF=$(jq -r '.lighthouseResult.categories.performance.score * 100 | floor' "./round3-preview-desktop-1.json")
  LCP=$(jq -r '.lighthouseResult.audits.metrics.details.items[0].largestContentfulPaint / 1000' "./round3-preview-desktop-1.json")
  echo "  ✓ Desktop Perf: ${PERF}pt, LCP: ${LCP}s"
else
  echo "  ✗ Desktop test failed"
fi
echo ""

# Mobile run
echo "=== MOBILE (412x823) ==="
npx lighthouse@13.3.0 \
  "${PREVIEW_URL}?preview_theme_id=${PREVIEW_THEME_ID}" \
  --emulated-form-factor=mobile \
  --throttling-method=simulate \
  --output=json \
  --output-path="./round3-preview-mobile-1.json" \
  --quiet \
  --chrome-flags="--headless --disable-gpu --no-sandbox" \
  --only-categories=performance 2>&1 | grep -v "CLI is slow"

if [ -f "./round3-preview-mobile-1.json" ]; then
  PERF=$(jq -r '.lighthouseResult.categories.performance.score * 100 | floor' "./round3-preview-mobile-1.json")
  LCP=$(jq -r '.lighthouseResult.audits.metrics.details.items[0].largestContentfulPaint / 1000' "./round3-preview-mobile-1.json")
  FCP=$(jq -r '.lighthouseResult.audits.metrics.details.items[0].firstContentfulPaint / 1000' "./round3-preview-mobile-1.json")
  echo "  ✓ Mobile Perf: ${PERF}pt, FCP: ${FCP}s, LCP: ${LCP}s"
else
  echo "  ✗ Mobile test failed"
fi

echo ""
echo "✓ Lighthouse runs complete. Check JSON files for full metrics."
