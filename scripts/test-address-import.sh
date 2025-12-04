#!/bin/bash

# Test script to check address import and UTXO discovery

ADDRESS="tmTTHhqEsRyQDDk2KLqPH9YZk4Cq4Tw2s3f"
RPC_USER="${ZCASH_RPC_USER:-zcashrpc}"
RPC_PASSWORD="${ZCASH_RPC_PASSWORD}"
RPC_ENDPOINT="${ZCASH_RPC_ENDPOINT:-http://127.0.0.1:18232}"

if [ -z "$RPC_PASSWORD" ]; then
    echo "Error: ZCASH_RPC_PASSWORD not set"
    exit 1
fi

echo "=== Testing Address Import and UTXO Discovery ==="
echo "Address: $ADDRESS"
echo "RPC Endpoint: $RPC_ENDPOINT"
echo ""

# Function to make RPC call
rpc_call() {
    local method=$1
    shift
    local params="$@"
    
    curl -s -X POST "$RPC_ENDPOINT" \
        -u "$RPC_USER:$RPC_PASSWORD" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"1.0\",\"method\":\"$method\",\"params\":[$params],\"id\":$(date +%s)}"
}

echo "1. Checking if address is in wallet..."
WALLET_ADDRESSES=$(rpc_call "getaddressesbyaccount" "\"\"")
echo "$WALLET_ADDRESSES" | python3 -m json.tool
echo ""

echo "2. Importing address..."
IMPORT_RESULT=$(rpc_call "importaddress" "\"$ADDRESS\"" "\"\"" "false" "true")
echo "$IMPORT_RESULT" | python3 -m json.tool
echo ""

echo "3. Waiting 2 seconds for import to process..."
sleep 2
echo ""

echo "4. Checking wallet addresses again..."
WALLET_ADDRESSES_AFTER=$(rpc_call "getaddressesbyaccount" "\"\"")
echo "$WALLET_ADDRESSES_AFTER" | python3 -m json.tool
echo ""

echo "5. Getting UTXOs for address..."
UTXOS=$(rpc_call "listunspent" "0" "9999999" "[\"$ADDRESS\"]")
echo "$UTXOS" | python3 -m json.tool
echo ""

echo "6. Getting received amount..."
RECEIVED=$(rpc_call "getreceivedbyaddress" "\"$ADDRESS\"" "0")
echo "$RECEIVED" | python3 -m json.tool
echo ""

echo "=== Test Complete ==="
