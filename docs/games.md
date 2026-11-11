# GameConsole — Juegos y diseño orientado a objetos

GameConsole ofrece **tres juegos distintos**, todos cargables desde la consola web y jugables a la vez (en la misma consola o en pestañas distintas):

| Juego | `gameId` | Tipo | Contra quién |
|---|---|---|---|
| Cuatro en Línea | `connect-four` | Por turnos | Usuario contra la computadora (IA en Prolog) |
| Snake | `snake-arena` | Tiempo real | Un jugador |
| Memoria | `memory-match` | Cartas | Un jugador |

Los tres se construyen sobre el **mismo núcleo orientado a objetos** de `console-server/src/core`. Agregar un juego nuevo no exige tocar ese núcleo ni las rutas de la API.

---

## 1. Núcleo común (`console-server/src/core`)

```
            Game (abstracta)                     Match (abstracta, EventEmitter)
            + createMatch()                      + start() / finish() / addPlayer() / removePlayer()
               ▲                                 + handleAction()   (abstracto)
   ┌───────────┼────────────┐                    + getPublicState() (abstracto)
ConnectFourGame SnakeGame MemoryGame                ▲
                                     ┌──────────────┼──────────────┐
                              ConnectFourMatch  SnakeMatch    MemoryMatch

            Player (abstracta)
               ▲
     ┌─────────┴─────────┐
 HumanPlayer        AiPlayer (abstracta, + decide())
                         ▲
                   PrologAiPlayer

 GameRegistry: catálogo de juegos cargables   MatchManager: mapa matchId → partida activa
```

| Clase | Responsabilidad |
|---|---|
| `Game` | Describe un juego (id, nombre, versión) y sabe **crear** sus partidas (`createMatch`). |
| `Match` | Una partida en curso: jugadores, estado, inicio y **cierre garantizado** (`finish`). Emite los eventos comunes (`MATCH_STARTED`, `PLAYER_JOINED`, `PLAYER_LEFT`, `MATCH_FINISHED`). |
| `Player` / `HumanPlayer` / `AiPlayer` | Quién juega. `AiPlayer` agrega `decide()`: la computadora elige su jugada. |
| `PrologAiPlayer` | Implementa `decide()` preguntándole al servicio Prolog (`POST /decide`). |
| `GameRegistry` | Catálogo de juegos disponibles; la consola lo muestra en la pantalla principal. |
| `MatchManager` | Guarda las partidas activas por `matchId` y limpia las terminadas. |
| `EventFactory` | Convierte los hechos del juego al formato de GameStats (UUID, fecha ISO UTC, `gameVersion`). |

### Evidencia de POO

- **Abstracción:** `Game`, `Match`, `Player` y `AiPlayer` son abstractas. Definen *qué* debe hacer cada juego o jugador, no *cómo*.
- **Herencia:** cada juego hereda de `Game` y cada partida de `Match`. Así reutilizan el inicio, el cierre, el manejo de jugadores y la emisión de eventos comunes.
- **Polimorfismo:** el servidor llama a `match.handleAction(...)` y `match.getPublicState()` sin saber qué juego es. Cada partida responde a su manera: soltar una ficha, cambiar la dirección de la serpiente o voltear una carta. Lo mismo pasa con `finish()`, que cada juego sobrescribe para agregar sus datos finales.
- **Encapsulación:** el estado interno es `private`: el tablero (`Board.grid`), los segmentos de la serpiente o el estado de cada carta. Solo se cambia mediante métodos que respetan las reglas (`drop`, `move`, `flip`). Hacia afuera solo sale una copia pública (`getPublicState`, `toMatrix`, `toPublicState`).

---

## 2. Cuatro en Línea (`connect-four`)

**Reglas:** tablero de 6 filas × 7 columnas. El humano juega primero (fichas rojas) y la computadora después (fichas amarillas). La ficha cae por gravedad hasta la fila libre más baja. Gana quien alinea 4 fichas en horizontal, vertical o diagonal. Si el tablero se llena sin ganador, es empate.

