#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Deploy / migrate Piston onto an EXISTING Azure VM — using only the Azure CLI.
#
# No SSH keys, no open SSH port required. Everything runs through
# `az vm run-command invoke`, which executes shell on the VM via the Azure
# control plane. The Piston Dockerfile + install script are base64-embedded
# into the remote script, so nothing has to be scp'd.
#
# Use this when the target machine is already created and you just want
# Piston running on it.
#
# Usage:
#   ./scripts/deploy-piston-azure-existing.sh <resource-group> <vm-name>
#
# Examples:
#   ./scripts/deploy-piston-azure-existing.sh my-rg my-existing-vm
#   PISTON_PORT=2000 ./scripts/deploy-piston-azure-existing.sh prod-rg prod-vm
#
# Prerequisites:
#   - Azure CLI installed + logged in:  az login
#   - The VM is Ubuntu/Debian and uses cgroup v2 (Ubuntu 22.04+ does)
#   - The VM has outbound internet (to pull the Piston base image + apt)
# ─────────────────────────────────────────────────────────────────────────────

RESOURCE_GROUP="${1:-${RESOURCE_GROUP:-}}"
VM_NAME="${2:-${VM_NAME:-}}"
PISTON_PORT="${PISTON_PORT:-2000}"
ALLOWED_SOURCE_IP="${ALLOWED_SOURCE_IP:-}"   # optional CIDR to lock port 2000

if [[ -z "$RESOURCE_GROUP" || -z "$VM_NAME" ]]; then
    echo "Usage: $0 <resource-group> <vm-name>"
    echo "Example: $0 my-rg my-existing-vm"
    exit 1
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
step()  { echo -e "${BLUE}[STEP]${NC} $*"; }

