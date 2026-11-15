# GameConsole

Plataforma de videojuegos orientada a objetos con inteligencia artificial en Prolog, integrada con la plataforma **GameStats** (Go + Scala) para ingestión concurrente, validación de esquemas y análisis estadístico funcional.

---

## 1. Arquitectura General

```
Navegador (Consola Web SPA Vanilla TS / Panel)
        │  HTTPS (:443) / WSS
        ▼
   [ Caddy Reverse Proxy ]
        │  HTTP / WS
        ▼
   [ console-web ] (Nginx: SPA History API + Enrutamiento)
        │  Proxy interno
        ▼
   [ console-server ] (TypeScript POO: Fastify, WebSockets)
        ├───► [ prolog-ai ] (SWI-Prolog HTTP :5000: Minimax con Poda Alfa-Beta)
        │
        └───► [ EventPublisher ] (Colas por partida, lotes, pool de workers)
                 │  POST /v1/events
                 ▼
              GameStats (Go Ingestión :8080 ──► Scala Analítica :8081)
```

Para más detalles sobre el modelo de concurrencia, aislamiento de partidas y el algoritmo de poda alfa-beta, consulta la [Guía de Arquitectura](docs/architecture.md).

---

## 2. Estructura del Repositorio y Documentación

- **`console-server/`**: Servidor de videojuegos orientado a objetos en TypeScript (Node 20, Fastify, WebSocket).
- **`console-web/`**: Aplicación web frontend (Vanilla TypeScript, Vite, CSS moderno) con selector de juegos, pestañas múltiples y panel de analítica.
- **`prolog-ai/`**: Motor de razonamiento lógico e inteligencia artificial en SWI-Prolog con servidor HTTP integrado.
- **`deploy/`**: Archivos de infraestructura para producción (`Caddyfile`, `deploy.sh`).
- **`scripts/`**: Scripts de automatización y verificación (`smoke-test.mjs`, `load-test.mjs`, `verify-gamestats-contract.ts`).
- **`docs/`**: Documentación técnica detallada:
  - [Guía de Arquitectura](docs/architecture.md): Diagrama de componentes, envío concurrente y diseño de la IA.
  - [Guía de Despliegue](docs/deployment.md): Despliegue en VPS, Caddy HTTPS, variables y rollback.
  - [Especificación de Eventos](docs/event-spec-console.md): Contrato estricto de eventos con GameStats.
  - [Documentación de Juegos](docs/games.md): Reglas, estados y diseño POO de Cuatro en Línea, Snake y Memoria.
  - [Motor Prolog AI](docs/prolog-ai.md): Algoritmo Minimax, heurística posicional y poda alfa-beta.
  - [Estadísticas y Panel](docs/statistics.md): Integración con los endpoints funcionales de Scala.
  - [Documento de Traspaso](docs/handoff.md): Resumen de fases iniciales y guía de extensibilidad.
  - [Registro de Decisiones (ADR)](docs/decisions.md): Decisiones arquitectónicas registradas (ADR-001 a ADR-014).

---

## 3. Requisitos Previos

- **Node.js** >= 20 y **npm** >= 10
- **Docker** y **Docker Compose** v2 (para orquestación local o en servidor)
- **SWI-Prolog** >= 9 (opcional, solo para ejecutar Prolog directamente sin Docker)

---

## 4. Variables de Entorno

Configurables a través de un archivo `.env` en la raíz (generado a partir de `.env.example`):

