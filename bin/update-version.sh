#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 4.5.0"
    exit 1
fi

VERSION=$1

  # Update package.json (line 3, no indentation)
  awk -v ver="$VERSION" '/"version":/ {print "    \"version\": \"" ver "\","; next} 1' package.json > package.json.tmp && mv package.json.tmp package.json

  # Update src/moto/license.js (line 6, VERSION field)
  awk -v ver="$VERSION" '/VERSION:/ {print "    VERSION: \"" ver "\""; next} 1' src/moto/license.js > src/moto/license.js.tmp && mv src/moto/license.js.tmp src/moto/license.js

  # Update web/kiri/manifest.json (line 2, preserves "Kiri:Moto" prefix)
  awk -v ver="$VERSION" '/"name":/ {print "    \"name\": \"Kiri:Moto " ver "\","; next} 1' web/kiri/manifest.json > web/kiri/manifest.json.tmp && mv web/kiri/manifest.json.tmp web/kiri/manifest.json

echo "Updated version to $VERSION in:"
echo "  - package.json"
echo "  - src/moto/license.js"
echo "  - web/kiri/manifest.json"
