#!/bin/bash
# Build Prize-WASM Prover
# 
# This script clones, builds, and copies Prize-WASM artifacts into the repo
# 
# Prerequisites:
# - Rust toolchain installed
# - wasm-pack installed (install with: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRIZE_WASM_DIR="$REPO_ROOT/prize-wasm-masp-groth16-prover"
OUTPUT_DIR="$REPO_ROOT/public/zcash-prover-wasm"

echo "🔨 Building Prize-WASM Prover..."

# Check prerequisites
if ! command -v rustc &> /dev/null; then
    echo "❌ Error: Rust is not installed"
    echo "   Install from: https://rustup.rs/"
    exit 1
fi

if ! command -v wasm-pack &> /dev/null; then
    echo "❌ Error: wasm-pack is not installed"
    echo "   Install with: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
fi

# Clone repository if it doesn't exist
if [ ! -d "$PRIZE_WASM_DIR" ]; then
    echo "📦 Cloning Prize-WASM repository..."
    git clone https://github.com/z-prize/prize-wasm-masp-groth16-prover.git "$PRIZE_WASM_DIR"
else
    echo "📦 Updating Prize-WASM repository..."
    cd "$PRIZE_WASM_DIR"
    git pull
fi

# Build WASM
echo "🔨 Building WASM for web target..."
cd "$PRIZE_WASM_DIR"
wasm-pack build --target web --release

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Copy artifacts
echo "📋 Copying artifacts to $OUTPUT_DIR..."
cp -r "$PRIZE_WASM_DIR/pkg/"* "$OUTPUT_DIR/"

# Verify files
echo "✅ Verifying build..."
if [ ! -f "$OUTPUT_DIR"/*.wasm ]; then
    echo "❌ Error: WASM file not found"
    exit 1
fi

if [ ! -f "$OUTPUT_DIR"/*.js ]; then
    echo "❌ Error: JS wrapper not found"
    exit 1
fi

echo "✅ Prize-WASM build complete!"
echo "   Files copied to: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"

