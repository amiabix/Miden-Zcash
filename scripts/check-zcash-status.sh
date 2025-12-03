#!/bin/bash

echo "Checking Zcash testnet node status..."
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q '^zcash-testnet$'; then
    echo "❌ Container is not running"
    echo "Start it with: ./start-zcash-docker.sh"
    exit 1
fi

echo "✅ Container is running"
echo ""

# Check RPC
echo "Testing RPC connection..."
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
  --user testuser:testpass123 \
  http://localhost:18232 2>&1)

if echo "$RESPONSE" | grep -q '"result"'; then
    BLOCK_COUNT=$(echo "$RESPONSE" | grep -o '"result":[0-9]*' | grep -o '[0-9]*')
    echo "✅ RPC is working! Block count: $BLOCK_COUNT"
    echo ""
    echo "Node is ready! Restart your wallet:"
    echo "  cd miden-browser-wallet"
    echo "  pnpm dev"
else
    echo "⏳ RPC not ready yet (node is still starting/syncing)"
    echo ""
    echo "Check logs:"
    echo "  docker logs -f zcash-testnet"
    echo ""
    echo "The node needs to:"
    echo "  1. Download parameter files (~5-10 minutes)"
    echo "  2. Start RPC server"
    echo "  3. Sync blockchain (4-8 hours first time)"
fi
