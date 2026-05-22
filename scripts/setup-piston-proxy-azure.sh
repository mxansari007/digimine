#!/usr/bin/env bash
set -euo pipefail
# Map HTTP(80) + HTTPS(443) -> Piston(2000) on an existing Azure VM via Caddy.
# Usage: ./scripts/setup-piston-proxy-azure.sh <resource-group> <vm-name> [domain]
#   With a domain  -> valid auto-HTTPS (Let's Encrypt) on 443 + 80 redirect.
#   Without domain -> HTTP only on 80 (443 with a valid cert REQUIRES a domain).

RG="${1:-}"; VM="${2:-}"; DOMAIN="${3:-}"
[ -z "$RG" ] || [ -z "$VM" ] && { echo "Usage: $0 <resource-group> <vm-name> [domain]"; exit 1; }

echo "[1/3] Opening ports 80 + 443..."
az vm open-port -g "$RG" -n "$VM" --port 80,443 --priority 1020 -o none || true

echo "[2/3] Building remote setup script..."
TMP="$(mktemp)"
if [ -n "$DOMAIN" ]; then
  CADDYFILE="${DOMAIN} {
    reverse_proxy localhost:2000
}
http://${DOMAIN} {
    redir https://{host}{uri} permanent
}"
else
  CADDYFILE=":80 {
    reverse_proxy localhost:2000
}"
fi

cat > "$TMP" <<REMOTE
#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<'CADDY'
${CADDYFILE}
CADDY
systemctl enable caddy
systemctl restart caddy
sleep 3
echo "=== caddy status ==="; systemctl is-active caddy
echo "=== local proxy test ==="; curl -sf http://localhost/api/v2/runtimes >/dev/null && echo "proxy -> piston OK" || echo "proxy test FAILED (is the piston container running on 2000?)"
REMOTE

echo "[3/3] Running on VM via az..."
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript \
  --scripts "@${TMP}" --query "value[0].message" -o tsv
rm -f "$TMP"

echo ""
if [ -n "$DOMAIN" ]; then
  echo "Done. Set in your web app:  PISTON_URL=https://${DOMAIN}/api/v2/execute"
else
  echo "Done (HTTP only). Set:  PISTON_URL=http://<VM_IP>/api/v2/execute"
  echo "For HTTPS on 443 you need a domain pointed at the VM, then re-run with it."
fi