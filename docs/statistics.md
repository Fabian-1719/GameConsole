# GameConsole — Estadísticas, patrones y panel

**Regla principal:** la consola **no calcula ninguna estadística**. Todo número que aparece en el panel lo calcula GameStats (Scala). La consola solo lo pide y le da formato.

## 1. Recorrido de un dato

```
Juego en el navegador
   │ WebSocket
   ▼
console-server ── eventos ──►  Go (8080)  ── lote de la partida ──►  Scala (8081)
   ▲                         valida contra       al recibir           analiza, detecta
   │                         el catálogo         MATCH_FINISHED        patrones y guarda
   │                                             (o tras 30 s sin
   │                                              actividad)
   │  GET /api/stats/*  (proxy, sin cálculo)                              │
   └──────────────────────────────────────────── GET /v1/... ◄──────────┘
Panel (/panel): pregunta cada 2 s
```

- **Cuándo se actualiza:** Go entrega la partida a Scala cuando llega su `MATCH_FINISHED`. Por eso cada partida aparece en el panel **al terminar**, sin esperar a que terminen todas.
- **Por qué hay proxy:** el navegador le pregunta al propio `console-server` (`/api/stats/...`) y este reenvía la pregunta a Scala tal cual. Así se evitan problemas de CORS, y queda claro que la consola no toca los números.
- **Dónde viven los datos:** Scala guarda los análisis **en memoria**. Todos los navegadores ven los mismos números, pero si Scala se reinicia, las estadísticas vuelven a cero. La lista "Sesión actual / Sesiones anteriores" del panel es lo único que se guarda en el navegador (localStorage).

## 2. Estadísticas por juego

Código: `GameStats/scala-analytics/src/main/scala/gamestats/` (`Analyzers.scala`, `AnalysisService.scala`, `Patterns.scala`).

| Tipo | Cuatro en Línea | Snake | Memoria |
|---|---|---|---|
| **Por jugador** (`/v1/stats/players/{id}`) | Victorias, derrotas, empates y **% de victorias** (`winRate` = victorias ÷ partidas) | **Puntaje máximo** (`bestScore`) y **promedio** (`avgScore`), comidas por minuto promedio | **Mejor número de intentos** (`bestAttempts`: el menor entre las partidas ganadas) |
| **Por partida** (`/v1/matches/{id}`) | Duración, número de jugadas, resultado, nodos y tiempo medio de la IA, nivel (`aiLevel`) | Puntaje, largo final, comidas, causa de muerte, duración | Intentos, pares, cartas volteadas, precisión, duración |
| **Combinada** (varios eventos juntos) | **Nivel de la IA contra resultado** y tiempo medio de decisión (`AI_DECISION` + `MOVE` + `MATCH_FINISHED`) | **Comidas por minuto** = `FOOD_EATEN` ÷ minutos jugados | **Precisión** = `PAIR_MATCHED` ÷ (`PAIR_MATCHED` + `PAIR_MISSED`) |

**Ejemplos calculados a mano** (están en las pruebas de Scala):
- 6 comidas en 2 minutos → 3 comidas por minuto.
- 6 aciertos y 2 fallos → 6 ÷ 8 = 75 % de precisión.
- Decisiones de la IA de 10, 20 y 30 ms → 20 ms de promedio.

En Cuatro en Línea, `result` se lee desde el punto de vista del humano: `WIN` = ganó el humano, `LOSS` = ganó la IA.

## 3. Patrones de secuencia

Un patrón es una regla que revisa el orden de los eventos de una partida y marca algo especial. Se consultan en `GET /v1/patterns`.

| Patrón | Juego | Regla |
|---|---|---|
| `LIGHTNING_WIN` (victoria relámpago) | Cuatro en Línea | El ganador necesitó **10 jugadas propias o menos**. |
| `FOOD_STREAK` (racha) | Snake | **5 comidas en menos de 15 segundos**. Una ventana de 15 s recorre la partida y se reporta una vez, con el mejor tramo. |
| `PERFECT_MEMORY` (memoria perfecta) | Memoria | Ganó **sin ningún `PAIR_MISSED`**. Las partidas abandonadas no cuentan. |

## 4. Endpoints que usa el panel

| Panel (console-server) | Scala | Qué devuelve |
|---|---|---|
| `GET /api/stats/general` | `GET /v1/stats/general` | `totalMatches`, `completedMatches`, `abandonedMatches`, `matchesByGame` (todos los juegos, aunque tengan 0), `players` y `events` |
| `GET /api/stats/games/{gameId}` | `GET /v1/games/{gameId}/stats` | `instances` (instancias ejecutadas), `wins`, `losses`, `draws`, `abandoned`, `avgDurationMs`, `players`, `patterns` (conteo por tipo) y `metrics` (las métricas propias del juego). Si el juego no existe, responde 404. |

`metrics` según el juego:
- **connect-four:** `avgMoves`, `avgAiTimeMs`, `totalNodes` y `byLevel` (por nivel: partidas, `humanWins`, `aiWins`, `draws` y `avgAiTimeMs`).
- **snake-arena:** `bestScore`, `avgScore`, `avgLength`, `totalFoodEaten` y `avgFoodPerMinute`.
- **memory-match:** `avgAccuracy`, `avgAttempts`, `bestAttempts` y `totalPairs`.

## 5. El panel (`/panel`)

- **Generales:** totales de todos los juegos y partidas por juego.
- **Por juego:** una tarjeta por juego con sus instancias ejecutadas, resultados, duración promedio, patrones y métricas. Cuatro en Línea agrega la tabla "Nivel de la IA contra resultado".
- Pregunta cada **2 segundos** (polling). Si GameStats no responde, muestra un aviso y reintenta.
- `console-web/src/panel/StatsRender.ts` **solo da formato**: segundos, porcentaje, o "—" cuando falta el dato. No suma, no promedia y no cuenta.

## 6. Cómo comprobarlo

```bash
cd GameStats/scala-analytics && sbt test        # pruebas con valores calculados a mano
```
Con todo levantado, jugar una partida y abrir `http://localhost:3000/panel`. Los números cambian al terminar la partida. También se puede consultar Scala directamente en `http://localhost:8081/v1/stats/general`.
