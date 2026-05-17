#!/usr/bin/env bash
set -euo pipefail

# Azure Piston Deployment Script
# Deploys the Piston code execution engine to an Azure VM.
# Piston requires --privileged Docker mode, so a VM is used instead of ACI/ACA.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - SSH client installed (for scp/ssh)
#   - Run this script from the repo root

# ─── Configuration ───────────────────────────────────────────────────────────

RESOURCE_GROUP="${RESOURCE_GROUP:-digimine-piston-rg}"
LOCATION="${LOCATION:-eastus}"
VM_NAME="${VM_NAME:-digimine-piston-vm}"
VM_SIZE="${VM_SIZE:-Standard_B2s}"          # 2 vCPU, 4 GB RAM
ADMIN_USER="${ADMIN_USER:-azureuser}"
PISTON_PORT="${PISTON_PORT:-2000}"
SSH_PORT="${SSH_PORT:-22}"
OS_DISK_SIZE="${OS_DISK_SIZE:-30}"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
step()  { echo -e "${BLUE}[STEP]${NC} $*"; }

# ─── Validation ──────────────────────────────────────────────────────────────

if ! command -v az &> /dev/null; then
    error "Azure CLI (az) is not installed. Install it from https://aka.ms/installazurecli"
    exit 1
fi

if ! az account show &> /dev/null; then
    error "Not logged into Azure. Run: az login"
    exit 1
fi

for cmd in scp ssh; do
    if ! command -v "$cmd" &> /dev/null; then
        error "${cmd} is not installed. Please install OpenSSH client."
        exit 1
    fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKER_DIR="${REPO_ROOT}/docker/piston"

if [[ ! -d "$DOCKER_DIR" ]]; then
    error "docker/piston directory not found at ${DOCKER_DIR}"
    error "Please run this script from the repo root or ensure docker/piston/ exists."
    exit 1
fi

info "Configuration:"
echo "  Resource Group: ${RESOURCE_GROUP}"
echo "  Location:       ${LOCATION}"
echo "  VM Name:        ${VM_NAME}"
echo "  VM Size:        ${VM_SIZE}"
echo "  Admin User:     ${ADMIN_USER}"
echo "  Piston Port:    ${PISTON_PORT}"
echo ""
read -rp "Press Enter to continue or Ctrl+C to cancel..."

# ─── Create Resource Group ───────────────────────────────────────────────────

step "Creating resource group (if not exists)..."
az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

# ─── Create VM with Cloud-Init (Docker pre-installed) ────────────────────────

step "Creating VM with Docker pre-installed via cloud-init..."

CLOUD_INIT=$(cat <<'EOF'
#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - jq

runcmd:
  # Install Docker
  - mkdir -p /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - usermod -aG docker azureuser
  - systemctl enable docker
  - systemctl start docker
EOF
)

CLOUD_INIT_FILE="/tmp/piston-cloud-init-${VM_NAME}.yaml"
echo "$CLOUD_INIT" > "$CLOUD_INIT_FILE"

az vm create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --image "Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest" \
    --size "$VM_SIZE" \
    --admin-username "$ADMIN_USER" \
    --generate-ssh-keys \
    --os-disk-size-gb "$OS_DISK_SIZE" \
    --public-ip-sku Standard \
    --custom-data "$CLOUD_INIT_FILE" \
    --output none

rm -f "$CLOUD_INIT_FILE"

# ─── Open Ports ──────────────────────────────────────────────────────────────

step "Opening network ports..."
az vm open-port \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --port "${SSH_PORT},${PISTON_PORT}" \
    --output none

# ─── Get VM Details ──────────────────────────────────────────────────────────

PUBLIC_IP=$(az vm show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --show-details \
    --query "publicIps" \
    --output tsv)

info "VM Public IP: ${PUBLIC_IP}"

# ─── Wait for VM & SSH readiness ─────────────────────────────────────────────

step "Waiting for VM to be ready for SSH (this may take 2-3 minutes)..."
for i in $(seq 1 60); do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
            "${ADMIN_USER}@${PUBLIC_IP}" "echo ok" &>/dev/null; then
        info "VM is reachable via SSH."
        break
    fi
    if [[ "$i" -eq 60 ]]; then
        error "VM did not become reachable via SSH. Check Azure portal for status."
        exit 1
    fi
    sleep 3
    echo -n "."
done
echo ""

# ─── Copy Piston Docker files to VM ──────────────────────────────────────────

step "Copying docker/piston files to VM..."
ssh -o StrictHostKeyChecking=no "${ADMIN_USER}@${PUBLIC_IP}" "mkdir -p /home/${ADMIN_USER}/piston"
scp -o StrictHostKeyChecking=no -r "${DOCKER_DIR}/"* "${ADMIN_USER}@${PUBLIC_IP}:/home/${ADMIN_USER}/piston/"

# ─── Build & Run Piston on VM ────────────────────────────────────────────────

step "Building and starting Piston Docker container (this takes ~5-10 minutes)..."
ssh -o StrictHostKeyChecking=no "${ADMIN_USER}@${PUBLIC_IP}" << REMOTE_SCRIPT
set -e
cd /home/${ADMIN_USER}/piston

echo "Building Piston image with pre-installed languages..."
sudo docker build -t digimine-piston -f Dockerfile .

echo "Starting Piston container..."
sudo docker run -d \
    --name piston \
    --privileged \
    --restart unless-stopped \
    -p ${PISTON_PORT}:2000 \
    digimine-piston

echo "Waiting for Piston to be healthy..."
for i in \$(seq 1 60); do
    if curl -sf http://localhost:${PISTON_PORT}/api/v2/runtimes > /dev/null 2>&1; then
        echo "Piston is healthy and ready!"
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
REMOTE_SCRIPT

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                     AZURE PISTON DEPLOYMENT SUMMARY                          ║"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
printf "║  %-76s ║\n" "Resource Group:  ${RESOURCE_GROUP}"
printf "║  %-76s ║\n" "VM Name:         ${VM_NAME}"
printf "║  %-76s ║\n" "VM Size:         ${VM_SIZE}"
printf "║  %-76s ║\n" "Public IP:       ${PUBLIC_IP}"
printf "║  %-76s ║\n" "SSH Access:      ssh ${ADMIN_USER}@${PUBLIC_IP}"
printf "║  %-76s ║\n" "Piston API:      http://${PUBLIC_IP}:${PISTON_PORT}"
printf "║  %-76s ║\n" "Piston Health:   http://${PUBLIC_IP}:${PISTON_PORT}/api/v2/runtimes"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
echo "║  NEXT STEPS:                                                                 ║"
printf "║  %-76s ║\n" "1. Test Piston health: curl http://${PUBLIC_IP}:${PISTON_PORT}/api/v2/runtimes"
printf "║  %-76s ║\n" "2. Update your app env var: PISTON_API_URL=http://${PUBLIC_IP}:${PISTON_PORT}"
printf "║  %-76s ║\n" "3. View container logs: ssh ${ADMIN_USER}@${PUBLIC_IP} 'sudo docker logs -f piston'"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
