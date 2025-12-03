#!/bin/bash
set -e

echo "Setting up Zcash testnet node..."

# Check if zcashd is installed
if ! command -v zcashd &> /dev/null; then
    echo "zcashd not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v brew &> /dev/null; then
            echo "Homebrew not found. Please install Homebrew first:"
            echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
        brew install zcash
    else
        echo "Please install zcash manually:"
        echo "  sudo apt-get install zcash  # Ubuntu/Debian"
        exit 1
    fi
fi

# Create config directory
mkdir -p ~/.zcash

# Create config file
cat > ~/.zcash/zcash.conf << 'CONF'
testnet=1
rpcuser=testuser
rpcpassword=testpass123
rpcallowip=127.0.0.1
rpcport=18232
server=1
CONF

echo "✅ Config created at ~/.zcash/zcash.conf"
echo ""
echo "To start the node, run:"
echo "  zcashd -testnet"
echo ""
echo "To check sync status:"
echo "  zcash-cli -testnet getblockcount"
echo ""
echo "Once synced, update miden-browser-wallet/.env.local:"
echo "  NEXT_PUBLIC_ZCASH_RPC_ENDPOINT=http://localhost:18232"
echo "  NEXT_PUBLIC_ZCASH_RPC_USER=testuser"
echo "  NEXT_PUBLIC_ZCASH_RPC_PASSWORD=testpass123"