| Clase | Qué hace |
|---|---|
| `ConnectFourGame` | Crea partidas con el nivel de dificultad elegido (1 fácil, 2 normal, 3 difícil). |
| `ConnectFourMatch` | Controla los turnos, valida la jugada del humano y le pide la suya a `PrologAiPlayer`. Detecta victoria o empate y emite `MOVE`, `AI_DECISION`, `PLAYER_WON` y `PLAYER_LOST`. |
| `Board` | Tablero encapsulado: `drop` (soltar ficha), `isColumnFull`, `findWinningLine` (las 4 casillas ganadoras para resaltarlas) e `isFull`. |
| `PrologAiPlayer` | Envía el tablero y el nivel a Prolog y recibe la columna, el puntaje, los nodos evaluados y el tiempo. |

Si Prolog no responde, la partida **muestra el error**. Nunca juega una columna al azar: el enunciado pide que la computadora decida con reglas, no por suerte. La explicación de la IA está en [prolog-ai.md](prolog-ai.md).

## 3. Snake (`snake-arena`)

**Reglas:** cuadrícula de 20 × 20. La serpiente avanza sola cada 120 ms y el jugador la dirige con el teclado. Cada comida suma 10 puntos y la alarga una casilla. Pierde si choca contra una pared (`WALL`) o contra su propio cuerpo (`SELF`). Si llena toda la cuadrícula, gana.

| Clase | Qué hace |
|---|---|
| `SnakeGame` | Crea partidas de Snake. |
| `SnakeMatch` | El **reloj del juego vive en el servidor** (un temporizador por partida). En cada tick mueve la serpiente, revisa los choques y la comida, y difunde el estado por WebSocket. Si la pestaña se oculta, pausa la partida. |
| `Snake` | Segmentos y dirección (privados). Encola giros y no permite dar media vuelta sobre sí misma. |
| `Food` | Posición de la comida; se recoloca en una casilla libre. |
| `Grid` | Límites de la cuadrícula y búsqueda de una casilla libre. |

**No inunda GameStats:** no se emite un evento por cada tick. Solo se envían los hechos relevantes: `FOOD_EATEN`, `PLAYER_DIED` y `MATCH_FINISHED`.

## 4. Memoria (`memory-match`)

**Reglas:** 16 cartas boca abajo (8 pares). El jugador voltea dos. Si son iguales, quedan descubiertas (`PAIR_MATCHED`); si no, se vuelven a tapar después de 1 segundo (`PAIR_MISSED`). Gana al encontrar todos los pares.

| Clase | Qué hace |
|---|---|
| `MemoryGame` | Crea partidas de Memoria. |
| `MemoryMatch` | Lleva los intentos y los pares encontrados, compara las dos cartas volteadas y tapa las que no coinciden. |
| `Deck` | Crea y baraja los pares de cartas. |
| `Card` | Estado privado (`HIDDEN`, `FLIPPED`, `MATCHED`). Solo muestra su valor cuando está volteada o emparejada. |

---

## 5. Varias partidas a la vez sin mezclarse

- El `matchId` (y cada `eventId`) se genera **en el servidor** con UUID, nunca en el navegador. Así dos pestañas no pueden chocar.
- Cada pestaña abre `/play/:gameId/:matchId` y se conecta por WebSocket **solo a su partida**.
- Cada partida tiene su propia **cola de eventos** en el `EventPublisher`, que conserva el orden y no se mezcla con las demás. El envío a GameStats es asíncrono, así que el jugador nunca espera a GameStats durante su turno.
- **Cierre garantizado:** si el usuario cierra la pestaña, se emite `PLAYER_LEFT` y `MATCH_FINISHED` con `result: "ABANDONED"`. Toda partida termina y cuenta como instancia ejecutada.

Más detalle de los eventos: [event-spec-console.md](event-spec-console.md). Estadísticas: [statistics.md](statistics.md).
