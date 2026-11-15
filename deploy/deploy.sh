#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_PATH:-$(pwd)}"
cd "$DEPLOY_DIR"

echo "=== INICIANDO DESPLIEGUE DE GAMECONSOLE ==="
echo "Directorio de trabajo: $DEPLOY_DIR"
date

# 1. Verificar existencia de .env
if [ ! -f .env ]; then
  echo "ERROR: No se encontró el archivo .env en $DEPLOY_DIR. Créalo a partir de .env.example."
  exit 1
fi

# 2. Guardar estado actual para rollback en caso de fallo
PREV_CONTAINERS=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q || true)

# 3. Descargar últimas imágenes publicadas
echo "[1/4] Descargando últimas imágenes de GHCR..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

# 4. Levantar servicios con overrides de producción
echo "[2/4] Desplegando servicios con Docker Compose..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans

# 5. Esperar a que los servicios alcancen el estado HEALTHY
echo "[3/4] Esperando a que todos los servicios alcancen estado HEALTHY..."
MAX_ATTEMPTS=40
HEALTHY=false

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  UNHEALTHY=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps --format json | jq -r 'select(.Health != "" and .Health != "healthy") | .Name' || true)
  if [ -z "$UNHEALTHY" ]; then
    echo "-> Todos los servicios se encuentran en estado HEALTHY:"
    docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
    HEALTHY=true
    break
  fi
  echo "Aún esperando ($i/$MAX_ATTEMPTS): $UNHEALTHY"
  sleep 3
done

if [ "$HEALTHY" != "true" ]; then
  echo "ERROR: Uno o más servicios no superaron el healthcheck."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100
  
  echo "Iniciando ROLLBACK a la versión previa..."
  docker compose -f docker-compose.yml -f docker-compose.prod.yml down
  if [ -n "$PREV_CONTAINERS" ]; then
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
  fi
  exit 1
fi

# 6. Chequeo de conectividad a /health
echo "[4/4] Verificando conectividad HTTP..."
DOMAIN="${DEPLOY_DOMAIN:-localhost}"
if curl -fsS -k "http://127.0.0.1/health" > /dev/null 2>&1 || curl -fsS "https://${DOMAIN}/health" > /dev/null 2>&1; then
  echo "-> Chequeo exitoso: /health respondió correctamente."
else
  echo "-> Verificando internamente en console-server..."
  docker compose exec -T console-server wget -qO- http://127.0.0.1:3000/health || exit 1
fi

echo "=== DESPLIEGUE FINALIZADO EXITOSAMENTE ==="
