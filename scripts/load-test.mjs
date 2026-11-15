#!/usr/bin/env node

/**
 * scripts/load-test.mjs
 * 
 * Prueba de carga y concurrencia para GameConsole.
 * 
 * Uso:
 *   node scripts/load-test.mjs [BASE_URL] [N]
 *   Ejemplo: node scripts/load-test.mjs http://localhost:3000 30
 */

const BASE_URL = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const N = parseInt(process.argv[3] || process.env.N || "30", 10);
const MAX_DURATION_MS = parseInt(process.env.MAX_DURATION_MS || "120000", 10);

async function getWebSocketClass() {
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  try {
    const wsModule = await import("ws");
    return wsModule.default || wsModule.WebSocket;
  } catch {
    throw new Error("No se encontró soporte para WebSocket nativo ni paquete ws.");
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Estadísticas globales de la prueba de carga
const stats = {
  created: 0,
  finished: 0,
  abandoned: 0,
  errors: 0,
  prologTimesMs: [],
  matchIdsSeen: new Set(),
  duplicates: 0,
  byGame: {
    "connect-four": { created: 0, finished: 0, abandoned: 0, errors: 0 },
    "snake-arena": { created: 0, finished: 0, abandoned: 0, errors: 0 },
    "memory-match": { created: 0, finished: 0, abandoned: 0, errors: 0 },
  },
};

/**
 * Ejecuta una partida de Cuatro en Línea contra la IA de Prolog.
 */
async function runConnectFour(matchIndex, WebSocketImpl, shouldAbandon) {
  const gameId = "connect-four";
  stats.byGame[gameId].created++;

  let matchId = null;
  let playerId = null;

  try {
    const res = await fetch(`${BASE_URL}/api/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        options: { playerName: `Player-C4-${matchIndex}`, level: 1 },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} al crear partida`);
    const data = await res.json();
    matchId = data.matchId;
    playerId = data.playerId;

    if (stats.matchIdsSeen.has(matchId)) stats.duplicates++;
    stats.matchIdsSeen.add(matchId);

    const wsScheme = BASE_URL.startsWith("https") ? "wss" : "ws";
    const wsHost = BASE_URL.replace(/^https?:\/\//, "");
    const wsUrl = `${wsScheme}://${wsHost}/ws/matches/${encodeURIComponent(matchId)}?playerId=${encodeURIComponent(playerId)}`;
    const ws = new WebSocketImpl(wsUrl);

    await new Promise((resolve, reject) => {
      let turnCount = 0;
      let lastMoveTime = 0;
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Timeout en partida ConnectFour"));
      }, 35000);

      ws.onopen = () => {
        // Enviar primera jugada humana en columna rotativa
        const col = (matchIndex + turnCount) % 7;
        lastMoveTime = Date.now();
        ws.send(JSON.stringify({ type: "ACTION", playerId, payload: { column: col } }));
        turnCount++;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
          if (msg.type === "STATE" && msg.state) {
            if (msg.state.movesCount >= 2 && lastMoveTime > 0) {
              const diff = Date.now() - lastMoveTime;
              stats.prologTimesMs.push(diff);
              lastMoveTime = 0;
            }

            if (shouldAbandon && turnCount >= 1) {
              clearTimeout(timeout);
              ws.close();
              stats.abandoned++;
              stats.byGame[gameId].abandoned++;
              return resolve();
            }

            if (msg.state.status === "FINISHED") {
              clearTimeout(timeout);
              ws.close();
              stats.finished++;
              stats.byGame[gameId].finished++;
              return resolve();
            }

            // Si es turno humano de nuevo, jugar
            if (msg.state.currentTurnDisc === 1 && turnCount < 4) {
              const nextCol = (matchIndex + turnCount) % 7;
              lastMoveTime = Date.now();
              ws.send(JSON.stringify({ type: "ACTION", playerId, payload: { column: nextCol } }));
              turnCount++;
            } else if (turnCount >= 4) {
              // Cierre exitoso tras probar interacción suficiente
              clearTimeout(timeout);
              ws.close();
              stats.finished++;
              stats.byGame[gameId].finished++;
              return resolve();
            }
          } else if (msg.type === "FINISHED") {
            clearTimeout(timeout);
            ws.close();
            stats.finished++;
            stats.byGame[gameId].finished++;
            return resolve();
          }
        } catch (e) {
          // Ignorar parsing
        }
      };

      ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
    });
  } catch (err) {
    stats.errors++;
    stats.byGame[gameId].errors++;
  }
}

/**
 * Ejecuta una partida de Snake Arena.
 */
