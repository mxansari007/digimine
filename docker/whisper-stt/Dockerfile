# Whisper STT service — runs on the Azure VM alongside Piston + Kokoro.
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

ENV PORT=2002
EXPOSE 2002

CMD ["node", "server.mjs"]
