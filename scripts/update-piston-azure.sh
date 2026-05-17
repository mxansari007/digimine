#!/usr/bin/env bash
set -euo pipefail

# Update Piston on an existing Azure VM
# Rebuilds the Docker image and restarts the container with zero downtime.
#
# Usage:
#   ./scripts/update-piston-azure.sh <PUBLIC_IP> [ADMIN_USER]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <PUBLIC_IP> [ADMIN_USER]"
    echo "Example: $0 20.123.45.67 azureuser"
    exit 1
fi

PUBLIC_IP="$1"
ADMIN_USER="${2:-azureuser}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(cd "${SCRIPT_DIR}/../docker/piston" && pwd)"

if [[ ! -d "$DOCKER_DIR" ]]; then
    error "docker/piston directory not found at ${DOCKER_DIR}"
    exit 1
fi

info "Updating Piston on ${PUBLIC_IP}..."
REMOTE_SCRIPT_PATH="/tmp/update-digimine-piston.sh"

# Copy updated files
info "Copying docker/piston files..."
ssh -o StrictHostKeyChecking=no "${ADMIN_USER}@${PUBLIC_IP}" "mkdir -p /home/${ADMIN_USER}/piston"
scp -o StrictHostKeyChecking=no -r "${DOCKER_DIR}/"* "${ADMIN_USER}@${PUBLIC_IP}:/home/${ADMIN_USER}/piston/"

info "Uploading remote update runner..."
REMOTE_SCRIPT_FILE="$(mktemp)"
cat > "${REMOTE_SCRIPT_FILE}" << REMOTE_SCRIPT
#!/usr/bin/env bash
set -e
cd /home/${ADMIN_USER}/piston

echo "Stopping old container..."
sudo docker stop piston || true
sudo docker rm piston || true

echo "Building new image..."
sudo docker build -t digimine-piston -f Dockerfile .

echo "Starting new container..."
sudo docker run -d \
    --name piston \
    --privileged \
    --restart unless-stopped \
    -p 2000:2000 \
    digimine-piston

echo "Waiting for health check..."
for i in \$(seq 1 60); do
    if curl -sf http://localhost:2000/api/v2/runtimes > /dev/null 2>&1; then
        echo "Piston is healthy!"
        break
    fi
    if [ "\$i" -eq 60 ]; then
        echo "WARNING: Piston did not become healthy in time."
        echo "Check logs: sudo docker logs piston"
        exit 1
    fi
    sleep 2
    echo -n "."
done
echo ""

# Prune old images to save disk
sudo docker image prune -f || true
REMOTE_SCRIPT
scp -o StrictHostKeyChecking=no "${REMOTE_SCRIPT_FILE}" "${ADMIN_USER}@${PUBLIC_IP}:${REMOTE_SCRIPT_PATH}"
rm -f "${REMOTE_SCRIPT_FILE}"

# Rebuild and restart
info "Rebuilding Piston image (this takes ~5-10 minutes)..."
# Run a real remote script through a TTY so sudo can prompt reliably.
ssh -tt -o StrictHostKeyChecking=no "${ADMIN_USER}@${PUBLIC_IP}" "chmod +x ${REMOTE_SCRIPT_PATH} && ${REMOTE_SCRIPT_PATH}; rm -f ${REMOTE_SCRIPT_PATH}"

info "Update complete! Piston is running at http://${PUBLIC_IP}:2000"
