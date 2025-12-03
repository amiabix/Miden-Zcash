#!/bin/bash
# Zcash Node Sync Status Checker (macOS compatible)

echo "=== Zcash Testnet Node Status ==="
echo ""

# Check if container is running
if ! docker ps | grep -q zcash-testnet; then
    echo "❌ Container is not running"
    echo "Start it with: docker start zcash-testnet"
    exit 1
fi

echo "✅ Container is running"
echo ""

# Check if zcashd is running
if docker exec zcash-testnet ls /home/zcash/.zcash/zcashd.pid >/dev/null 2>&1; then
    echo "✅ zcashd is running"
else
    echo "⏳ zcashd is starting up..."
    exit 0
fi

echo ""

# Get block count
echo "📊 Current Status:"
BLOCK_COUNT=$(docker exec zcash-testnet zcash-cli -testnet getblockcount 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   Current Block: $BLOCK_COUNT"
else
    echo "   Current Block: Unable to query (node may still be starting)"
    exit 0
fi

# Get blockchain info
BLOCKCHAIN_INFO=$(docker exec zcash-testnet zcash-cli -testnet getblockchaininfo 2>/dev/null)
if [ $? -eq 0 ]; then
    VERIFICATION_PROGRESS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"verificationprogress":[^,]*' | cut -d: -f2)
    HEADERS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"headers":[^,]*' | cut -d: -f2)
    
    if [ -n "$VERIFICATION_PROGRESS" ]; then
        PROGRESS_PERCENT=$(echo "$VERIFICATION_PROGRESS * 100" | bc -l 2>/dev/null | head -c 6)
        if [ -n "$PROGRESS_PERCENT" ]; then
            echo "   Sync Progress: ${PROGRESS_PERCENT}%"
        fi
    fi
    
    if [ -n "$HEADERS" ]; then
        echo "   Headers: $HEADERS"
    fi
fi

echo ""

# Check if syncing
if [ "$BLOCK_COUNT" -eq "0" ]; then
    echo "⏳ Node is at genesis block - sync starting..."
    echo "   This will take 4-8 hours for full sync"
elif [ -n "$VERIFICATION_PROGRESS" ] && [ "$(echo "$VERIFICATION_PROGRESS < 0.99" | bc -l 2>/dev/null)" -eq 1 ]; then
    echo "🔄 Node is syncing..."
    echo "   Target: ~3,150,000 blocks"
    REMAINING=$((3150000 - BLOCK_COUNT))
    echo "   Remaining: ~$REMAINING blocks"
else
    echo "✅ Node appears to be synced"
fi

echo ""
echo "💡 Tips:"
echo "   - Run this script periodically: ./check-sync-status.sh"
echo "   - View logs: docker logs -f zcash-testnet"
echo "   - Check RPC: curl -X POST -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"getblockcount\",\"params\":[],\"id\":1}' --user testuser:testpass123 http://localhost:18232"

