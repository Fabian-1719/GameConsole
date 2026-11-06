# Documento de Traspaso Técnico — GameConsole (Fases 1 a 3)

**Responsable:** Fabián (Días 1 a 3)  
**Destinatario:** Quien continúa con la implementación (Snake, Memoria, interfaz web completa, Scala, CI/CD y despliegue).  
**Fecha:** Noviembre 2026  
**Estado:** Núcleo OOP, EventPublisher con Outbox, motor Prolog con Minimax y Cuatro en Línea completamente implementados y probados.

---

## 1. Resumen de lo construido

1. **Núcleo Orientado a Objetos Extensible (`console-server/src/core/`):**
   - `Game`: Abstracción base para registrar juegos con su identificador, metadatos y fábrica `createMatch()`.
   - `Match`: Abstracción base para gestionar el ciclo de vida de partidas concurrentes (`WAITING`, `RUNNING`, `FINISHED`), jugadores y eventos de dominio.
   - `Player`: Abstracción base con implementaciones `HumanPlayer` y `AiPlayer`.
   - `GameRegistry`: Registro desacoplado de juegos abiertos a extensión.
   - `MatchManager`: Administrador concurrente de partidas sin estado global compartido.

2. **Publicador Concurrente y Outbox (`console-server/src/events/`):**
   - `EventPublisher`: Colas independientes por partida, emisión en lotes (máximo 20 eventos o 200 ms), worker pool asíncrono (4 workers), reintentos con backoff exponencial y vaciado ordenado (`stop()`).
   - `Outbox`: Almacenamiento en disco (`outbox.ndjson`) ante caídas de GameStats y reenvío automático al iniciar y cada 30 segundos.

3. **Catálogo de Go Ampliado en GameStats:**
   - `go-ingestion/config/catalog.json` actualizado con los 3 juegos oficiales (`connect-four`, `snake-arena`, `memory-match`).

4. **Motor de Inteligencia Artificial en Prolog (`prolog-ai/`):**
   - `connect4.pl`: Tablero 6x7, verificación de 4 en línea, heurística posicional y Minimax con poda alfa-beta explorando desde el centro.
   - `server.pl`: Servicio HTTP (`GET /health`, `POST /decide`).
   - `Dockerfile`: Contenedor basado en `swipl:9.2.5` con healthcheck.

5. **Primer Juego Completo: Cuatro en Línea (`console-server/src/games/connect-four/`):**
   - `Board`: Tablero privado 6x7 con gravedad estricta y detección completa de victorias y empates.
   - `PrologAiPlayer`: Cliente HTTP con reintentos y sin respaldo aleatorio (regla no negociable).
   - `ConnectFourMatch`: Partida humana contra Prolog, turnos secuenciales, emisión de eventos `MOVE`, `AI_DECISION`, `PLAYER_WON`, `PLAYER_LOST` y `MATCH_FINISHED`.
   - `public/connect4-test.html`: Interfaz web mínima para jugar partidas interactivas vía WebSocket.

---

## 2. Cómo levantar el proyecto localmente

### 2.1 Requisitos previos
- Node.js >= 20 y npm >= 10
- SWI-Prolog >= 9 (o Docker)
- Go >= 1.22 (para correr GameStats)

### 2.2 Paso 1: Iniciar GameStats (Go)
```bash
cd gamestats/go-ingestion
go run ./cmd/ingestion
# Escuchando en http://localhost:8080
```

### 2.3 Paso 2: Iniciar el servicio Prolog AI
**Opción A: Con SWI-Prolog local**
```bash
cd gameconsole/prolog-ai
swipl -s server.pl
# Escuchando en http://localhost:5000
```

**Opción B: Con Docker**
```bash
cd gameconsole/prolog-ai
docker build -t prolog-ai .
docker run -p 5000:5000 --name prolog-ai prolog-ai
```

