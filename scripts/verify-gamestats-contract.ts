/**
 * Script de verificacion de contrato contra el servicio real de GameStats (Go).
 * Envia eventos de ejemplo para los tres juegos y valida que Go los acepte con HTTP 202.
 * 
 * Uso:
 *   npx tsx ../scripts/verify-gamestats-contract.ts [URL_GAMESTATS]
 */

const targetUrl = process.argv[2] || process.env.GAMESTATS_URL || "http://localhost:8080";

async function main() {
  console.log(`Verificando contrato contra GameStats en: ${targetUrl}`);

  // Verificar health
  try {
    const healthRes = await fetch(`${targetUrl}/health`);
    if (!healthRes.ok) {
      console.error(`GameStats /health respondio status ${healthRes.status}`);
      process.exit(1);
    }
    console.log("Health check de GameStats: OK");
  } catch (err) {
    console.error(`No se pudo conectar a GameStats en ${targetUrl}:`, err);
    console.log("Asegurate de tener Go corriendo: `cd gamestats/go-ingestion && go run ./cmd/ingestion`");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const events = [
    // 1. connect-four
    {
      eventId: "e-test-c4-001",
      timestamp: now,
      gameId: "connect-four",
      gameVersion: "1.0",
      matchId: "m-test-c4",
      type: "MATCH_STARTED",
      action: "START",
      data: { mode: "VS_AI", players: ["p-test", "cpu-prolog"] },
    },
    {
      eventId: "e-test-c4-002",
      timestamp: now,
      gameId: "connect-four",
      gameVersion: "1.0",
      matchId: "m-test-c4",
      playerId: "p-test",
      type: "PLAYER_JOINED",
      data: { name: "Tester" },
    },
    {
      eventId: "e-test-c4-003",
      timestamp: now,
      gameId: "connect-four",
      gameVersion: "1.0",
      matchId: "m-test-c4",
      playerId: "p-test",
      type: "MOVE",
      data: { column: 3, row: 5, turn: 1 },
    },
    {
      eventId: "e-test-c4-004",
      timestamp: now,
      gameId: "connect-four",
      gameVersion: "1.0",
      matchId: "m-test-c4",
      playerId: "cpu-prolog",
      type: "AI_DECISION",
      data: { column: 3, level: 2, nodes: 1500, timeMs: 10, score: 4 },
    },
    {
      eventId: "e-test-c4-005",
      timestamp: now,
      gameId: "connect-four",
      gameVersion: "1.0",
      matchId: "m-test-c4",
      type: "MATCH_FINISHED",
      data: { result: "WIN", durationMs: 30000 },
    },

    // 2. snake-arena
    {
      eventId: "e-test-snake-001",
      timestamp: now,
      gameId: "snake-arena",
      gameVersion: "1.0",
      matchId: "m-test-snake",
      type: "MATCH_STARTED",
      data: { mode: "SOLO", players: ["p-test"] },
    },
    {
      eventId: "e-test-snake-002",
      timestamp: now,
      gameId: "snake-arena",
      gameVersion: "1.0",
      matchId: "m-test-snake",
      playerId: "p-test",
      type: "FOOD_EATEN",
      data: { score: 10, length: 3 },
    },
    {
      eventId: "e-test-snake-003",
      timestamp: now,
      gameId: "snake-arena",
      gameVersion: "1.0",
      matchId: "m-test-snake",
      type: "MATCH_FINISHED",
      data: { result: "LOSS", durationMs: 15000 },
    },

    // 3. memory-match
    {
      eventId: "e-test-mem-001",
      timestamp: now,
      gameId: "memory-match",
      gameVersion: "1.0",
      matchId: "m-test-mem",
      type: "MATCH_STARTED",
      data: { mode: "SOLO", players: ["p-test"] },
    },
    {
      eventId: "e-test-mem-002",
      timestamp: now,
      gameId: "memory-match",
      gameVersion: "1.0",
      matchId: "m-test-mem",
      playerId: "p-test",
      type: "CARD_FLIPPED",
      data: { cardIndex: 4 },
    },
    {
      eventId: "e-test-mem-003",
      timestamp: now,
      gameId: "memory-match",
      gameVersion: "1.0",
      matchId: "m-test-mem",
      type: "MATCH_FINISHED",
      data: { result: "WIN", durationMs: 20000 },
    },
  ];

  console.log(`Enviando ${events.length} eventos a ${targetUrl}/v1/events...`);
  const res = await fetch(`${targetUrl}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });

  const body = await res.json();
  console.log("Respuesta de GameStats:", res.status, body);

  if (res.status === 202 && body.accepted === events.length && body.rejected === 0) {
    console.log("Contrato validado con exito: todos los eventos fueron aceptados sin rechazos.");
    process.exit(0);
  } else {
    console.error("Fallo de contrato: hubo eventos rechazados o status no esperado.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
