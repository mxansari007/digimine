# Kokoro-82M TTS service — runs on the Azure VM alongside Piston.
FROM node:20-slim

# onnxruntime-node prebuilt binaries + HF model fetch need these.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

# transformers.js caches model weights under ./.cache (cwd-relative). Mount a
# volume here (see docker-compose.yml) so the ~80MB model survives restarts.
ENV PORT=2001
EXPOSE 2001

CMD ["node", "server.mjs"]
