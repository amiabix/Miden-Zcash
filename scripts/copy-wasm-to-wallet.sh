#!/bin/bash
# Copy WASM files to Miden Browser Wallet
# 
# This script copies WASM files from the SDK to the wallet's public folder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WALLET_DIR="$REPO_ROOT/miden-browser-wallet"
SDK_PUBLIC_DIR="$REPO_ROOT/public"
WALLET_PUBLIC_DIR="$WALLET_DIR/public"

echo "📋 Copying WASM files to wallet..."

# Check if wallet directory exists
if [ ! -d "$WALLET_DIR" ]; then
    echo "❌ Error: Wallet directory not found at $WALLET_DIR"
    exit 1
fi

# Create wallet public directory if it doesn't exist
mkdir -p "$WALLET_PUBLIC_DIR"

# Copy WASM files
if [ -f "$SDK_PUBLIC_DIR/zcash_prover_wasm_bg.wasm" ]; then
    echo "✅ Copying zcash_prover_wasm_bg.wasm..."
    cp "$SDK_PUBLIC_DIR/zcash_prover_wasm_bg.wasm" "$WALLET_PUBLIC_DIR/"
fi

if [ -f "$SDK_PUBLIC_DIR/zcash_prover_wasm_bg.js" ]; then
    echo "✅ Copying zcash_prover_wasm_bg.js..."
    cp "$SDK_PUBLIC_DIR/zcash_prover_wasm_bg.js" "$WALLET_PUBLIC_DIR/"
fi

if [ -f "$SDK_PUBLIC_DIR/zcash_prover_wasm.js" ]; then
    echo "✅ Copying zcash_prover_wasm.js..."
    cp "$SDK_PUBLIC_DIR/zcash_prover_wasm.js" "$WALLET_PUBLIC_DIR/"
fi

# Copy Prize-WASM files if they exist
if [ -d "$SDK_PUBLIC_DIR/zcash-prover-wasm" ]; then
    echo "✅ Copying Prize-WASM files..."
    mkdir -p "$WALLET_PUBLIC_DIR/zcash-prover-wasm"
    cp -r "$SDK_PUBLIC_DIR/zcash-prover-wasm/"* "$WALLET_PUBLIC_DIR/zcash-prover-wasm/" 2>/dev/null || true
fi

# Copy params if they exist
if [ -d "$SDK_PUBLIC_DIR/params" ]; then
    echo "✅ Copying Sapling params..."
    mkdir -p "$WALLET_PUBLIC_DIR/params"
    cp -r "$SDK_PUBLIC_DIR/params/"* "$WALLET_PUBLIC_DIR/params/" 2>/dev/null || true
fi

echo "✅ WASM files copied successfully!"
echo "   Destination: $WALLET_PUBLIC_DIR"
ls -lh "$WALLET_PUBLIC_DIR"/*.wasm 2>/dev/null || echo "   (No WASM files found - this is OK if not built yet)"

