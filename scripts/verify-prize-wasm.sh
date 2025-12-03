#!/bin/bash
# Quick verification script for Prize-WASM setup

set -e

echo "🔍 Verifying Prize-WASM Prover Setup..."
echo ""

# Check if WASM files exist
WASM_DIR="public/zcash-prover-wasm"

if [ ! -d "$WASM_DIR" ]; then
    echo "❌ WASM directory not found: $WASM_DIR"
    echo "   Run: mkdir -p $WASM_DIR"
    echo "   Then build and copy WASM files"
    exit 1
fi

# Check for required files
REQUIRED_FILES=(
    "zcash_prover_wasm.js"
    "zcash_prover_wasm_bg.wasm"
)

MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$WASM_DIR/$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo "❌ Missing required WASM files:"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $WASM_DIR/$file"
    done
    echo ""
    echo "   To build:"
    echo "   1. git clone https://github.com/z-prize/prize-wasm-masp-groth16-prover"
    echo "   2. cd prize-wasm-masp-groth16-prover"
    echo "   3. wasm-pack build --target web"
    echo "   4. cp -r pkg/* ../Miden-Zcash/$WASM_DIR/"
    exit 1
fi

# Check file sizes (should be non-zero)
for file in "${REQUIRED_FILES[@]}"; do
    SIZE=$(stat -f%z "$WASM_DIR/$file" 2>/dev/null || stat -c%s "$WASM_DIR/$file" 2>/dev/null)
    if [ "$SIZE" -eq 0 ]; then
        echo "⚠️  Warning: $file is empty"
    else
        echo "✅ $file exists ($(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes"))"
    fi
done

echo ""
echo "✅ Prize-WASM files verified!"
echo ""
echo "Next steps:"
echo "  1. Run tests: npm test -- prizeWasm.test.ts"
echo "  2. Check integration: npm test -- getCommitmentTreeAnchor.test.ts"
echo "  3. See INTEGRATION_CHECKLIST.md for full verification"

