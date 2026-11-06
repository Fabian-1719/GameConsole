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
- **`prolog-ai/`**: Servicio independiente de inteligencia artificial en SWI-Prolog (Minimax con poda alfa-beta para Cuatro en Línea).
- **`docs/`**: Documentación técnica:
  - `docs/handoff.md`: Documento de traspaso detallado y guía para agregar nuevos juegos.
  - `docs/event-spec-console.md`: Especificación técnica del contrato de eventos con GameStats.
  - `docs/decisions.md`: Registro de decisiones arquitectónicas (ADRs).

## Requisitos previos

- Node.js >= 20 y npm >= 10
- SWI-Prolog >= 9 (o Docker)
- Go >= 1.22 (para correr el módulo de ingestión de GameStats)

---

## Ejecución local paso a paso

### 1. Iniciar GameStats (Go)
```bash
cd gamestats/go-ingestion
go run ./cmd/ingestion
```
*El servicio escuchará en `http://localhost:8080`.*

### 2. Iniciar el servicio Prolog AI
```bash
cd gameconsole/prolog-ai
swipl -s server.pl
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
http://localhost:3000/connect4
```

---

## Ejecución de Pruebas

### Pruebas de Console Server (TypeScript / Vitest)
```bash
cd gameconsole/console-server
npm test
```
*Ejecuta 26 pruebas automáticas cubriendo reglas del tablero, colas concurrentes de eventos, outbox, API REST y prueba de integración E2E contra Prolog.*

### Pruebas de Prolog AI (plunit)
```bash
cd gameconsole/prolog-ai
swipl -g "run_tests,halt" -s tests/connect4_tests.pl
```
*Valida toma de victoria inmediata, bloqueo de rival, columnas llenas y aumento de nodos explorados por profundidad.*
