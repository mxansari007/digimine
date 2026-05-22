#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Deploy a NEW, independent Piston instance on its own Azure VM.
#
# Unlike scripts/deploy-piston-azure.sh (which uses a single fixed resource
# group + VM name + your default ~/.ssh/id_rsa), this script is INSTANCE-AWARE:
# every instance gets its own resource group, VM, and dedicated SSH key pair.
# That means you can run it many times to stand up separate Piston machines
# (e.g. prod, india, backup, staging) without one clobbering another.
#
# It is also IDEMPOTENT — re-running it for an existing instance skips VM
# creation and just (re)deploys the container, so you can use it to recover
# or update a machine too.
#
# Usage:
#   ./scripts/deploy-piston-azure-instance.sh <instance-name>
#
# Examples:
#   ./scripts/deploy-piston-azure-instance.sh prod
#   LOCATION=centralindia VM_SIZE=Standard_B2ms \
#       ./scripts/deploy-piston-azure-instance.sh india
#
# Prerequisites:
#   - Azure CLI installed + logged in:  az login
#   - OpenSSH client (ssh, scp, ssh-keygen)
#   - Run from anywhere inside the repo
# ─────────────────────────────────────────────────────────────────────────────

# ─── Args ────────────────────────────────────────────────────────────────────

INSTANCE="${1:-${INSTANCE:-}}"
if [[ -z "$INSTANCE" ]]; then
    echo "Usage: $0 <instance-name>   (e.g. prod, india, backup)"
    exit 1
fi
# Normalise: lowercase, alnum + dashes only.
INSTANCE="$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-' | sed 's/^-*//;s/-*$//')"
if [[ -z "$INSTANCE" ]]; then
    echo "Instance name reduced to empty after sanitising. Use letters/numbers."
    exit 1
fi

# ─── Configuration (override via env) ────────────────────────────────────────

RESOURCE_GROUP="${RESOURCE_GROUP:-digimine-piston-${INSTANCE}-rg}"
LOCATION="${LOCATION:-centralindia}"           # India-first; override for other regions
VM_NAME="${VM_NAME:-digimine-piston-${INSTANCE}}"
VM_SIZE="${VM_SIZE:-Standard_B2ms}"            # 2 vCPU / 8 GB — comfortable for compiles
ADMIN_USER="${ADMIN_USER:-azureuser}"
PISTON_PORT="${PISTON_PORT:-2000}"
SSH_PORT="${SSH_PORT:-22}"
OS_DISK_SIZE="${OS_DISK_SIZE:-30}"

# Dedicated key pair per instance so machines stay isolated.
SSH_KEY="${SSH_KEY:-$HOME/.ssh/digimine-piston-${INSTANCE}}"

# Optional: lock the Piston port down to a single source IP/CIDR.
# Leave blank to expose to the internet (NOT recommended for prod).
ALLOWED_SOURCE_IP="${ALLOWED_SOURCE_IP:-}"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
step()  { echo -e "${BLUE}[STEP]${NC} $*"; }

# ─── Validation ──────────────────────────────────────────────────────────────

