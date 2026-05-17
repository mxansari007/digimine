# Deploy Piston Code Execution Engine on Azure VM

This guide deploys the **Piston** code execution engine to an **Azure Virtual Machine**. Piston runs student-submitted code (Python, JavaScript, C++, Java) in isolated Docker containers and requires `--privileged` mode, which is **not supported** by Azure Container Instances or Azure Container Apps. A VM is the simplest and most compatible option.

---

## What Gets Deployed

| Component | Details |
|-----------|---------|
| **VM** | Ubuntu 22.04 LTS (Standard_B2s or larger) |
| **Docker** | Installed automatically via cloud-init |
| **Piston** | Pre-built image with Python, JS, C++, Java packages |
| **Network** | Ports 22 (SSH) and 2000 (Piston API) open |

---

## Prerequisites

1. **Azure CLI** installed and logged in:
   ```bash
   az login
   ```
2. **OpenSSH client** (`ssh`, `scp`) installed.
3. **Repo cloned locally** — the script reads `docker/piston/` files from your repo.

---

## Quick Deploy

From the repo root, run:

```bash
./scripts/deploy-piston-azure.sh
```

The script will:
1. Create a resource group (default: `digimine-piston-rg`)
2. Provision an Ubuntu VM with Docker pre-installed
3. Open ports 22 and 2000
4. Copy your `docker/piston/` files to the VM
5. Build the Piston Docker image (pre-installs language packages)
6. Start the container in privileged mode
7. Verify health check passes

**Total time:** ~8–12 minutes (VM provisioning + Docker install + image build).

---

## Configuration (Environment Variables)

Override defaults by setting environment variables before running the script:

| Variable | Default | Description |
|----------|---------|-------------|
| `RESOURCE_GROUP` | `digimine-piston-rg` | Azure resource group name |
| `LOCATION` | `eastus` | Azure region |
| `VM_NAME` | `digimine-piston-vm` | VM name |
| `VM_SIZE` | `Standard_B2s` | VM size (see below) |
| `ADMIN_USER` | `azureuser` | Linux admin username |
| `PISTON_PORT` | `2000` | Host port mapped to Piston container |
| `OS_DISK_SIZE` | `30` | OS disk size in GB |

Example:

```bash
export VM_SIZE="Standard_B2ms"
export LOCATION="westeurope"
./scripts/deploy-piston-azure.sh
```

### Recommended VM Sizes

| Size | vCPU | RAM | Monthly Cost (approx) | Best For |
|------|------|-----|----------------------|----------|
| `Standard_B2s` | 2 | 4 GB | ~$30 USD | Light usage, testing |
| `Standard_B2ms` | 2 | 8 GB | ~$60 USD | **Recommended** — comfortable for compilations |
| `Standard_DS2_v2` | 2 | 7 GB | ~$85 USD | Better CPU, sustained workloads |
| `Standard_D4s_v3` | 4 | 16 GB | ~$140 USD | Heavy concurrent usage |

> Costs are approximate Pay-as-you-go rates. Use [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) for exact estimates.

---

## Post-Deployment

### 1. Verify Piston is Running

```bash
curl http://<PUBLIC_IP>:2000/api/v2/runtimes
```

You should see a JSON array of installed runtimes (python, javascript, cpp, java).

### 2. Test Code Execution

```bash
curl -X POST http://<PUBLIC_IP>:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "version": "*",
    "files": [{"content": "print(\"Hello from Azure Piston!\")"}]
  }'
```

### 3. Connect Your DigiMine App

Update your app’s environment variable to point to the Piston VM:

```env
PISTON_API_URL=http://<PUBLIC_IP>:2000
```

If your web app is also on Azure (e.g., App Service), use the **private IP** or place both in the same VNet for internal communication.

---

## Managing the VM

### SSH Access

```bash
ssh azureuser@<PUBLIC_IP>
```

### View Piston Logs

```bash
ssh azureuser@<PUBLIC_IP> "sudo docker logs -f piston"
```

### Restart Piston

```bash
ssh azureuser@<PUBLIC_IP> "sudo docker restart piston"
```

### Update Piston (Rebuild Image)

If you change `docker/piston/` files locally:

```bash
# 1. Re-copy files
scp -r docker/piston/* azureuser@<PUBLIC_IP>:~/piston/

# 2. Rebuild and restart
ssh azureuser@<PUBLIC_IP> << 'EOF'
  cd ~/piston
  sudo docker stop piston && sudo docker rm piston
  sudo docker build -t digimine-piston -f Dockerfile .
  sudo docker run -d --name piston --privileged --restart unless-stopped -p 2000:2000 digimine-piston
EOF
```

