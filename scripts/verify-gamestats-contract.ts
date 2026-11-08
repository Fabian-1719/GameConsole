import { randomUUID } from "node:crypto";

interface GameEvent {
  eventId: string;
  timestamp: string;
  gameId: string;
  gameVersion: string;
  matchId: string;
  playerId?: string;
  type: string;
  action: string;
  data: Record<string, unknown>;
}

interface MatchAnalysis {
  matchId: string;
  gameId: string;
  complete: boolean;
  [key: string]: unknown;
}

const ingestionUrl = process.env.GAMESTATS_URL || "http://localhost:8080";
const analyticsUrl = process.env.ANALYTICS_URL || "http://localhost:8081";
const baseTime = Date.now();
let eventNumber = 0;

function createEvent(
  gameId: string,
  matchId: string,
  type: string,
  data: Record<string, unknown>,
  playerId?: string,
  action = "NONE"
): GameEvent {
  eventNumber++;
  return {
    eventId: `e-${randomUUID()}`,
    timestamp: new Date(baseTime + eventNumber).toISOString(),
    gameId,
    gameVersion: "1.0",
    matchId,
    ...(playerId ? { playerId } : {}),
    type,
    action,
    data,
  };
}

function createTestMatches(): Array<{ gameId: string; matchId: string; events: GameEvent[] }> {
  const connectFourId = `m-${randomUUID()}`;
  const connectFourPlayer = `p-${randomUUID().slice(0, 8)}`;
  const cpuPlayer = "cpu-prolog";
  const connectFour = [
    createEvent("connect-four", connectFourId, "MATCH_STARTED", {
      mode: "VS_AI",
      players: [connectFourPlayer, cpuPlayer],
    }, undefined, "START"),
    createEvent("connect-four", connectFourId, "PLAYER_JOINED", { name: "Contract Test" },
      connectFourPlayer, "JOIN"),
  ];
  const humanColumns = [0, 1, 2, 3];
  const cpuColumns = [6, 5, 4];
  let turn = 0;
  for (let index = 0; index < humanColumns.length; index++) {
    turn++;
    connectFour.push(createEvent("connect-four", connectFourId, "MOVE", {
      column: humanColumns[index],
      row: 5,
      turn,
    }, connectFourPlayer, "DROP_DISC"));
    if (index < cpuColumns.length) {
      connectFour.push(createEvent("connect-four", connectFourId, "AI_DECISION", {
        column: cpuColumns[index],
        level: 2,
        nodes: 100 * (index + 1),
        timeMs: 2 * (index + 1),
        score: 0,
      }, cpuPlayer, "DROP_DISC"));
      turn++;
      connectFour.push(createEvent("connect-four", connectFourId, "MOVE", {
        column: cpuColumns[index],
        row: 5,
        turn,
      }, cpuPlayer, "DROP_DISC"));
    }
  }
  connectFour.push(
    createEvent("connect-four", connectFourId, "PLAYER_WON", { playerId: connectFourPlayer },
      connectFourPlayer, "WIN"),
    createEvent("connect-four", connectFourId, "MATCH_FINISHED", {
      winnerId: connectFourPlayer,
      result: "WIN",
      durationMs: 12000,
      moves: turn,
    }, undefined, "FINISH")
  );

  const snakeId = `m-${randomUUID()}`;
  const snakePlayer = `p-${randomUUID().slice(0, 8)}`;
  const snake = [
    createEvent("snake-arena", snakeId, "MATCH_STARTED", {
      mode: "SOLO",
      players: [snakePlayer],
    }, undefined, "START"),
    createEvent("snake-arena", snakeId, "PLAYER_JOINED", { name: "Contract Test" },
      snakePlayer, "JOIN"),
    ...[4, 5, 6].map((length, index) => createEvent(
      "snake-arena",
      snakeId,
      "FOOD_EATEN",
      { score: 10 * (index + 1), length },
      snakePlayer,
      "EAT"
    )),
    createEvent("snake-arena", snakeId, "PLAYER_DIED", { cause: "WALL", score: 30 },
      snakePlayer, "DIE"),
    createEvent("snake-arena", snakeId, "MATCH_FINISHED", {
      winnerId: null,
      result: "LOSS",
      durationMs: 15000,
      score: 30,
      length: 6,
    }, undefined, "FINISH"),
  ];

  const memoryId = `m-${randomUUID()}`;
  const memoryPlayer = `p-${randomUUID().slice(0, 8)}`;
  const memory = [
    createEvent("memory-match", memoryId, "MATCH_STARTED", {
      mode: "SOLO",
      players: [memoryPlayer],
    }, undefined, "START"),
    createEvent("memory-match", memoryId, "PLAYER_JOINED", { name: "Contract Test" },
      memoryPlayer, "JOIN"),
    ...[0, 1, 2, 3].map((cardIndex) => createEvent(
      "memory-match",
      memoryId,
      "CARD_FLIPPED",
      { cardIndex },
      memoryPlayer,
      "FLIP"
    )),
    createEvent("memory-match", memoryId, "PAIR_MATCHED", { pairId: "pair-1", attempts: 1 },
      memoryPlayer, "MATCH"),
    createEvent("memory-match", memoryId, "PAIR_MATCHED", { pairId: "pair-2", attempts: 2 },
      memoryPlayer, "MATCH"),
    createEvent("memory-match", memoryId, "MATCH_FINISHED", {
      winnerId: memoryPlayer,
      result: "WIN",
      durationMs: 20000,
      pairs: 2,
      attempts: 2,
    }, undefined, "FINISH"),
  ];

  return [
    { gameId: "connect-four", matchId: connectFourId, events: connectFour },
    { gameId: "snake-arena", matchId: snakeId, events: snake },
    { gameId: "memory-match", matchId: memoryId, events: memory },
  ];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} respondió HTTP ${response.status}: ${body}`);
  }
  return JSON.parse(body) as T;
}

async function waitForAnalysis(gameId: string, matchId: string): Promise<MatchAnalysis> {
  const url = `${analyticsUrl}/v1/matches/${encodeURIComponent(matchId)}?gameId=${encodeURIComponent(gameId)}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      return (await response.json()) as MatchAnalysis;
    }
    if (response.status !== 404) {
      throw new Error(`Consulta de análisis respondió HTTP ${response.status}: ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`GameStats no generó el análisis de ${gameId}/${matchId} dentro de 10 segundos`);
}

function assertMetrics(
  analysis: MatchAnalysis,
  expected: Record<string, string | number>
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (analysis[key] !== value) {
      throw new Error(
        `Análisis ${analysis.gameId}/${analysis.matchId}: ${key}=${String(analysis[key])}, esperado ${value}`
      );
    }
  }
}

async function main(): Promise<void> {
  console.log(`Verificando ingestión Go en ${ingestionUrl} y analítica Scala en ${analyticsUrl}`);
  await getJson(`${ingestionUrl}/health`);
  await getJson(`${analyticsUrl}/health`);

  const matches = createTestMatches();
  const events = matches.flatMap((match) => match.events);
  const response = await fetch(`${ingestionUrl}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  const result = await response.json() as { accepted?: number; rejected?: number; errors?: unknown[] };
  if (response.status !== 202 || result.accepted !== events.length || result.rejected !== 0) {
    throw new Error(`Go rechazó eventos: HTTP ${response.status} ${JSON.stringify(result)}`);
  }
  console.log(`Go aceptó ${result.accepted} eventos y rechazó ${result.rejected}.`);

  const checks: Record<string, Record<string, string | number>> = {
    "connect-four": { result: "WIN", moves: 7, totalNodes: 600, aiDecisions: 3 },
    "snake-arena": { result: "LOSS", score: 30, length: 6, foodEaten: 3, deathCause: "WALL" },
    "memory-match": { result: "WIN", pairs: 2, attempts: 2, flips: 4, accuracy: 1 },
  };
  for (const match of matches) {
    const analysis = await waitForAnalysis(match.gameId, match.matchId);
    if (!analysis.complete) {
      throw new Error(`La partida ${match.gameId}/${match.matchId} llegó incompleta a Scala`);
    }
    assertMetrics(analysis, checks[match.gameId]);
    console.log(`Scala analizó ${match.gameId}: ${JSON.stringify(checks[match.gameId])}`);
  }
  console.log("Contrato e integración Go → Scala verificados sin rechazos.");
}

main().catch((error: unknown) => {
  console.error("Falló la verificación de GameStats:", error);
  process.exitCode = 1;
});
