# GameConsole — La IA de Cuatro en Línea en Prolog

La computadora de Cuatro en Línea **no juega al azar**: decide con reglas y búsqueda escritas en SWI-Prolog (`prolog-ai/connect4.pl`). Corre como un servicio HTTP aparte (`prolog-ai/server.pl`, puerto 5000).

## 1. Cómo se conecta con el juego

```
ConnectFourMatch ──► PrologAiPlayer.decide() ── POST /decide ──► Prolog
                                                {board, player, level}
                 ◄── AI_DECISION ◄────────────── {column, score, nodes, depthReached, timeMs}
```

1. El humano suelta su ficha.
2. `ConnectFourMatch` le pasa el tablero (una matriz 6 × 7 donde 0 es vacío, 1 humano y 2 computadora) y el nivel a `PrologAiPlayer`.
3. Prolog calcula y devuelve la columna, el puntaje de la jugada, cuántas posiciones evaluó (`nodes`) y cuánto tardó (`timeMs`).
4. La consola juega esa columna y emite el evento `AI_DECISION` con esos datos. Así GameStats puede medir el tiempo medio de decisión y el nivel contra el resultado.
5. Si Prolog no responde en 3 segundos, la partida **muestra el error**. No hay jugadas aleatorias de respaldo.

## 2. Qué sabe Prolog (las reglas)

| Predicado | En palabras simples |
|---|---|
| `legal_moves/2` | Las columnas que todavía tienen espacio arriba. |
| `apply_move/4` | Dejar caer una ficha: queda en la fila libre más baja de esa columna. |
| `winner/2` | ¿Hay 4 fichas seguidas del mismo jugador en horizontal, vertical o alguna diagonal? |
| `game_over/2` | La partida terminó por victoria o porque el tablero está lleno (empate). |
| `evaluate/3` | Le pone una **nota** a un tablero que todavía no terminó (la heurística). |
| `minimax/11` | Busca la mejor jugada pensando varias jugadas hacia adelante. |

Las columnas se revisan **del centro hacia afuera**. En Cuatro en Línea el centro suele ser mejor, y revisarlo primero ayuda a que la poda descarte más rápido.

## 3. Minimax, explicado sencillo

La idea es "pienso varias jugadas adelante y elijo la que mejor me deja, suponiendo que el rival también juega lo mejor que puede".

1. Prolog imagina cada columna posible para la computadora.
2. Por cada una, imagina todas las respuestas del humano; por cada respuesta, las jugadas siguientes de la computadora, y así hasta cierta **profundidad**.
3. Al llegar al límite, le pone nota al tablero con `evaluate`.
4. Las notas suben por el árbol:
   - en el turno de la computadora se elige la **más alta** (maximiza);
   - en el turno del humano se supone que elegirá la **más baja** (minimiza), es decir, lo peor para la computadora.
5. La computadora juega la columna cuya nota final es la más alta.

### La nota de un tablero (heurística)

- **+10 000** si la computadora ganó y **−10 000** si ganó el humano.
- Si nadie ganó todavía, revisa **todas las ventanas de 4 casillas** del tablero:
  - 3 fichas propias y 1 vacía: **+100** (casi gana).
  - 2 propias y 2 vacías: **+10**.
  - 3 del rival y 1 vacía: **−120**. Pesa más que el +100 para que **bloquear** sea prioritario.
  - 2 del rival y 2 vacías: **−10**.
- **+6** por cada ficha propia en la columna central y **−6** por cada una del rival.

### Poda alfa-beta: no perder tiempo

Mientras busca, Prolog recuerda dos valores:
- **alfa:** lo mejor que la computadora ya tiene asegurado;
- **beta:** lo mejor que el humano ya tiene asegurado.

Si en una rama descubre que el rival puede forzar algo peor que lo que ya tiene asegurado en otra, **deja de revisar esa rama** (la "poda"). El resultado es la misma jugada que daría minimax completo, pero evaluando muchas menos posiciones. Por eso puede pensar más jugadas hacia adelante en poco tiempo.

## 4. Niveles de dificultad

| Nivel | Profundidad (jugadas que mira hacia adelante) |
|---|---|
| 1 · Fácil | 2 |
| 2 · Normal | 4 |
| 3 · Difícil | 6 |

A mayor profundidad, la IA ve más lejos, evalúa más nodos y tarda un poco más. Eso se ve en el evento `AI_DECISION` y en la tabla "Nivel de la IA contra resultado" del panel.

## 5. Pruebas (plunit)

`prolog-ai/tests/connect4_tests.pl`:

| Prueba | Qué comprueba |
|---|---|
| `toma_victoria_inmediata` | Si puede ganar en esta jugada, la toma. |
| `bloquea_victoria_inmediata_del_rival` | Si el humano está a una ficha de ganar, lo bloquea. |
| `nunca_devuelve_columna_llena` | Nunca elige una columna sin espacio. |
| `nodes_crece_al_subir_profundidad` | A más nivel, evalúa más posiciones. |

```bash
cd prolog-ai
swipl -g "run_tests,halt" -s tests/connect4_tests.pl
```

## 6. Preguntas típicas de la defensa

- **¿Prolog se usa de verdad en la partida?** Sí. Cada jugada de la computadora sale de `POST /decide`, y cada una deja su evento `AI_DECISION` con los nodos y el tiempo.
- **¿Por qué el −120 pesa más que el +100?** Para que, si hay que elegir, bloquear la victoria del rival sea más importante que acercarse a la propia.
- **¿Qué pasa si Prolog se cae?** La partida muestra el error. No se inventa una jugada al azar.
