#!/bin/bash

echo "🔍 Checking Zcash Testnet Node Status"
echo ""

# Check if container is running
if docker ps | grep -q zcash-testnet; then
    echo "✅ Container is running"
else
    echo "❌ Container is not running"
    echo "   Start it with: docker start zcash-testnet"
    exit 1
fi

echo ""
echo "📊 RPC Connection Test:"
RPC_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' \
  --user testuser:testpass123 \
  http://localhost:18232 2>&1)

if echo "$RPC_RESPONSE" | grep -q "result"; then
    BLOCK_COUNT=$(echo "$RPC_RESPONSE" | grep -o '"result":[0-9]*' | cut -d: -f2)
    echo "✅ RPC is responding (Block count: $BLOCK_COUNT)"
else
    echo "⏳ RPC not ready yet"
    echo "   Response: $RPC_RESPONSE"
    echo ""
    echo "   The node is likely still:"
    echo "   - Downloading parameter files"
    echo "   - Starting RPC server"
    echo "   - Syncing blockchain"
    echo ""
    echo "   Check logs: docker logs -f zcash-testnet"
fi

echo ""
echo "📝 Recent Logs:"
docker logs zcash-testnet 2>&1 | tail -5