If your VM uses password-based SSH and `sudo` fails with `a terminal is required to read the password`, run the update script again after pulling the latest repo changes. The script allocates a TTY for the remote rebuild so `sudo` can prompt normally.

### Stop / Start / Delete VM

```bash
# Stop (keeps disk, no compute charges)
az vm stop --resource-group digimine-piston-rg --name digimine-piston-vm

# Start
az vm start --resource-group digimine-piston-rg --name digimine-piston-vm

# Delete everything
az group delete --name digimine-piston-rg --yes
```

---

## Security Considerations

1. **Network Security Group (NSG)** — Port 2000 is open to the internet by default. For production:
   - Restrict it to your web app’s IP range or VNet.
   - Use Azure Front Door or Application Gateway as a reverse proxy with HTTPS.

2. **No HTTPS by default** — The script exposes HTTP on port 2000. For production:
   - Put an Azure Load Balancer or Nginx reverse proxy with TLS in front.
   - Or access Piston only via private networking (same VNet).

3. **Piston runs privileged containers** — This is required for the sandbox but carries security risks. Isolate this VM in its own resource group/VNet.

4. **SSH Keys** — The script generates SSH keys at `~/.ssh/id_rsa` (or `id_ed25519`). Keep them secure.

---

## Troubleshooting

### "Piston did not become healthy in time"

SSH to the VM and check logs:

```bash
ssh azureuser@<PUBLIC_IP>
sudo docker logs piston
```

Common causes:
- **OOM during build** — Upgrade VM size (B2s may struggle; use B2ms+).
- **Package install failed** — Network issues during `install-packages.sh`. Retry by restarting the container.
- **`ENOTDIR: scandir '/piston/packages/.installed'`** — Remove the old marker file and rebuild with the latest Dockerfile:
  ```bash
  ssh azureuser@<PUBLIC_IP>
  sudo docker rm -f piston
  cd ~/piston
  sudo docker build -t digimine-piston -f Dockerfile .
  sudo docker run -d --name piston --privileged --restart unless-stopped -p 2000:2000 digimine-piston
  ```
  If you mounted a persistent `/piston` volume, remove the old marker from that volume too:
  ```bash
  sudo docker run --rm -v piston-data:/piston alpine sh -c 'rm -f /piston/packages/.installed'
  ```
- **`docker-entrypoint.sh: echo: write error: Device or resource busy`** — Rebuild with the latest Dockerfile. Older wrappers started Piston's entrypoint as a background process, but its cgroup setup must run as PID 1:
  ```bash
  ssh azureuser@<PUBLIC_IP>
  sudo docker rm -f piston
  cd ~/piston
  sudo docker build -t digimine-piston -f Dockerfile .
  sudo docker run -d --name piston --privileged --restart unless-stopped -p 2000:2000 digimine-piston
  sudo docker logs -f piston
  ```

### "curl: connection refused"

- The setup script may still be running. Wait 5 more minutes.
- Verify the container is running: `sudo docker ps`
- Check if Piston API is listening inside the container: `sudo docker exec piston curl -sf http://localhost:2000/api/v2/runtimes`

### High Memory Usage / OOM

Piston + compiling C++ or Java can use significant RAM. If the VM runs out of memory:
- Upgrade to a larger VM size (`Standard_B2ms` or `Standard_D4s_v3`).
- Add swap space:
  ```bash
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  ```

---

## Architecture Diagram

```
┌─────────────────┐         HTTP (port 2000)         ┌─────────────────────┐
│   DigiMine App  │  ───────────────────────────────► │  Azure VM (Ubuntu)  │
│  (Your Next.js) │                                   │  ┌───────────────┐  │
│                 │                                   │  │   Piston      │  │
└─────────────────┘                                   │  │   (Docker)    │  │
                                                      │  │  --privileged │  │
                                                      │  └───────────────┘  │
                                                      └─────────────────────┘
```

---

## Related Files

| File | Purpose |
|------|---------|
| `scripts/deploy-piston-azure.sh` | One-click deployment script |
| `docker/piston/Dockerfile` | Pre-built Piston image with languages |
| `docker/piston/install-packages.sh` | Installs Python, JS, C++, Java runtimes |
| `docker/piston/docker-compose.yml` | Local development compose file |
