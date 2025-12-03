#!/bin/bash

echo "📊 Zcash Testnet Sync Monitor"
echo "=============================="
echo ""

# Check if container is running
if ! docker ps | grep -q zcash-testnet; then
    echo "❌ Container is not running"
    echo "   Start it with: docker start zcash-testnet"
    exit 1
fi

echo "✅ Container is running"
echo ""

# Get sync status
echo "📈 Sync Status:"
BLOCKCHAIN_INFO=$(docker exec zcash-testnet zcash-cli -testnet getblockchaininfo 2>/dev/null)

if [ $? -eq 0 ]; then
    BLOCKS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"blocks":[0-9]*' | cut -d: -f2)
    HEADERS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"headers":[0-9]*' | cut -d: -f2)
    PROGRESS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"verificationprogress":[0-9.]*' | cut -d: -f2)
    
    echo "  Blocks: $BLOCKS"
    echo "  Headers: $HEADERS"
    
    if [ -n "$PROGRESS" ]; then
        PERCENT=$(echo "$PROGRESS * 100" | bc -l 2>/dev/null | head -c 6)
        echo "  Progress: ${PERCENT}%"
    fi
    
    if [ -n "$BLOCKS" ] && [ -n "$HEADERS" ]; then
        if [ "$BLOCKS" -eq 0 ] && [ "$HEADERS" -eq 0 ]; then
            echo ""
            echo "⏳ Node is just starting. Sync will begin shortly."
            echo "   This can take 4-8 hours on first run."
        elif [ "$BLOCKS" -lt "$HEADERS" ]; then
            BEHIND=$((HEADERS - BLOCKS))
            echo "  ⚠️  Behind by $BEHIND blocks (syncing...)"
        elif [ "$BLOCKS" -eq "$HEADERS" ] && [ "$BLOCKS" -gt 0 ]; then
            echo "  ✅ Fully synced!"
        fi
    fi
else
    echo "  ⏳ RPC not ready yet (node still starting)"
fi

echo ""
echo "📝 Recent Logs (last 5 lines):"
docker logs zcash-testnet 2>&1 | tail -5

echo ""
echo "💡 To watch logs in real-time:"
echo "   docker logs -f zcash-testnet"
echo ""
echo "💡 To check sync status again:"
echo "   ./monitor-sync.sh"