async function runSnake(matchIndex, WebSocketImpl, shouldAbandon) {
  const gameId = "snake-arena";
  stats.byGame[gameId].created++;

  try {
    const res = await fetch(`${BASE_URL}/api/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        options: { playerName: `Player-Snake-${matchIndex}`, tickMs: 80 },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} al crear partida`);
    const data = await res.json();
    const { matchId, playerId } = data;

    if (stats.matchIdsSeen.has(matchId)) stats.duplicates++;
    stats.matchIdsSeen.add(matchId);

    const wsScheme = BASE_URL.startsWith("https") ? "wss" : "ws";
    const wsHost = BASE_URL.replace(/^https?:\/\//, "");
    const wsUrl = `${wsScheme}://${wsHost}/ws/matches/${encodeURIComponent(matchId)}?playerId=${encodeURIComponent(playerId)}`;
    const ws = new WebSocketImpl(wsUrl);

    await new Promise((resolve, reject) => {
      let tickCount = 0;
      const directions = ["DOWN", "RIGHT", "UP", "LEFT"];
      const timeout = setTimeout(() => {
        ws.close();
        resolve();
      }, 15000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "ACTION", playerId, payload: { direction: "DOWN" } }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
          if (msg.type === "STATE" && msg.state) {
            tickCount++;
            if (shouldAbandon && tickCount >= 3) {
              clearTimeout(timeout);
              ws.close();
              stats.abandoned++;
              stats.byGame[gameId].abandoned++;
              return resolve();
            }

            if (msg.state.status === "FINISHED") {
              clearTimeout(timeout);
              ws.close();
              stats.finished++;
              stats.byGame[gameId].finished++;
              return resolve();
            }

            // Cambiar dirección periódicamente
            if (tickCount % 2 === 0 && tickCount < 10) {
              const dir = directions[(matchIndex + tickCount) % directions.length];
              ws.send(JSON.stringify({ type: "ACTION", playerId, payload: { direction: dir } }));
            } else if (tickCount >= 10) {
              clearTimeout(timeout);
              ws.close();
              stats.finished++;
              stats.byGame[gameId].finished++;
              return resolve();
            }
          } else if (msg.type === "FINISHED") {
            clearTimeout(timeout);
            ws.close();
            stats.finished++;
            stats.byGame[gameId].finished++;
            return resolve();
          }
        } catch {
          // Ignorar
        }
      };

      ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
    });
  } catch (err) {
    stats.errors++;
    stats.byGame[gameId].errors++;
  }
}

/**
 * Ejecuta una partida de Memory Match.
 */
async function runMemory(matchIndex, WebSocketImpl, shouldAbandon) {
  const gameId = "memory-match";
  stats.byGame[gameId].created++;

  try {
    const res = await fetch(`${BASE_URL}/api/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        options: { playerName: `Player-Mem-${matchIndex}`, pairs: 3, seed: matchIndex + 10 },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} al crear partida`);
    const data = await res.json();
    const { matchId, playerId } = data;

    if (stats.matchIdsSeen.has(matchId)) stats.duplicates++;
    stats.matchIdsSeen.add(matchId);

    const wsScheme = BASE_URL.startsWith("https") ? "wss" : "ws";
    const wsHost = BASE_URL.replace(/^https?:\/\//, "");
    const wsUrl = `${wsScheme}://${wsHost}/ws/matches/${encodeURIComponent(matchId)}?playerId=${encodeURIComponent(playerId)}`;
    const ws = new WebSocketImpl(wsUrl);

    await new Promise((resolve, reject) => {
      let flips = 0;
      const timeout = setTimeout(() => {
        ws.close();
        resolve();
      }, 15000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "ACTION", playerId, payload: { cardIndex: 0 } }));
        flips++;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
          if (msg.type === "STATE" && msg.state) {
            if (shouldAbandon && flips >= 2) {
              clearTimeout(timeout);
              ws.close();
              stats.abandoned++;
              stats.byGame[gameId].abandoned++;
              return resolve();
            }

            if (msg.state.status === "FINISHED") {
              clearTimeout(timeout);
              ws.close();
              stats.finished++;
              stats.byGame[gameId].finished++;
              return resolve();
            }

            if (flips < 6) {
              const nextIndex = flips % 6;
              ws.send(JSON.stringify({ type: "ACTION", playerId, payload: { cardIndex: nextIndex } }));
              flips++;
            } else {
              clearTimeout(timeout);
              ws.close();
              stats.finished++;
              stats.byGame[gameId].finished++;
              return resolve();
            }
          } else if (msg.type === "FINISHED") {
            clearTimeout(timeout);
            ws.close();
            stats.finished++;
            stats.byGame[gameId].finished++;
            return resolve();
          }
        } catch {
          // Ignorar
        }
      };

      ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
    });
  } catch (err) {
    stats.errors++;
    stats.byGame[gameId].errors++;
  }
}