### 2.4 Paso 3: Iniciar el servidor GameConsole
```bash
cd gameconsole/console-server
npm install
npm run dev
# Escuchando en http://localhost:3000
```

### 2.5 Paso 4: Jugar Cuatro en Línea
Abre tu navegador en:
```
http://localhost:3000/connect4
```
Selecciona el nivel de dificultad (1 a 3), ingresa tu nombre y haz clic en "Nueva Partida".

---

## 3. Cómo correr las pruebas

### Pruebas de TypeScript (Console Server)
```bash
cd gameconsole/console-server
npm test
```
*Ejecuta 26 pruebas en 8 archivos suite:*
- `test/board.test.ts`: Caída por gravedad, columnas llenas, victorias en horizontal, vertical y diagonales.
- `test/events.test.ts`: Generación de 1000 UUIDs sin colisión y cumplimiento de campos del contrato.
- `test/core_oop.test.ts`: Registro de juegos, aislamiento de partidas y abandono ordenado.
- `test/connect_four_match.test.ts`: Flujo de turnos, jugadas inválidas y emisión de eventos.
- `test/publisher.test.ts`: Concurrencia de 20 partidas sin mezclar lotes, tolerancia a fallos con outbox.
- `test/contract_gamestats.test.ts`: Carga concurrente y conformidad de esquemas.
- `test/e2e_connect4_prolog.test.ts`: Prueba E2E real integrando TypeScript con el motor Prolog.

### Pruebas de Prolog (plunit)
```bash
cd gameconsole/prolog-ai
swipl -g "run_tests,halt" -s tests/connect4_tests.pl
```
*Valida toma de victoria inmediata, bloqueo del rival, columnas llenas y aumento de nodos explorados por profundidad.*

---

## 4. Guía para agregar un nuevo juego (Snake o Memoria)

El núcleo fue diseñado siguiendo el principio Abierto/Cerrado (Open/Closed): **no necesitas modificar el núcleo (`src/core/`) ni el servidor (`src/server.ts`)**.

### Paso 1: Crear la clase de Partida
Crea `console-server/src/games/<juego>/<Nombre>Match.ts` heredando de `Match`:
```typescript
import { Match, MatchOptions } from "../../core/Match.js";
import { EventFactory } from "../../events/EventFactory.js";

export class SnakeArenaMatch extends Match {
  constructor(options: MatchOptions = {}) {
    super("snake-arena", options);
    // Inicializar estado privado del juego (tablero, serpiente, comida, etc.)
  }

  public handleAction(playerId: string, action: unknown): void {
    // 1. Validar accion
    // 2. Modificar estado privado
    // 3. Emitir evento a GameStats:
    this.emitEvent(EventFactory.create({
      gameId: this.gameId,
      matchId: this.matchId,
      playerId,
      type: "FOOD_EATEN",
      data: { score: 10, length: 4 }
    }));
    // 4. Difundir estado a los clientes WebSocket:
    this.broadcastState();
  }

  public getPublicState(): unknown {
    return { /* estado serializable hacia el frontend */ };
  }
}
```

### Paso 2: Crear la clase de Definición de Juego
Crea `console-server/src/games/<juego>/<Nombre>Game.ts` heredando de `Game`:
```typescript
import { Game } from "../../core/Game.js";
import { MatchOptions } from "../../core/Match.js";
import { SnakeArenaMatch } from "./SnakeArenaMatch.js";

export class SnakeArenaGame extends Game {
  constructor() {
    super("snake-arena", "Snake Arena", "Juego clasico de la serpiente");
  }

  public createMatch(options?: MatchOptions): SnakeArenaMatch {
    return new SnakeArenaMatch(options);
  }
}
```

### Paso 3: Registrar el juego en el servidor
En `console-server/src/server.ts`, simplemente regístralo en el `GameRegistry`:
```typescript
registry.register(new SnakeArenaGame());
```
¡Listo! La API REST (`GET /api/games`, `POST /api/matches`) y los WebSockets (`/ws/matches/:matchId`) soportarán el nuevo juego automáticamente.

