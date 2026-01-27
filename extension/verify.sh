#!/bin/bash
# Quick verification script for Corpus extension

echo "Corpus Extension Verification"
echo "==============================="
echo ""

# Check directory structure
echo "✓ Checking directory structure..."
required_files=(
  "manifest.json"
  "background.js"
  "popup.html"
  "popup.js"
  "popup.css"
  "README.md"
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

missing_files=()
for file in "${required_files[@]}"; do
  if [ ! -f "$file" ]; then
    missing_files+=("$file")
  fi
done

if [ ${#missing_files[@]} -eq 0 ]; then
  echo "  All required files present"
else
  echo "  ❌ Missing files:"
  for file in "${missing_files[@]}"; do
    echo "    - $file"
  done
  exit 1
fi

echo ""

# Check manifest.json is valid JSON
echo "✓ Validating manifest.json..."
if python3 -m json.tool manifest.json > /dev/null 2>&1; then
  echo "  Valid JSON"
else
  echo "  ❌ Invalid JSON in manifest.json"
  exit 1
fi

echo ""

# Check icon files
echo "✓ Checking icon files..."
for size in 16 48 128; do
  icon="icons/icon${size}.png"
  if file "$icon" | grep -q "PNG image data, ${size} x ${size}"; then
    echo "  icon${size}.png: OK (${size}x${size})"
  else
    echo "  ❌ icon${size}.png: Invalid or wrong size"
  fi
done

echo ""
echo "==============================="
echo "Extension verification complete!"
echo ""
echo "To load in Chrome:"
echo "  1. Open chrome://extensions/"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $(pwd)"
echo ""