command -v az        >/dev/null 2>&1 || { error "Azure CLI not installed: https://aka.ms/installazurecli"; exit 1; }
command -v ssh       >/dev/null 2>&1 || { error "ssh not installed (OpenSSH client)."; exit 1; }
command -v scp       >/dev/null 2>&1 || { error "scp not installed (OpenSSH client)."; exit 1; }
command -v ssh-keygen>/dev/null 2>&1 || { error "ssh-keygen not installed (OpenSSH client)."; exit 1; }
az account show >/dev/null 2>&1 || { error "Not logged into Azure. Run: az login"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCKER_DIR="${REPO_ROOT}/docker/piston"
OUT_DIR="${REPO_ROOT}/.deploy"
OUT_FILE="${OUT_DIR}/piston-${INSTANCE}.env"

[[ -d "$DOCKER_DIR" ]] || { error "docker/piston not found at ${DOCKER_DIR}"; exit 1; }
mkdir -p "$OUT_DIR"

# ─── Ensure a dedicated SSH key pair ─────────────────────────────────────────

if [[ ! -f "${SSH_KEY}" ]]; then
    step "Generating dedicated SSH key for instance '${INSTANCE}' at ${SSH_KEY}..."
    ssh-keygen -t ed25519 -N "" -C "digimine-piston-${INSTANCE}" -f "${SSH_KEY}" >/dev/null
else
    info "Reusing existing SSH key ${SSH_KEY}"
fi
SSH_OPTS=(-i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${HOME}/.ssh/known_hosts")

# ─── Summary + confirm ───────────────────────────────────────────────────────

info "Deployment plan:"
echo "  Instance:        ${INSTANCE}"
echo "  Resource Group:  ${RESOURCE_GROUP}"
echo "  Location:        ${LOCATION}"
echo "  VM Name:         ${VM_NAME}"
echo "  VM Size:         ${VM_SIZE}"
echo "  Admin User:      ${ADMIN_USER}"
echo "  Piston Port:     ${PISTON_PORT}"
echo "  SSH Key:         ${SSH_KEY}"
echo "  Source IP lock:  ${ALLOWED_SOURCE_IP:-<open to internet>}"
echo "  Output file:     ${OUT_FILE}"
echo ""
read -rp "Press Enter to continue or Ctrl+C to cancel..."

# ─── Resource group (idempotent) ─────────────────────────────────────────────

step "Ensuring resource group '${RESOURCE_GROUP}'..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# ─── VM (create only if missing) ─────────────────────────────────────────────

VM_EXISTS="false"
if az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --output none 2>/dev/null; then
    VM_EXISTS="true"
    info "VM '${VM_NAME}' already exists — skipping creation, will (re)deploy the container."
fi

if [[ "$VM_EXISTS" == "false" ]]; then
    step "Creating VM with Docker pre-installed via cloud-init..."
    CLOUD_INIT_FILE="$(mktemp)"
    cat > "$CLOUD_INIT_FILE" <<'EOF'
#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - jq
runcmd:
  - mkdir -p /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - usermod -aG docker azureuser
  - systemctl enable docker
  - systemctl start docker
EOF

    az vm create \
        --resource-group "$RESOURCE_GROUP" \
        --name "$VM_NAME" \
        --image "Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest" \
        --size "$VM_SIZE" \
        --admin-username "$ADMIN_USER" \
        --ssh-key-values "${SSH_KEY}.pub" \
        --os-disk-size-gb "$OS_DISK_SIZE" \
        --public-ip-sku Standard \
        --custom-data "$CLOUD_INIT_FILE" \
        --output none
    rm -f "$CLOUD_INIT_FILE"
fi

# ─── Network ports ───────────────────────────────────────────────────────────

step "Opening network ports (SSH ${SSH_PORT}, Piston ${PISTON_PORT})..."
az vm open-port \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --port "${SSH_PORT},${PISTON_PORT}" \
    --priority 1001 \
    --output none

# Optionally tighten the Piston port to a single source.
if [[ -n "$ALLOWED_SOURCE_IP" ]]; then
    step "Restricting Piston port ${PISTON_PORT} to ${ALLOWED_SOURCE_IP}..."
    NSG_NAME="$(az network nsg list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)"
    if [[ -n "$NSG_NAME" ]]; then
        az network nsg rule create \
            --resource-group "$RESOURCE_GROUP" \
            --nsg-name "$NSG_NAME" \
            --name "piston-restricted" \
            --priority 1000 \
            --direction Inbound \
            --access Allow \
            --protocol Tcp \
            --destination-port-ranges "$PISTON_PORT" \
            --source-address-prefixes "$ALLOWED_SOURCE_IP" \
            --output none
        # Drop the open rule that az vm open-port created for the same port.
        az network nsg rule delete \
            --resource-group "$RESOURCE_GROUP" \
            --nsg-name "$NSG_NAME" \
            --name "open-port-${PISTON_PORT}" \
            --output none 2>/dev/null || true
        info "Piston port locked to ${ALLOWED_SOURCE_IP}."
    else
        warn "Could not find an NSG to restrict; port stays open."
    fi
fi

# ─── Public IP ───────────────────────────────────────────────────────────────

PUBLIC_IP="$(az vm show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --show-details \
    --query "publicIps" \
    --output tsv)"
info "VM Public IP: ${PUBLIC_IP}"

# ─── Wait for SSH ────────────────────────────────────────────────────────────

step "Waiting for SSH to come up..."
for i in $(seq 1 60); do
    if ssh "${SSH_OPTS[@]}" -o ConnectTimeout=5 "${ADMIN_USER}@${PUBLIC_IP}" "echo ok" &>/dev/null; then
        info "SSH reachable."
        break
    fi
    [[ "$i" -eq 60 ]] && { error "VM never became reachable via SSH."; exit 1; }
    sleep 3; echo -n "."
done
echo ""

# ─── Wait for Docker (cloud-init may still be running on a fresh VM) ─────────

if [[ "$VM_EXISTS" == "false" ]]; then
    step "Waiting for Docker to finish installing (cloud-init)..."
    for i in $(seq 1 60); do
        if ssh "${SSH_OPTS[@]}" "${ADMIN_USER}@${PUBLIC_IP}" "command -v docker >/dev/null 2>&1"; then
            info "Docker is installed."
            break
        fi
        [[ "$i" -eq 60 ]] && { error "Docker did not install in time. Check cloud-init: sudo cat /var/log/cloud-init-output.log"; exit 1; }
        sleep 5; echo -n "."
    done
    echo ""
fi

# ─── Copy files ──────────────────────────────────────────────────────────────

step "Copying docker/piston files to VM..."
ssh "${SSH_OPTS[@]}" "${ADMIN_USER}@${PUBLIC_IP}" "mkdir -p /home/${ADMIN_USER}/piston"
scp "${SSH_OPTS[@]}" -r "${DOCKER_DIR}/"* "${ADMIN_USER}@${PUBLIC_IP}:/home/${ADMIN_USER}/piston/"

# ─── Build + run (idempotent: replaces any existing container) ──────────────

step "Building and starting Piston (this takes ~5-10 minutes on first build)..."
REMOTE_SCRIPT_FILE="$(mktemp)"
cat > "$REMOTE_SCRIPT_FILE" <<REMOTE
#!/usr/bin/env bash
set -e
cd /home/${ADMIN_USER}/piston
echo "Stopping any old container..."
sudo docker stop piston 2>/dev/null || true
sudo docker rm piston 2>/dev/null || true
echo "Building image..."
sudo docker build -t digimine-piston -f Dockerfile .
echo "Starting container..."
sudo docker run -d \
    --name piston \
    --privileged \
    --restart unless-stopped \
    -p ${PISTON_PORT}:2000 \
    digimine-piston
echo "Waiting for health check..."
for i in \$(seq 1 90); do
    if curl -sf http://localhost:${PISTON_PORT}/api/v2/runtimes > /dev/null 2>&1; then
        echo "Piston is healthy!"
        break
    fi
    if [ "\$i" -eq 90 ]; then
        echo "WARNING: Piston did not become healthy in time. Check: sudo docker logs piston"
        exit 1
    fi
    sleep 2; echo -n "."
done
echo ""
sudo docker image prune -f || true
REMOTE
scp "${SSH_OPTS[@]}" "$REMOTE_SCRIPT_FILE" "${ADMIN_USER}@${PUBLIC_IP}:/tmp/deploy-piston.sh"
rm -f "$REMOTE_SCRIPT_FILE"
# TTY so sudo can prompt if the VM ever falls back to password auth.
ssh -tt "${SSH_OPTS[@]}" "${ADMIN_USER}@${PUBLIC_IP}" "chmod +x /tmp/deploy-piston.sh && /tmp/deploy-piston.sh; rm -f /tmp/deploy-piston.sh"

# ─── Persist connection details ──────────────────────────────────────────────

PISTON_EXECUTE_URL="http://${PUBLIC_IP}:${PISTON_PORT}/api/v2/execute"
cat > "$OUT_FILE" <<EOF
# Piston instance: ${INSTANCE}
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") by deploy-piston-azure-instance.sh
INSTANCE=${INSTANCE}
RESOURCE_GROUP=${RESOURCE_GROUP}
VM_NAME=${VM_NAME}
LOCATION=${LOCATION}
PUBLIC_IP=${PUBLIC_IP}
SSH_KEY=${SSH_KEY}
SSH_COMMAND=ssh -i ${SSH_KEY} ${ADMIN_USER}@${PUBLIC_IP}

# Set this in your web app's environment:
PISTON_URL=${PISTON_EXECUTE_URL}
EOF
info "Saved connection details to ${OUT_FILE}"

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                 AZURE PISTON INSTANCE DEPLOYED                               ║"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
printf "║  %-76s ║\n" "Instance:        ${INSTANCE}"
printf "║  %-76s ║\n" "Resource Group:  ${RESOURCE_GROUP}"
printf "║  %-76s ║\n" "VM Name:         ${VM_NAME}"
printf "║  %-76s ║\n" "Public IP:       ${PUBLIC_IP}"
printf "║  %-76s ║\n" "SSH:             ssh -i ${SSH_KEY} ${ADMIN_USER}@${PUBLIC_IP}"
printf "║  %-76s ║\n" "Health:          http://${PUBLIC_IP}:${PISTON_PORT}/api/v2/runtimes"
echo "╠══════════════════════════════════════════════════════════════════════════════╣"
printf "║  %-76s ║\n" "Set in your app env:"
printf "║  %-76s ║\n" "  PISTON_URL=${PISTON_EXECUTE_URL}"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
info "Verify:  curl http://${PUBLIC_IP}:${PISTON_PORT}/api/v2/runtimes"
