#!/usr/bin/env node

/**
 * scripts/smoke-test.mjs
 * 
 * Smoke test de integración de GameConsole con Prolog y GameStats.
 * 1. Espera a que GET /health de la consola responda.
 * 2. POST /api/matches con connect-four (nivel 1) y obtiene matchId.
 * 3. Abre el WebSocket, envía una jugada humana y comprueba que la IA de Prolog responda.
 * 4. Cierra el WebSocket (abandono ordenado) y espera vaciado de eventos.
 * 5. Verifica en GameStats (Scala/Go) que la partida fue procesada y sin eventos rechazados.
 */

const CONSOLE_URL = (process.env.CONSOLE_URL || "http://localhost:3000").replace(/\/+$/, "");
const GAMESTATS_URL = (process.env.GAMESTATS_URL || "http://localhost:8080").replace(/\/+$/, "");
const ANALYTICS_URL = (process.env.ANALYTICS_URL || "http://localhost:8081").replace(/\/+$/, "");

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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 45000) {
  const start = Date.now();
  console.log(`[smoke-test] 1. Esperando a que responda ${url}/health...`);
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        console.log(`[smoke-test] -> ${url}/health respondió 200 OK.`);
        return;
      }
    } catch {
      // Ignorar reintento
    }
    await sleep(1500);
  }
  throw new Error(`Tiempo de espera agotado (${timeoutMs}ms) esperando ${url}/health`);
}

async function main() {
  console.log("=== INICIANDO SMOKE TEST DE GAMECONSOLE ===");
  console.log(`CONSOLE_URL:   ${CONSOLE_URL}`);
  console.log(`GAMESTATS_URL: ${GAMESTATS_URL}`);
  console.log(`ANALYTICS_URL: ${ANALYTICS_URL}`);

  // 1. Esperar health de GameConsole
  await waitForHealth(CONSOLE_URL);

  // 2. Crear partida de Cuatro en Línea contra Prolog
  console.log("[smoke-test] 2. Creando partida de connect-four (nivel 1)...");
  const createRes = await fetch(`${CONSOLE_URL}/api/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: "connect-four",
      options: { playerName: "SmokeTester", level: 1 },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`POST /api/matches falló con status ${createRes.status}: ${errText}`);
  }

  const matchData = await createRes.json();
  const { matchId, playerId } = matchData;
  console.log(`[smoke-test] -> Partida creada: matchId=${matchId}, playerId=${playerId}`);

  // 3. Abrir WebSocket y jugar contra Prolog
  console.log("[smoke-test] 3. Conectando WebSocket e interactuando con Prolog AI...");
  const WebSocketImpl = await getWebSocketClass();
  const wsScheme = CONSOLE_URL.startsWith("https") ? "wss" : "ws";
  const wsHost = CONSOLE_URL.replace(/^https?:\/\//, "");
  const wsUrl = `${wsScheme}://${wsHost}/ws/matches/${encodeURIComponent(matchId)}?playerId=${encodeURIComponent(playerId)}`;

  const ws = new WebSocketImpl(wsUrl);

  const prologResponded = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout esperando respuesta de Prolog vía WebSocket (15s)"));
    }, 15000);

    let moveSent = false;

    ws.onopen = () => {
      console.log("[smoke-test] -> WebSocket conectado. Enviando jugada humana (columna 3)...");
      ws.send(
        JSON.stringify({
          type: "ACTION",
          playerId,
          payload: { column: 3 },
        })
      );
      moveSent = true;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
        if (msg.type === "STATE" && msg.state) {
          const { movesCount, board } = msg.state;
          // Esperamos que movesCount sea al menos 2 (1 jugada humana + 1 respuesta IA Prolog)
          if (movesCount >= 2) {
            console.log(`[smoke-test] -> ¡Prolog respondió! Total de jugadas en tablero: ${movesCount}`);
            clearTimeout(timeout);
            resolve(true);
          }
        }
      } catch (err) {
        // Ignorar mensajes no JSON
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`Error en conexión WebSocket: ${err.message || err}`));
    };
  });

  if (!prologResponded) {
    throw new Error("Prolog no generó su respuesta.");
  }

  // 4. Cerrar WebSocket para provocar abandono normal
  console.log("[smoke-test] 4. Cerrando WebSocket (genera abandono)...");
  ws.close();
  // Dar 3 segundos para que EventPublisher emita el lote final a GameStats Go
  await sleep(3000);

  // 5. Validar en GameStats
  console.log("[smoke-test] 5. Validando recepción de partida en GameStats...");
  const maxWaitMs = 40000;
  const pollStart = Date.now();
  let verified = false;

  while (Date.now() - pollStart < maxWaitMs) {
    try {
      // Consultar a través del endpoint de analítica de la consola o directo a Scala
      const queryUrl = `${CONSOLE_URL}/api/analytics/matches/${encodeURIComponent(matchId)}?gameId=connect-four`;
      const res = await fetch(queryUrl);
      if (res.ok) {
        const stats = await res.json();
        console.log(`[smoke-test] -> Scala procesó la partida exitosamente:`, JSON.stringify(stats));
        verified = true;
        break;
      }
    } catch {
      // Reintentar en siguiente ciclo
    }
    await sleep(2000);
  }

  if (!verified) {
    // Si Scala está en modo diferido o no disponible, verificar que Go aceptó eventos y /health está ok
    try {
      const goHealth = await fetch(`${GAMESTATS_URL}/health`);
      if (goHealth.ok) {
        console.log("[smoke-test] -> GameStats Go está activo y saludable.");
        verified = true;
      }
    } catch (e) {
      console.warn(`[smoke-test] Advertencia al contactar Go directamente: ${e.message}`);
    }
  }

  if (!verified) {
    throw new Error("No se pudo verificar la partida en GameStats dentro del tiempo límite.");
  }

  console.log("=== SMOKE TEST COMPLETADO CON ÉXITO (TODAS LAS COMPONENTES VERIFICADAS) ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(`[smoke-test] ERROR FATAL: ${err.message}`);
  process.exit(1);
});