command -v az >/dev/null 2>&1 || { error "Azure CLI not installed: https://aka.ms/installazurecli"; exit 1; }
az account show >/dev/null 2>&1 || { error "Not logged into Azure. Run: az login"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKER_DIR="${REPO_ROOT}/docker/piston"
OUT_DIR="${REPO_ROOT}/.deploy"
OUT_FILE="${OUT_DIR}/piston-${VM_NAME}.env"

[[ -f "${DOCKER_DIR}/Dockerfile" ]] || { error "Missing ${DOCKER_DIR}/Dockerfile"; exit 1; }
[[ -f "${DOCKER_DIR}/install-packages.sh" ]] || { error "Missing ${DOCKER_DIR}/install-packages.sh"; exit 1; }
mkdir -p "$OUT_DIR"

# ─── Confirm the VM exists ───────────────────────────────────────────────────

step "Checking VM ${VM_NAME} in ${RESOURCE_GROUP}..."
if ! az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --output none 2>/dev/null; then
    error "VM '${VM_NAME}' not found in resource group '${RESOURCE_GROUP}'."
    error "List your VMs with: az vm list -o table"
    exit 1
fi

# Make sure the VM is running.
POWER_STATE="$(az vm get-instance-view --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --query "instanceView.statuses[?starts_with(code, 'PowerState/')].code | [0]" -o tsv 2>/dev/null || true)"
if [[ "$POWER_STATE" != "PowerState/running" ]]; then
    warn "VM power state is '${POWER_STATE:-unknown}'. Starting it..."
    az vm start --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --output none
fi

# ─── Open the Piston port ────────────────────────────────────────────────────

step "Opening Piston port ${PISTON_PORT}..."
az vm open-port \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --port "$PISTON_PORT" \
    --priority 1010 \
    --output none 2>/dev/null || warn "Port may already be open (continuing)."

if [[ -n "$ALLOWED_SOURCE_IP" ]]; then
    step "Restricting port ${PISTON_PORT} to ${ALLOWED_SOURCE_IP}..."
    NSG_NAME="$(az network nsg list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || true)"
    if [[ -n "$NSG_NAME" ]]; then
        az network nsg rule create \
            --resource-group "$RESOURCE_GROUP" --nsg-name "$NSG_NAME" \
            --name "piston-restricted" --priority 1005 --direction Inbound --access Allow \
            --protocol Tcp --destination-port-ranges "$PISTON_PORT" \
            --source-address-prefixes "$ALLOWED_SOURCE_IP" --output none
        az network nsg rule delete --resource-group "$RESOURCE_GROUP" --nsg-name "$NSG_NAME" \
            --name "open-port-${PISTON_PORT}" --output none 2>/dev/null || true
        info "Locked port ${PISTON_PORT} to ${ALLOWED_SOURCE_IP}."
    else
        warn "No NSG found to restrict; port stays open."
    fi
fi

# ─── Build the remote bootstrap script ───────────────────────────────────────

step "Preparing remote bootstrap (embedding Piston files)..."
DOCKERFILE_B64="$(base64 < "${DOCKER_DIR}/Dockerfile")"
INSTALL_B64="$(base64 < "${DOCKER_DIR}/install-packages.sh")"

REMOTE_SCRIPT_FILE="$(mktemp)"
cat > "$REMOTE_SCRIPT_FILE" <<EOF
#!/usr/bin/env bash
set -e
# az vm run-command runs as root, non-interactive.

echo "=== Piston deploy on \$(hostname) ==="

# 1. Install Docker if missing (Ubuntu/Debian).
if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found — installing..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || \
        curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/\${ID} \$(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "Docker installed."
else
    echo "Docker present: \$(docker --version)"
    systemctl start docker 2>/dev/null || true
fi

# 2. Write the Piston build files.
mkdir -p /opt/piston
echo "${DOCKERFILE_B64}" | base64 -d > /opt/piston/Dockerfile
echo "${INSTALL_B64}" | base64 -d > /opt/piston/install-packages.sh
chmod +x /opt/piston/install-packages.sh

# 3. Replace any existing container.
cd /opt/piston
docker stop piston 2>/dev/null || true
docker rm piston 2>/dev/null || true

echo "Building image (this can take 5-10 min)..."
docker build -t digimine-piston -f Dockerfile .

echo "Starting container..."
docker run -d \\
    --name piston \\
    --privileged \\
    --restart unless-stopped \\
    -p ${PISTON_PORT}:2000 \\
    digimine-piston

echo "Waiting for health check..."
for i in \$(seq 1 90); do
    if curl -sf http://localhost:${PISTON_PORT}/api/v2/runtimes >/dev/null 2>&1; then
        echo "PISTON_HEALTHY"
        curl -s http://localhost:${PISTON_PORT}/api/v2/runtimes || true
        break
    fi
    if [ "\$i" -eq 90 ]; then
        echo "PISTON_UNHEALTHY — recent logs:"
        docker logs --tail 50 piston 2>&1 || true
        exit 1
    fi
    sleep 2
done

docker image prune -f >/dev/null 2>&1 || true
echo "=== Deploy finished ==="
EOF

# ─── Run on the VM via az ────────────────────────────────────────────────────

step "Running deploy on the VM via 'az vm run-command' (build takes 5-10 min; please wait)..."
RUN_OUTPUT="$(az vm run-command invoke \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --command-id RunShellScript \
    --scripts "@${REMOTE_SCRIPT_FILE}" \
    --query "value[0].message" \
    --output tsv 2>&1)" || {
        rm -f "$REMOTE_SCRIPT_FILE"
        error "Remote command failed. Output below:"
        echo "$RUN_OUTPUT"
        exit 1
    }
rm -f "$REMOTE_SCRIPT_FILE"

echo "────────────────── remote output ──────────────────"
echo "$RUN_OUTPUT"
echo "────────────────────────────────────────────────────"

if ! echo "$RUN_OUTPUT" | grep -q "PISTON_HEALTHY"; then
    error "Piston did not report healthy. See the remote output above (look for build/runtime errors)."
    error "Common cause on existing VMs: the OS doesn't expose cgroup v2. Piston requires pure cgroup v2."
    exit 1
fi

# ─── Resolve the reachable address + persist details ─────────────────────────

PUBLIC_IP="$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --show-details \
    --query "publicIps" -o tsv 2>/dev/null || true)"
PRIVATE_IP="$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --show-details \
    --query "privateIps" -o tsv 2>/dev/null || true)"
HOST="${PUBLIC_IP:-$PRIVATE_IP}"
PISTON_EXECUTE_URL="http://${HOST}:${PISTON_PORT}/api/v2/execute"

cat > "$OUT_FILE" <<EOF
# Piston deployed to existing VM: ${VM_NAME}
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") by deploy-piston-azure-existing.sh
RESOURCE_GROUP=${RESOURCE_GROUP}
VM_NAME=${VM_NAME}
PUBLIC_IP=${PUBLIC_IP}
PRIVATE_IP=${PRIVATE_IP}

# Set this in your web app's environment:
PISTON_URL=${PISTON_EXECUTE_URL}
EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                 PISTON DEPLOYED TO EXISTING AZURE VM                         ║"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
printf "║  %-76s ║\n" "Resource Group:  ${RESOURCE_GROUP}"
printf "║  %-76s ║\n" "VM Name:         ${VM_NAME}"
printf "║  %-76s ║\n" "Public IP:       ${PUBLIC_IP:-<none>}"
printf "║  %-76s ║\n" "Private IP:      ${PRIVATE_IP:-<none>}"
printf "║  %-76s ║\n" "Health:          http://${HOST}:${PISTON_PORT}/api/v2/runtimes"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
printf "║  %-76s ║\n" "Set in your app env:"
printf "║  %-76s ║\n" "  PISTON_URL=${PISTON_EXECUTE_URL}"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
info "Saved to ${OUT_FILE}"
if [[ -n "$PUBLIC_IP" ]]; then
    info "Verify:  curl http://${PUBLIC_IP}:${PISTON_PORT}/api/v2/runtimes"
else
    warn "VM has no public IP — reach it from inside its VNet at ${PRIVATE_IP}:${PISTON_PORT}."
fi
