#!/bin/bash
set -e

echo "Starting Zcash testnet node in Docker..."

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker daemon is not running."
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q '^zcash-testnet$'; then
    echo "Container exists. Removing old container..."
    docker rm -f zcash-testnet >/dev/null 2>&1
fi

# Try zcashfr/zcash image (community maintained)
echo "Pulling Zcash image..."
docker pull zcashfr/zcash:latest || {
    echo "Failed to pull image. Trying alternative..."
    docker pull k0st/zcash:latest || {
        echo "❌ Could not pull Zcash Docker image."
        echo "Please install zcashd manually or try:"
        echo "  git clone https://github.com/zcash/zcash.git"
        echo "  cd zcash && ./zcutil/build.sh"
        exit 1
    }
    IMAGE="k0st/zcash:latest"
}

IMAGE=${IMAGE:-"zcashfr/zcash:latest"}

# Start container
echo "Starting Zcash testnet node with image: $IMAGE"
docker run -d \
  --name zcash-testnet \
  -p 18232:18232 \
  -v ~/.zcash:/root/.zcash \
  $IMAGE \
  -testnet \
  -rpcuser=testuser \
  -rpcpassword=testpass123 \
  -rpcallowip=0.0.0.0 \
  -server=1

echo ""
echo "✅ Zcash testnet node started!"
echo ""
echo "To check logs:"
echo "  docker logs -f zcash-testnet"
echo ""
echo "To check sync status:"
echo "  docker exec zcash-testnet zcash-cli -testnet getblockcount"
echo ""
echo "To stop:"
echo "  docker stop zcash-testnet"
echo ""
echo "The node is syncing. This will take 4-8 hours on first run."
