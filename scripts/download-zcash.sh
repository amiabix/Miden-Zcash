#!/bin/bash
set -e

echo "Downloading Zcash for macOS..."

# Get latest release
LATEST=$(curl -s https://api.github.com/repos/zcash/zcash/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
echo "Latest version: $LATEST"

# Check for macOS binary
MACOS_URL=$(curl -s "https://api.github.com/repos/zcash/zcash/releases/latest" | grep -o '"browser_download_url": "[^"]*macos[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$MACOS_URL" ]; then
    echo "No pre-built macOS binary found."
    echo "You'll need to build from source or use Docker."
    echo ""
    echo "To build from source:"
    echo "  git clone https://github.com/zcash/zcash.git"
    echo "  cd zcash"
    echo "  ./zcutil/build.sh -j\$(sysctl -n hw.ncpu)"
    exit 1
fi

echo "Downloading from: $MACOS_URL"
curl -L -o /tmp/zcash-macos.tar.gz "$MACOS_URL"

echo "Extracting..."
cd /tmp
tar -xzf zcash-macos.tar.gz

echo "Installing..."
# Find the extracted directory
EXTRACTED_DIR=$(find /tmp -maxdepth 1 -type d -name "zcash*" | head -1)
if [ -n "$EXTRACTED_DIR" ]; then
    sudo cp "$EXTRACTED_DIR/zcashd" /usr/local/bin/
    sudo cp "$EXTRACTED_DIR/zcash-cli" /usr/local/bin/
    echo "✅ Installed to /usr/local/bin/"
else
    echo "❌ Could not find extracted files"
    exit 1
fi

echo "✅ Zcash installed!"
echo "Run: zcashd -testnet"
