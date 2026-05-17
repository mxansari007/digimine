# Deploy DigiMine on Railway (Free Tier)

This guide deploys the entire DigiMine web app to Railway's free tier, including the **direct code execution** engine that compiles and runs student code using `python3`, `gcc`, `g++`, `node`, and `javac` — no external Piston or Judge0 service needed.

## How It Works

Instead of calling an external API (Piston/Judge0), the app **directly spawns child processes** on the Railway server to compile and run code. This works because Railway's build environment includes the language compilers we specify.

## Prerequisites

- [Railway](https://railway.app) account (free tier)
- Your code pushed to GitHub

## Deployment Steps

### 1. Push to GitHub

Make sure your repo includes these files (already created):
- `railway.json` — Railway service config
- `nixpacks.toml` — Installs `python3`, `gcc`, `g++`, `default-jdk` during build

### 2. Create Project on Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your `digimine` repository
3. Railway will auto-detect `nixpacks.toml` and install the required packages

### 3. Set Environment Variables

In your Railway project → **Variables**, add:

```env
# Firebase (same as your local .env)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...

# App URL (Railway will give you a domain)
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app

# Code Execution — use DIRECT mode (runs on Railway server itself)
CODE_EXECUTION_PROVIDER=direct

# Payment gateway (if using)
INSTAMOJO_CLIENT_ID=...
INSTAMOJO_CLIENT_SECRET=...
INSTAMOJO_ENV=test
```

### 4. Deploy

Railway will automatically build and deploy. The build takes ~3-5 minutes because it installs the C++ and Java compilers.

### 5. Verify Code Execution

After deployment, create a code question in the admin panel and try running code in the test attempt page. It should work immediately.

## Free Tier Limits

- **500 execution hours/month** (~20 days continuous)
- **512MB RAM** per service (sufficient for the web app + code execution)
- **1GB disk** (sufficient)

If you need more uptime, Railway's paid tier starts at $5/month.

## Troubleshooting

**"gcc not found" or "javac not found" errors:**
Make sure `nixpacks.toml` is at the repo root and contains the `aptPkgs` list. You can verify by checking Railway build logs.

**Code times out:**
The direct executor has a 10-second timeout. For longer-running code, increase `EXEC_TIMEOUT_MS` in `apps/web/src/lib/code-executor/direct.ts`.

**Build fails with memory error:**
Railway's free tier has 512MB RAM. The build might OOM if running `next build` while compiling. The `NODE_OPTIONS="--max-old-space-size=4096"` in `nixpacks.toml` helps, but if it still fails, consider upgrading to Railway's paid tier (1GB+ RAM).