| Variable | Descripción | Valor por Defecto |
|---|---|---|
| `PORT` | Puerto público expuesto por la consola web | `3000` |
| `HOST` | Interfaz de escucha del servidor | `0.0.0.0` |
| `GAMESTATS_URL` | URL de ingestión de eventos (Go) | `http://gamestats-go:8080` |
| `ANALYTICS_URL` | URL del servicio de analítica (Scala) | `http://gamestats-scala:8081` |
| `PROLOG_URL` | URL del servicio de IA en Prolog | `http://prolog-ai:5000` |
| `PUBLISHER_WORKERS` | Número de workers concurrentes en el pool de envío | `4` |
| `OUTBOX_PATH` | Ruta del archivo de persistencia en disco del outbox | `/data/outbox.ndjson` |
| `GAMESTATS_GO_IMAGE` | Imagen de Go en GitHub Container Registry (GHCR) | `ghcr.io/fabian-1719/gamestats-go-ingestion:latest` |
| `GAMESTATS_SCALA_IMAGE`| Imagen de Scala en GHCR | `ghcr.io/fabian-1719/gamestats-scala-analytics:latest` |
| `CONSOLE_IMAGE` | Imagen del backend en GHCR | `ghcr.io/fabian-1719/gameconsole-server:latest` |
| `CONSOLE_WEB_IMAGE` | Imagen del frontend en GHCR | `ghcr.io/fabian-1719/gameconsole-web:latest` |
| `PROLOG_IMAGE` | Imagen de Prolog en GHCR | `ghcr.io/fabian-1719/gameconsole-prolog:latest` |

---

## 5. Ejecución con Docker Compose (Recomendado)

Desde un clon limpio del repositorio, puedes levantar la plataforma completa con un único comando:

```bash
# 1. Crear el archivo .env con valores de ejemplo
cp .env.example .env

# 2. Levantar todos los servicios en segundo plano
docker compose up -d --build

# 3. Comprobar que todos los servicios queden en estado HEALTHY
docker compose ps
```

### Servicios Disponibles:
- **Consola Web y Panel:** [http://localhost:3000](http://localhost:3000)
- **GameStats Ingestión (Go):** [http://localhost:8080/health](http://localhost:8080/health)
- **GameStats Analítica (Scala):** [http://localhost:8081/health](http://localhost:8081/health)
- **Motor Prolog AI:** `http://localhost:5000/health` (red interna)

### Reinicio con Persistencia:
Para reiniciar el servidor conservando el outbox y los datos acumulados:
```bash
docker compose restart console-server
```

Para detener la infraestructura:
```bash
docker compose down
```

---

## 6. Ejecución Local en Modo Desarrollo

Si deseas desarrollar o probar componentes de forma individual:

### 1. Iniciar el Servicio Prolog AI
```bash
cd prolog-ai
swipl -s server.pl -g server
# Escuchando en http://localhost:5000
```

### 2. Iniciar el Backend (Console Server)
```bash
cd console-server
npm install
npm run dev
# Escuchando en http://localhost:3000
```

### 3. Iniciar el Frontend (Console Web)
```bash
cd console-web
npm install
npm run dev
# Servidor de desarrollo Vite en http://localhost:5173 con proxy a :3000
```

---

## 7. Ejecución de Pruebas

### Pruebas de Console Server (TypeScript / Vitest)
```bash
cd console-server
npm run lint
npm test
npm run build
```

### Pruebas de Console Web (TypeScript / Vitest)
```bash
cd console-web
npm run lint
npm test
npm run build
```

### Pruebas del Motor Prolog AI (plunit)
```bash
cd prolog-ai
swipl -g "run_tests,halt" -s tests/connect4_tests.pl
```

### Smoke Test de Integración
Con la plataforma en ejecución (local o Docker Compose):
```bash
node scripts/smoke-test.mjs
```

---

## 8. Despliegue en Producción

El proyecto incluye configuración lista para despliegue automático vía GitHub Actions en un servidor VPS con Caddy (HTTPS automático con Let's Encrypt y WebSockets):
- Configuración de producción: `docker-compose.prod.yml`
- Proxy inverso: `deploy/Caddyfile`
- Script de actualización y rollback: `deploy/deploy.sh`

Consulta la [Guía de Despliegue](docs/deployment.md) para conocer los secretos de GitHub requeridos y el procedimiento de puesta en marcha.
