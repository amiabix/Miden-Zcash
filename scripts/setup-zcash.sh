#!/bin/bash

# Zcash Integration Setup Script
# Downloads and configures all external dependencies:
# 1. Prize-WASM binary
# 2. Sapling proving parameters
# 3. Verifies RPC endpoint configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WASM_DIR="$PROJECT_ROOT/miden-browser-wallet/public/zcash-prover-wasm"
PARAMS_DIR="$PROJECT_ROOT/miden-browser-wallet/public/zcash-params"

echo "=========================================="
echo "Zcash Integration Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if required tools are available
check_dependencies() {
    echo "Checking dependencies..."
    
    if ! command -v wget &> /dev/null && ! command -v curl &> /dev/null; then
        print_error "wget or curl is required but not installed"
        exit 1
    fi
    
    if ! command -v unzip &> /dev/null && ! command -v tar &> /dev/null; then
        print_error "unzip or tar is required but not installed"
        exit 1
    fi
    
    print_status "All required tools are available"
    echo ""
}

# Download Prize-WASM
download_prize_wasm() {
    echo "=========================================="
    echo "1. Downloading Prize-WASM Binary"
    echo "=========================================="
    
    WASM_TEMP_DIR=$(mktemp -d)
    WASM_RELEASE_URL="https://github.com/z-prize/prize-wasm-masp-groth16-prover/releases/latest"
    
    echo "Fetching latest release information..."
    
    # Try to get the latest release download URL
    # Use a more reliable method that works on macOS
    if command -v curl &> /dev/null; then
        # Get the latest release tag
        LATEST_TAG=$(curl -sL "https://api.github.com/repos/z-prize/prize-wasm-masp-groth16-prover/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | head -1)
        
        if [ -n "$LATEST_TAG" ]; then
            DOWNLOAD_URL="https://github.com/z-prize/prize-wasm-masp-groth16-prover/releases/download/$LATEST_TAG/pkg.zip"
            echo "Latest release: $LATEST_TAG"
        else
            # Fallback: try direct download
            DOWNLOAD_URL="https://github.com/z-prize/prize-wasm-masp-groth16-prover/releases/latest/download/pkg.zip"
            print_warning "Could not determine latest tag, using fallback URL"
        fi
    else
        print_warning "curl not available, using fallback URL"
        DOWNLOAD_URL="https://github.com/z-prize/prize-wasm-masp-groth16-prover/releases/latest/download/pkg.zip"
    fi
    
    echo "Download URL: $DOWNLOAD_URL"
    echo "Downloading to: $WASM_TEMP_DIR"
    
    mkdir -p "$WASM_DIR"
    
    # Download
    DOWNLOAD_SUCCESS=false
    if command -v wget &> /dev/null; then
        if wget -q --show-progress -O "$WASM_TEMP_DIR/pkg.zip" "$DOWNLOAD_URL" 2>&1; then
            DOWNLOAD_SUCCESS=true
        fi
    else
        if curl -L --progress-bar -o "$WASM_TEMP_DIR/pkg.zip" "$DOWNLOAD_URL" 2>&1; then
            DOWNLOAD_SUCCESS=true
        fi
    fi
    
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        print_warning "Direct download failed. Checking if file exists..."
        
        # Check if file was downloaded (might have redirected)
        if [ -f "$WASM_TEMP_DIR/pkg.zip" ] && [ -s "$WASM_TEMP_DIR/pkg.zip" ]; then
            DOWNLOAD_SUCCESS=true
        else
            print_error "Failed to download Prize-WASM automatically."
            echo ""
            echo "Please download manually:"
            echo "  1. Visit: https://github.com/z-prize/prize-wasm-masp-groth16-prover/releases"
            echo "  2. Download the latest pkg.zip or pkg.tar.gz"
            echo "  3. Extract and copy contents to: $WASM_DIR"
            echo ""
            echo "Or if you have wasm-pack installed, you can build it:"
            echo "  git clone https://github.com/z-prize/prize-wasm-masp-groth16-prover.git"
            echo "  cd prize-wasm-masp-groth16-prover"
            echo "  wasm-pack build --target web --release"
            echo "  cp -r pkg/* $WASM_DIR/"
            return 1
        fi
    fi
    
    # Extract
    echo "Extracting Prize-WASM..."
    if command -v unzip &> /dev/null; then
        unzip -q "$WASM_TEMP_DIR/pkg.zip" -d "$WASM_TEMP_DIR" || {
            # Try tar.gz
            if [ -f "$WASM_TEMP_DIR/pkg.tar.gz" ]; then
                tar -xzf "$WASM_TEMP_DIR/pkg.tar.gz" -C "$WASM_TEMP_DIR"
            else
                print_error "Failed to extract Prize-WASM archive"
                return 1
            fi
        }
    else
        tar -xzf "$WASM_TEMP_DIR/pkg.zip" -C "$WASM_TEMP_DIR" 2>/dev/null || {
            print_error "Failed to extract Prize-WASM archive"
            return 1
        }
    fi
    
    # Copy to destination
    if [ -d "$WASM_TEMP_DIR/pkg" ]; then
        cp -r "$WASM_TEMP_DIR/pkg"/* "$WASM_DIR/"
    elif [ -f "$WASM_TEMP_DIR/prize_wasm_bg.wasm" ]; then
        cp "$WASM_TEMP_DIR"/*.wasm "$WASM_DIR/" 2>/dev/null || true
        cp "$WASM_TEMP_DIR"/*.js "$WASM_DIR/" 2>/dev/null || true
    else
        print_error "Could not find Prize-WASM files in archive"
        return 1
    fi
    
    # Verify files
    if [ -f "$WASM_DIR/prize_wasm_bg.wasm" ] || [ -f "$WASM_DIR/zcash_prover_wasm_bg.wasm" ]; then
        print_status "Prize-WASM installed successfully"
        echo "  Location: $WASM_DIR"
        ls -lh "$WASM_DIR"/*.wasm 2>/dev/null | awk '{print "    " $9 " (" $5 ")"}'
    else
        print_error "Prize-WASM files not found after installation"
        return 1
    fi
    
    # Cleanup
    rm -rf "$WASM_TEMP_DIR"
    echo ""
}

# Download Sapling parameters
download_sapling_params() {
    echo "=========================================="
    echo "2. Downloading Sapling Proving Parameters"
    echo "=========================================="
    
    mkdir -p "$PARAMS_DIR"
    
    SPEND_PARAMS_URL="https://download.z.cash/downloads/sapling-spend.params"
    OUTPUT_PARAMS_URL="https://download.z.cash/downloads/sapling-output.params"
    
    # Download spend params
    echo "Downloading sapling-spend.params (~7 MB)..."
    if command -v wget &> /dev/null; then
        wget -q --show-progress -O "$PARAMS_DIR/sapling-spend.params" "$SPEND_PARAMS_URL" || {
            print_error "Failed to download sapling-spend.params"
            return 1
        }
    else
        curl -L --progress-bar -o "$PARAMS_DIR/sapling-spend.params" "$SPEND_PARAMS_URL" || {
            print_error "Failed to download sapling-spend.params"
            return 1
        }
    fi
    
    # Download output params
    echo "Downloading sapling-output.params (~7 MB)..."
    if command -v wget &> /dev/null; then
        wget -q --show-progress -O "$PARAMS_DIR/sapling-output.params" "$OUTPUT_PARAMS_URL" || {
            print_error "Failed to download sapling-output.params"
            return 1
        }
    else
        curl -L --progress-bar -o "$PARAMS_DIR/sapling-output.params" "$OUTPUT_PARAMS_URL" || {
            print_error "Failed to download sapling-output.params"
            return 1
        }
    fi
    
    # Verify files
    if [ -f "$PARAMS_DIR/sapling-spend.params" ] && [ -f "$PARAMS_DIR/sapling-output.params" ]; then
        print_status "Sapling parameters installed successfully"
        echo "  Location: $PARAMS_DIR"
        ls -lh "$PARAMS_DIR"/*.params | awk '{print "    " $9 " (" $5 ")"}'
    else
        print_error "Sapling parameter files not found after download"
        return 1
    fi
    
    echo ""
}

# Verify RPC configuration
verify_rpc_config() {
    echo "=========================================="
    echo "3. RPC Endpoint Configuration"
    echo "=========================================="
    
    echo "Recommended testnet endpoints:"
    echo "  - https://zcash-testnet.horizenlabs.io (transparent RPC)"
    echo "  - https://testnet-lightwalletd.zecwallet.co:9067 (lightwalletd)"
    echo "  - https://testnet.lightwalletd.com:9067 (lightwalletd)"
    echo ""
    echo "To configure, set in your ZcashProvider config:"
    echo "  {"
    echo "    rpcEndpoint: 'https://zcash-testnet.horizenlabs.io',"
    echo "    lightwalletdUrl: 'https://testnet-lightwalletd.zecwallet.co:9067'"
    echo "  }"
    echo ""
    print_status "RPC endpoints are configured at runtime (no download needed)"
    echo ""
}

# Main execution
main() {
    check_dependencies
    
    download_prize_wasm
    download_sapling_params
    verify_rpc_config
    
    echo "=========================================="
    echo "Setup Complete!"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Configure RPC endpoints in your ZcashProvider"
    echo "2. Run health check: npm run zcash:health"
    echo "3. Start using shielded transactions!"
    echo ""
}

main
