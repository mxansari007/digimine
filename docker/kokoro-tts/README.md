# Kokoro TTS service (Azure VM, alongside Piston)

Runs **Kokoro-82M** text-to-speech as a small HTTP service on the same Azure VM
that hosts Piston (`maazopenclaw.centralindia.cloudapp.azure.com`). The digimine
web app's `/api/ai-interview/tts` route proxies to it, so the browser only ever
talks to our own origin — no `esm.sh` / Hugging Face requests (which Brave
Shields and campus networks block), and no slow in-browser WASM.

```
Browser ──▶ web app  /api/ai-interview/tts  (auth + premium gate)
                     └──▶ Azure VM :2001 /tts  (Kokoro on onnxruntime-node) ──▶ WAV
```

## Endpoints
- `GET /health` → `{ ok, ready }`
- `POST /tts` → `audio/wav`; body `{ "text": "...", "voice": "af_heart" }`; header `x-tts-secret: <secret>`

## Deploy on the Azure VM

SSH into the VM (same one running Piston), then:

```bash
# 1. Get the code (or scp this docker/kokoro-tts folder up)
git clone https://github.com/mxansari007/digimine.git   # or pull latest
cd digimine/docker/kokoro-tts

# 2. Pick a strong shared secret (must match the web app's KOKORO_TTS_SECRET)
export KOKORO_TTS_SECRET="$(openssl rand -hex 24)"
echo "KOKORO_TTS_SECRET=$KOKORO_TTS_SECRET"   # copy this into the web app env

# 3. Build + run (downloads the ~80MB model on first boot, then caches it
#    in the kokoro-cache volume so restarts are instant)
docker compose up -d --build

# 4. Watch it warm up (first start takes a few minutes to fetch the model)
docker compose logs -f kokoro-tts        # wait for "model warm + ready"
curl -s http://localhost:2001/health     # {"ok":true,"ready":true}
```

## Expose it to the web app

Two options:

**A. Reverse proxy (recommended — reuse the existing nginx/TLS in front of Piston).**
Add a location that forwards `/tts` to `127.0.0.1:2001`, e.g.:
```nginx
location /tts { proxy_pass http://127.0.0.1:2001/tts; proxy_read_timeout 120s; }
```
Then set on the web app:
```
KOKORO_TTS_URL=https://maazopenclaw.centralindia.cloudapp.azure.com/tts
KOKORO_TTS_SECRET=<the secret from step 2>
```

**B. Open port 2001 directly.** Add an inbound NSG rule for TCP 2001, and set:
```
KOKORO_TTS_URL=https://maazopenclaw.centralindia.cloudapp.azure.com:2001/tts
```
(Prefer A so it's behind your existing TLS.)

## Notes
- **CPU only** — Kokoro-82M generates ~a sentence in ~2s on a Standard_B2s; bump
  the VM size if you expect heavy concurrency.
- **Model cache** persists in the `kokoro-cache` Docker volume; deleting it
  forces a re-download on next start.
- **Security** — always set `KOKORO_TTS_SECRET` so only the web app can call
  `/tts`. The service rejects requests without the matching `x-tts-secret`.
- **Voices** — default `af_heart` (US English). Other Kokoro voices (e.g.
  `af_bella`, `am_michael`) can be passed as `voice`.
