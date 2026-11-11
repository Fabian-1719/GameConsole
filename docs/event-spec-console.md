# GameConsole — Especificación de eventos y contrato con GameStats

Estado: **Contrato integrado y cubierto por pruebas con el catálogo real de Go**

Este documento define el formato estándar de eventos emitidos por `console-server` hacia la plataforma `GameStats` (Go/Scala), garantizando compatibilidad con el validador estricto y el catálogo de Go.

GameStats mantiene el catálogo en `go-ingestion/config/catalog.json` y calcula los análisis de `connect-four`, `snake-arena` y `memory-match` en Scala. GameConsole consulta el resultado por `GET /api/analytics/matches/:matchId?gameId=:gameId`; el servidor lo reenvía a `GET /v1/matches/:matchId` en Scala. El panel muestra además las estadísticas generales y por juego mediante `GET /api/stats/general` y `GET /api/stats/games/:gameId`, que el servidor reenvía sin cálculo a `GET /v1/stats/general` y `GET /v1/games/:gameId/stats`. El detalle de las estadísticas y los patrones está en [statistics.md](statistics.md).

---

## 1. Estructura del evento común

Cada hecho ocurrido dentro de una partida se emite como un objeto JSON con la siguiente estructura:

```json
{
  "eventId": "e-7b1f2c1a-8f92-4e2b-a01c-3d2f9b8c7a10",
  "timestamp": "2026-11-12T15:04:05.120Z",
  "gameId": "connect-four",
  "gameVersion": "1.0",
  "matchId": "m-9a41c0de-1b2c-4d3e-8f5a-6b7c8d9e0f1a",
  "playerId": "cpu-prolog",
  "type": "AI_DECISION",
  "action": "DROP_DISC",
  "data": { "column": 3, "level": 4, "nodes": 1820, "timeMs": 12, "score": 6 }
}
```

### Campos:
| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `eventId` | string | Sí | Prefijo `"e-"` seguido de UUID v4 único por evento. Evita duplicados en Go. |
| `timestamp` | string | Sí | Formato ISO 8601 UTC en milisegundos con sufijo `Z` (`YYYY-MM-DDTHH:mm:ss.sssZ`). |
| `gameId` | string | Sí | Identificador canónico del juego (`connect-four`, `snake-arena`, `memory-match`). |
| `gameVersion` | string | Sí | Versión de las reglas del juego (`"1.0"`). |
| `matchId` | string | Sí | Prefijo `"m-"` seguido de UUID v4 generado en el servidor al crear la partida. |
| `playerId` | string | Según evento | `"p-"` + UUID corto para humano, `"cpu-prolog"` para IA en Cuatro en Línea. Opcional en eventos globales. |
| `type` | string | Sí | Tipo de evento registrado en el catálogo. |
| `action` | string | No | Acción descriptiva (`DROP_DISC`, `NONE`, etc.). |
| `data` | object | Sí | Diccionario con las propiedades específicas validadas por el catálogo. |

---

## 2. Catálogo de eventos por juego

### 2.1 Eventos comunes (todos los juegos)
- **`MATCH_STARTED`**: data: `{ "mode": "VS_AI" | "SOLO", "players": string[] }`
- **`PLAYER_JOINED`**: data: `{ "name": string }`
- **`PLAYER_LEFT`**: data: `{ "reason": string }`
- **`MATCH_FINISHED`**: data: `{ "winnerId": string | null, "result": "WIN" | "LOSS" | "DRAW" | "ABANDONED", "durationMs": number, ... }`

### 2.2 `connect-four`
- **`MOVE`**: data: `{ "column": number, "row": number, "turn": number }`
- **`AI_DECISION`**: data: `{ "column": number, "level": number, "nodes": number, "timeMs": number, "score": number }`
- **`PLAYER_WON`**: data: `{ "playerId": string }`
- **`PLAYER_LOST`**: data: `{ "playerId": string }`
- **`MATCH_FINISHED`**: data: `{ "winnerId": string | null, "result": string, "durationMs": number, "moves": number }`

### 2.3 `snake-arena`
- **`FOOD_EATEN`**: data: `{ "score": number, "length": number }`
- **`PLAYER_DIED`**: data: `{ "cause": "WALL" | "SELF", "score": number }`
- **`MATCH_FINISHED`**: data: `{ "winnerId": string | null, "result": string, "durationMs": number, "score": number, "length": number }`

### 2.4 `memory-match`
- **`CARD_FLIPPED`**: data: `{ "cardIndex": number }`
- **`PAIR_MATCHED`**: data: `{ "pairId": string, "attempts": number }`
- **`PAIR_MISSED`**: data: `{ "attempts": number }`
- **`MATCH_FINISHED`**: data: `{ "winnerId": string | null, "result": string, "durationMs": number, "pairs": number, "attempts": number }`

---

## 3. Secuencia obligatoria por partida

1. **Apertura:** Emisión de `MATCH_STARTED` inmediatamente al inicializar la partida, seguido de `PLAYER_JOINED` por cada jugador activo.
2. **Ciclo de juego:** Emisión secuencial de eventos de juego (`MOVE`, `AI_DECISION`, etc.) garantizando el orden temporal estricto.
3. **Cierre normal:** Al presentarse condición de fin de juego (victoria, derrota, empate), emisión de eventos resolutivos (`PLAYER_WON`/`PLAYER_LOST`) y cierre con `MATCH_FINISHED`.
4. **Abandono o desconexión:** Si el cliente desconecta el WebSocket o expira la partida, se emite inmediatamente `PLAYER_LEFT` con el motivo de abandono y se cierra con `MATCH_FINISHED` con `result: "ABANDONED"`.
5. **Garantía:** Ninguna partida puede quedar abierta sin su respectivo `MATCH_FINISHED`.