---

## 5. Contrato y catálogo de eventos

- **Documento técnico del contrato:** `docs/event-spec-console.md`
- **Tipos TypeScript:** `console-server/src/events/contract.ts`
- **Catálogo de Go en GameStats:** `gamestats/go-ingestion/config/catalog.json`

Los eventos requeridos para `snake-arena` y `memory-match` **ya están autorizados en el validador de Go**:
- `snake-arena`: `FOOD_EATEN{score, length}`, `PLAYER_DIED{cause, score}`, `MATCH_FINISHED{result, durationMs}`.
- `memory-match`: `CARD_FLIPPED{cardIndex}`, `PAIR_MATCHED{pairId, attempts}`, `PAIR_MISSED{attempts}`, `MATCH_FINISHED{result, durationMs}`.

---

## 6. Registro de decisiones arquitectónicas (ADR)

| ID | Decisión tomada | Motivo técnico |
|---|---|---|
| ADR-001 | Fastify + `@fastify/websocket` para el servidor web. | Mayor rendimiento, arquitectura basada en plugins y soporte nativo de WebSockets. |
| ADR-002 | Prefijos en identificadores (`e-UUID`, `m-UUID`, `p-UUID`). | Trazabilidad clara y compatibilidad con el validador estricto de GameStats. |
| ADR-003 | Abstracciones base `Game`, `Match`, `Player` con `GameRegistry`. | Desacoplamiento total: nuevos juegos se añaden sin tocar el núcleo. |
| ADR-004 | `EventEmitter` en `Match` para desacoplar eventos de dominio. | Separa la lógica de juego del transporte y publicación de eventos. |
| ADR-005 | Colas independientes por partida y lotes temporizados (20 ev / 200 ms). | Evita mezclar eventos entre partidas y optimiza tráfico HTTP hacia Go. |
| ADR-006 | Persistencia en `outbox.ndjson` con reintentos y reenvío cada 30 s. | Garantiza cero pérdida de eventos si GameStats se reinicia o cae. |
| ADR-007 | Ampliación de `catalog.json` en Go para los tres juegos. | Estandariza la validación en Go respetando retrocompatibilidad. |
| ADR-008 | Servicio HTTP Prolog independiente con Minimax y poda alfa-beta. | Explora jugadas desde el centro hacia los extremos para maximizar la poda. |
| ADR-009 | Tablero 6x7 privado con gravedad estricta y sin decisiones aleatorias. | Cumple la regla no negociable de IA obligatoria en Cuatro en Línea. |
| ADR-010 | Eliminación de `DummyGame` tras validar `ConnectFourGame`. | Deja el código de producción limpio y enfocado en los juegos reales. |

---

## 7. Pendientes para quien continúa (Días 4 en adelante)

1. **Implementar Snake (`snake-arena`):**
   - Lógica de movimiento en cuadrícula, colisiones con pared o cuerpo propio, crecimiento al comer y temporizador de ticks.
2. **Implementar Memoria (`memory-match`):**
   - Barajado de cartas, control de volteo por pares, contador de intentos y verificación de coincidencias.
3. **Consola Web Completa:**
   - Interfaz con selector de juegos, pestañas múltiples para jugar partidas simultáneas y panel de estadísticas conectado a GameStats.
4. **Módulo de Análisis en Scala:**
   - Crear los analizadores (`GameAnalyzer`) para `connect-four`, `snake-arena` y `memory-match`.
   - Calcular estadísticas funcionales y detectar patrones de secuencia en Scala.
5. **Orquestación y Despliegue:**
   - `docker-compose.yml` integrando `console-server`, `prolog-ai`, `go-ingestion` y `scala-analytics`.
   - Pipeline de CI/CD en GitHub Actions y deployment final.
