#!/bin/bash

echo "🔧 Fixing Zcash Node Sync"
echo "=========================="
echo ""

# Check if container is running
if ! docker ps | grep -q zcash-testnet; then
    echo "❌ Container is not running"
    echo "   Starting container..."
    docker start zcash-testnet
    sleep 5
fi

echo "✅ Container is running"
echo ""

# Check if zcashd is running
echo "📊 Checking zcashd status..."
BLOCK_COUNT=$(docker exec zcash-testnet zcash-cli -testnet getblockcount 2>&1)

if echo "$BLOCK_COUNT" | grep -q "error"; then
    echo "❌ zcashd is not responding"
    echo "   Restarting container..."
    docker restart zcash-testnet
    sleep 10
else
    echo "✅ zcashd is running (block count: $BLOCK_COUNT)"
fi

echo ""
echo "🔌 Checking peer connections..."
CONNECTIONS=$(docker exec zcash-testnet zcash-cli -testnet getnetworkinfo 2>&1 | grep -o '"connections":[0-9]*' | cut -d: -f2)

if [ -z "$CONNECTIONS" ] || [ "$CONNECTIONS" -eq 0 ]; then
    echo "⚠️  No peer connections (connections: ${CONNECTIONS:-0})"
    echo ""
    echo "   Adding seed nodes..."
    
    # Add some testnet seed nodes
    docker exec zcash-testnet zcash-cli -testnet addnode "testnet.z.cash:18233" "add" 2>&1 | head -1
    docker exec zcash-testnet zcash-cli -testnet addnode "testnet.z.cash:18234" "add" 2>&1 | head -1
    
    echo ""
    echo "   Waiting 15 seconds for connections..."
    sleep 15
    
    CONNECTIONS=$(docker exec zcash-testnet zcash-cli -testnet getnetworkinfo 2>&1 | grep -o '"connections":[0-9]*' | cut -d: -f2)
    echo "   Connections after adding nodes: ${CONNECTIONS:-0}"
else
    echo "✅ Connected to $CONNECTIONS peers"
fi

echo ""
echo "📈 Sync Status:"
BLOCKCHAIN_INFO=$(docker exec zcash-testnet zcash-cli -testnet getblockchaininfo 2>&1)
BLOCKS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"blocks":[0-9]*' | cut -d: -f2)
HEADERS=$(echo "$BLOCKCHAIN_INFO" | grep -o '"headers":[0-9]*' | cut -d: -f2)

echo "  Blocks: ${BLOCKS:-0}"
echo "  Headers: ${HEADERS:-0}"

if [ -n "$BLOCKS" ] && [ -n "$HEADERS" ]; then
    if [ "$BLOCKS" -eq 0 ] && [ "$HEADERS" -eq 0 ]; then
        echo ""
        echo "⏳ Node is starting. It may take a few minutes to connect to peers."
        echo "   If blocks don't start increasing after 5 minutes, check:"
        echo "   - Internet connection"
        echo "   - Firewall settings"
        echo "   - Docker network configuration"
    elif [ "$BLOCKS" -lt "$HEADERS" ]; then
        BEHIND=$((HEADERS - BLOCKS))
        echo "  ✅ Syncing... (behind by $BEHIND blocks)"
    elif [ "$BLOCKS" -eq "$HEADERS" ] && [ "$BLOCKS" -gt 0 ]; then
        echo "  ✅ Fully synced!"
    fi
fi

echo ""
echo "📝 Recent logs:"
docker logs zcash-testnet --tail 5 2>&1 | tail -3

echo ""
echo "💡 To monitor sync progress:"
echo "   watch -n 5 'docker exec zcash-testnet zcash-cli -testnet getblockcount'"

