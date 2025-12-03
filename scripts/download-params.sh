#!/bin/bash
# Download Zcash Sapling parameter files
# These are required for proof generation

set -e

PARAMS_DIR="${1:-public/params}"
mkdir -p "$PARAMS_DIR"

echo "Downloading Zcash Sapling parameter files..."
echo "This may take several minutes (files are ~50MB each)"

# Sapling spend parameters
if [ ! -f "$PARAMS_DIR/sapling-spend.params" ]; then
    echo "Downloading sapling-spend.params..."
    curl -L -o "$PARAMS_DIR/sapling-spend.params" \
        "https://download.z.cash/downloads/sapling-spend.params" || {
        echo "Failed to download from primary source, trying alternative..."
        # Alternative: use zcashd's fetch-params script if available
        if command -v zcash-fetch-params &> /dev/null; then
            zcash-fetch-params
        else
            echo "Please download sapling-spend.params manually from:"
            echo "https://z.cash/downloads/"
            exit 1
        fi
    }
else
    echo "sapling-spend.params already exists"
fi

# Sapling output parameters
if [ ! -f "$PARAMS_DIR/sapling-output.params" ]; then
    echo "Downloading sapling-output.params..."
    curl -L -o "$PARAMS_DIR/sapling-output.params" \
        "https://download.z.cash/downloads/sapling-output.params" || {
        echo "Failed to download from primary source"
        echo "Please download sapling-output.params manually from:"
        echo "https://z.cash/downloads/"
        exit 1
    }
else
    echo "sapling-output.params already exists"
fi

echo ""
echo "Parameter files downloaded successfully!"
echo "Location: $PARAMS_DIR"
ls -lh "$PARAMS_DIR"/*.params

