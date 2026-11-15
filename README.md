# GameConsole

Plataforma de videojuegos orientada a objetos con inteligencia de juego en Prolog, integrada con la plataforma GameStats para ingestión concurrente y análisis estadístico funcional.

---

## Arquitectura

```
Navegador (connect4-test.html / Consola Web)
      │  WebSocket / REST
      ▼
console-server (TypeScript POO: Game, Match, Player)  ──HTTP──►  prolog-ai (SWI-Prolog: Minimax)
      │  EventPublisher (colas por partida, lotes, outbox)
      ▼  POST /v1/events
GameStats (Go Ingestion puerto 8080 ──► Scala Analytics puerto 8081)
```

## Estructura del repositorio

- **`console-server/`**: Servidor de videojuegos orientado a objetos desarrollado en TypeScript (Node 20, Fastify, WebSocket).
- **`console-web/`**: Aplicación web vanilla en TypeScript, servida en desarrollo por Vite y en producción por `console-server`.
- **`prolog-ai/`**: Servicio independiente de inteligencia artificial en SWI-Prolog (Minimax con poda alfa-beta para Cuatro en Línea).
- **`docs/`**: Documentación técnica:
  - `docs/handoff.md`: Documento de traspaso detallado y guía para agregar nuevos juegos.
  - `docs/event-spec-console.md`: Especificación técnica del contrato de eventos con GameStats.
  - `docs/deployment.md`: Guía de despliegue en producción con Caddy, Docker Compose y CI/CD.
  - `docs/decisions.md`: Registro de decisiones arquitectónicas (ADRs).

## Requisitos previos

- Node.js >= 20 y npm >= 10
- SWI-Prolog >= 9 (o Docker)
- Docker Compose v2 (para iniciar GameStats Go y Scala)

## Ejecución con Docker Compose

La plataforma completa (GameConsole Web + Backend + Prolog AI + GameStats Go + GameStats Scala) puede orquestarse con Docker Compose desde un clon limpio:

```bash
# 1. Configurar variables de entorno (usar valores de ejemplo)
cp .env.example .env

# 2. Construir e iniciar todos los servicios
docker compose up -d --build

# 3. Comprobar que todos los servicios queden en estado healthy
docker compose ps
```

Endpoints y servicios:
- **Consola Web y Panel:** [http://localhost:3000](http://localhost:3000)
- **GameStats Ingestión (Go):** [http://localhost:8080/health](http://localhost:8080/health)
- **GameStats Analítica (Scala):** [http://localhost:8081/health](http://localhost:8081/health)
- **Motor Prolog AI:** `http://localhost:5000/health` (interno)

Para reiniciar el servidor manteniendo el outbox persistente:
```bash
docker compose restart console-server
```

Para apagar la infraestructura:
```bash
docker compose down
```

---

## Ejecución local paso a paso

### 1. Iniciar GameStats (repo separado)
```powershell
Set-Location C:\GameStats
docker compose up --build -d scala-analytics go-ingestion
```
Go recibe eventos en `http://localhost:8080` y Scala ofrece análisis en `http://localhost:8081`.
Configura `GAMESTATS_URL=http://localhost:8080` y `ANALYTICS_URL=http://localhost:8081` en el entorno de GameConsole.

### 2. Iniciar el servicio Prolog AI
```bash
cd gameconsole/prolog-ai
swipl -q -s server.pl -g "server:server"
```
*O utilizando Docker:*
```bash
cd gameconsole/prolog-ai
docker build -t prolog-ai .
docker run -p 5000:5000 prolog-ai
```
*El servicio escuchará en `http://localhost:5000`.*

### 3. Iniciar GameConsole Server
```bash
cd gameconsole/console-server
npm install
npm run dev
```
*El servidor escuchará en `http://localhost:3000`.*

### 4. Jugar Cuatro en Línea
Abre tu navegador web en:
```
http://localhost:3000/
```
También puedes correr la interfaz en modo desarrollo con el proxy a `console-server`:
```bash
cd gameconsole/console-web
npm install
npm run dev
# http://localhost:5173
```
Para producción, ejecuta `npm run build` en `console-web`; `console-server` servirá
`console-web/dist` en `/`. La página de prueba anterior se conserva en `/connect4`.

El panel `/panel` separa las partidas creadas desde la pestaña actual del historial anterior y muestra hasta 20 resultados guardados en el almacenamiento local de ese navegador. Ese historial no se sincroniza entre navegadores ni perfiles; borrarlo desde el panel solo quita la lista local, no los análisis en GameStats. La consulta recorre GameConsole → API de Scala; Go valida e ingiere los eventos y envía cada partida finalizada a Scala para analizarla. La analítica de GameStats actualmente vive en memoria, por lo que reiniciar esos servicios borra los análisis.

Con ambos servicios de GameStats activos, verifica el recorrido completo desde `console-server`:
```powershell
npx tsx ..\scripts\verify-gamestats-contract.ts
```
El script envía eventos válidos de los tres juegos, comprueba los contadores de rechazo de Go y valida las métricas que devuelve Scala.

---

## Ejecución de Pruebas

### Pruebas de Console Server (TypeScript / Vitest)
```bash
cd gameconsole/console-server
npm test
```
*Ejecuta pruebas automáticas de reglas, colas/outbox, conformidad del publicador, API REST, juegos y E2E contra Prolog.*

### Pruebas de Console Web (TypeScript / Vitest)
```bash
cd gameconsole/console-web
npm test
npm run build
```

### Pruebas de Prolog AI (plunit)
```bash
cd gameconsole/prolog-ai
swipl -g "run_tests,halt" -s tests/connect4_tests.pl
```
*Valida toma de victoria inmediata, bloqueo de rival, columnas llenas y aumento de nodos explorados por profundidad.*
