# Stage 1: Build TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache wget

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    OUTBOX_PATH=/data/outbox.ndjson

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY public/ ./public/

# Crear carpeta para outbox persistente y dar permisos a usuario node
RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["node", "dist/index.js"]
