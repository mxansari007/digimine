# Self-Hosted Piston (Free Code Execution)

This directory contains everything needed to self-host [Piston](https://github.com/engineer-man/piston), the code execution engine used by DigiMine for running student code.

## Why Self-Host?

The public Piston API (`emkc.org`) is now whitelist-only. Self-hosting gives you unlimited, free code execution for your test platform.

## Supported Languages

- **Python** 3.x
- **JavaScript** (Node.js)
- **C++** (GCC)
- **Java** (OpenJDK)

## Quick Start (Local)

### Option 1: Pre-built Image (Recommended)

This builds a Docker image with all language packages already installed:

```bash
cd docker/piston
docker build -t digimine-piston .
docker run --privileged -p 2000:2000 digimine-piston
```

Test it:
```bash
curl -X POST http://localhost:2000/api/v2/execute \
  -H "Content-Type: application/json" \
  -d '{
    "language": "python",
    "version": "*",
    "files": [{"content": "print(6)"}]
  }'
```

### Option 2: Docker Compose

```bash
cd docker/piston
docker-compose up --build
```

## Free Cloud Deployment

### Recommended: Oracle Cloud Free Tier (Always Free)

Oracle Cloud offers genuinely free ARM-based VMs forever:
- **4 ARM cores + 24 GB RAM** (Always Free)
- Supports Docker with `--privileged` mode

**Steps:**
1. Sign up at [cloud.oracle.com](https://cloud.oracle.com)
2. Create an Ubuntu 22.04 ARM instance (VM.Standard.A1.Flex)
3. Install Docker: `sudo apt update && sudo apt install docker.io docker-compose`
4. Clone your repo, `cd docker/piston`, and run:
   ```bash
   sudo docker build -t digimine-piston .
   sudo docker run -d --privileged --name piston -p 2000:2000 digimine-piston
   ```
5. Open port 2000 in the security list
6. Copy the instance's public IP — this is your `CODE_EXECUTION_URL`

### Alternative: Cheap VPS (~$5/month)

If you need something simpler, Hetzner CX11 (€3.79/month) or DigitalOcean Droplet ($4/month) work great. Any VPS with Docker support will run Piston.

### Not Recommended: Render / Railway / Fly.io Free Tiers

These platforms **do not support `--privileged` Docker containers** on their free tiers. Piston requires privileged mode for sandboxing (cgroups, namespaces). Without it, Piston either won't work or will run without security isolation.

## Connecting DigiMine to Your Piston Instance

Add this to your `apps/web/.env` file:

```env
CODE_EXECUTION_URL=http://localhost:2000/api/v2/execute
```

For production (Oracle Cloud / VPS):
```env
CODE_EXECUTION_URL=https://your-piston-instance.com/api/v2/execute
```

If no `CODE_EXECUTION_URL` is set, the app falls back to Judge0 CE (free public demo).

## Troubleshooting

**"Packages not installed" error:**
The pre-built Dockerfile installs packages during the build. If a package fails, check the build logs. You can also install manually:
```bash
docker exec -it <container> sh -c "curl -X POST http://localhost:2000/api/v2/packages -H 'Content-Type: application/json' -d '{\"language\":\"python\",\"version\":\"*\"}'"
```

**Container exits immediately:**
Piston needs `--privileged` flag. Without it, the isolate sandbox cannot initialize.

**High memory usage:**
Each language runtime uses RAM. The pre-built image with 4 languages uses roughly 2-3GB when idle. Oracle Cloud's 24GB free tier handles this easily.