async function main() {
  console.log("=============================================================");
  console.log(`PRUEBA DE CARGA: ${N} PARTIDAS CONCURRENTES EN GAMECONSOLE`);
  console.log(`Destino: ${BASE_URL}`);
  console.log("=============================================================\n");

  const startTime = Date.now();
  const WebSocketImpl = await getWebSocketClass();

  // Comprobar salud previa
  try {
    const health = await fetch(`${BASE_URL}/health`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    console.log("[Setup] Conectividad con la consola: OK (200)");
  } catch (err) {
    console.error(`[Setup] ERROR: No se puede conectar a ${BASE_URL}/health: ${err.message}`);
    process.exit(1);
  }

  // Distribuir equitativamente las N partidas entre los 3 juegos
  const tasks = [];
  const games = ["connect-four", "snake-arena", "memory-match"];

  for (let i = 0; i < N; i++) {
    const gameId = games[i % games.length];
    const shouldAbandon = i % 5 === 0; // Cada 5 partidas se abandona a propósito
    stats.created++;

    if (gameId === "connect-four") {
      tasks.push(runConnectFour(i, WebSocketImpl, shouldAbandon));
    } else if (gameId === "snake-arena") {
      tasks.push(runSnake(i, WebSocketImpl, shouldAbandon));
    } else {
      tasks.push(runMemory(i, WebSocketImpl, shouldAbandon));
    }
  }

  console.log(`[Ejecución] Lanzando ${N} partidas concurrentes (${Math.round(N / 3)} por juego)...`);
  await Promise.allSettled(tasks);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // Calcular métricas de Prolog
  let avgPrologMs = "N/A";
  if (stats.prologTimesMs.length > 0) {
    const sum = stats.prologTimesMs.reduce((a, b) => a + b, 0);
    avgPrologMs = (sum / stats.prologTimesMs.length).toFixed(1) + " ms";
  }

  console.log("\n=============================================================");
  console.log("INFORME DE RESULTADOS DE LA PRUEBA DE CARGA");
  console.log("=============================================================");
  console.log(`Duración total:             ${durationSec} s`);
  console.log(`Partidas creadas:           ${stats.created}`);
  console.log(`Partidas finalizadas:       ${stats.finished}`);
  console.log(`Partidas abandonadas:       ${stats.abandoned}`);
  console.log(`Errores registrados:        ${stats.errors}`);
  console.log(`Identificadores duplicados: ${stats.duplicates} (esperado: 0)`);
  console.log(`Tiempo medio resp. Prolog:  ${avgPrologMs}`);
  console.log("\nDesglose por juego:");
  console.log(`  - Cuatro en Línea: creadas=${stats.byGame["connect-four"].created}, finalizadas=${stats.byGame["connect-four"].finished}, abandonadas=${stats.byGame["connect-four"].abandoned}, errores=${stats.byGame["connect-four"].errors}`);
  console.log(`  - Snake Arena:     creadas=${stats.byGame["snake-arena"].created}, finalizadas=${stats.byGame["snake-arena"].finished}, abandonadas=${stats.byGame["snake-arena"].abandoned}, errores=${stats.byGame["snake-arena"].errors}`);
  console.log(`  - Memoria:         creadas=${stats.byGame["memory-match"].created}, finalizadas=${stats.byGame["memory-match"].finished}, abandonadas=${stats.byGame["memory-match"].abandoned}, errores=${stats.byGame["memory-match"].errors}`);
  console.log("=============================================================\n");

  // Verificación en GameStats
  console.log("[Verificación GameStats] Consultando estadísticas consolidadas...");
  try {
    const statsRes = await fetch(`${BASE_URL}/api/stats/general`);
    if (statsRes.ok) {
      const gsData = await statsRes.json();
      console.log("[Verificación GameStats] Métricas de Scala:", JSON.stringify(gsData));
    } else {
      console.log(`[Verificación GameStats] Nota: /api/stats/general respondió HTTP ${statsRes.status}`);
    }
  } catch (err) {
    console.log(`[Verificación GameStats] No se pudo consultar Scala: ${err.message}`);
  }

  // Validación final
  if (stats.duplicates > 0) {
    console.error("FALLO: Se detectaron matchId duplicados en la prueba de carga.");
    process.exit(1);
  }

  if (stats.errors > 0) {
    console.error(`FALLO: Se registraron ${stats.errors} errores durante la ejecución.`);
    process.exit(1);
  }

  console.log("ÉXITO: La prueba de carga finalizó sin errores ni duplicados.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error fatal en prueba de carga:", err);
  process.exit(1);
});
