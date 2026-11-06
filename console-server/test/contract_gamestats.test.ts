import { describe, it, expect } from "vitest";
import http from "node:http";
import { buildServer } from "../src/server.js";
import { EventPublisher } from "../src/events/EventPublisher.js";
import { EventFactory } from "../src/events/EventFactory.js";
import { GameEvent } from "../src/events/contract.js";
import { DummyMatch } from "../src/core/DummyGame.js";
import { HumanPlayer } from "../src/core/Player.js";

describe("Prueba de Carga y Validacion de Contrato de Eventos", () => {
  it("ejecuta 20 partidas concurrentes de DummyGame y entrega todos los eventos a GameStats", async () => {
    const receivedBatches: GameEvent[][] = [];
    const mockGoServer = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v1/events") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const events: GameEvent[] = JSON.parse(body);
          receivedBatches.push(events);
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ accepted: events.length, rejected: 0 }));
        });
      } else {
        res.writeHead(404).end();
      }
    });

    await new Promise<void>((resolve) => mockGoServer.listen(0, resolve));
    const port = (mockGoServer.address() as any).port;

    const publisher = new EventPublisher({
      gamestatsUrl: `http://localhost:${port}`,
      workers: 4,
      maxBatchSize: 10,
      flushIntervalMs: 50,
      outboxPath: "dummy-load-outbox.ndjson",
    });

    const { matchManager } = await buildServer({ publisher });

    const totalMatches = 20;
    const matches: DummyMatch[] = [];

    // Crear 20 partidas en paralelo
    for (let i = 0; i < totalMatches; i++) {
      const match = matchManager.createMatch("dummy-game") as DummyMatch;
      matches.push(match);
      const player = new HumanPlayer(`p-player-${i}`, `Jugador ${i}`);
      match.addPlayer(player);
    }

    // Ejecutar acciones concurrentes en cada una
    await Promise.all(
      matches.map(async (m, idx) => {
        const playerId = `p-player-${idx}`;
        for (let step = 1; step <= 5; step++) {
          m.handleAction(playerId, { step });
        }
      })
    );

    // Todas las partidas alcanzaron 5 acciones y finalizaron (WIN)
    for (const m of matches) {
      expect(m.status).toBe("FINISHED");
    }

    await publisher.flushAll();
    await publisher.stop();
    await new Promise<void>((resolve) => mockGoServer.close(() => resolve()));

    // Total de eventos esperados por partida:
    // 1 PLAYER_JOINED + 1 MATCH_STARTED + 5 DUMMY_ACTION + 1 MATCH_FINISHED = 8 eventos por partida
    // 20 * 8 = 160 eventos
    const totalReceived = receivedBatches.reduce((acc, b) => acc + b.length, 0);
    expect(totalReceived).toBe(totalMatches * 8);

    // Asegurar que ningun lote mezclo matchId distintos
    for (const batch of receivedBatches) {
      const firstMatchId = batch[0].matchId;
      for (const ev of batch) {
        expect(ev.matchId).toBe(firstMatchId);
      }
    }
  });

  it("genera eventos conformes para connect-four, snake-arena y memory-match", () => {
    // 1. connect-four
    const c4MatchId = EventFactory.createMatchId();
    const c4Events: GameEvent[] = [
      EventFactory.matchStarted("connect-four", c4MatchId, { mode: "VS_AI", players: ["p-1", "cpu-prolog"] }),
      EventFactory.playerJoined("connect-four", c4MatchId, "p-1", { name: "Alice" }),
      EventFactory.create({
        gameId: "connect-four",
        matchId: c4MatchId,
        playerId: "p-1",
        type: "MOVE",
        action: "DROP_DISC",
        data: { column: 3, row: 5, turn: 1 },
      }),
      EventFactory.create({
        gameId: "connect-four",
        matchId: c4MatchId,
        playerId: "cpu-prolog",
        type: "AI_DECISION",
        data: { column: 3, level: 2, nodes: 450, timeMs: 8, score: 0 },
      }),
      EventFactory.create({
        gameId: "connect-four",
        matchId: c4MatchId,
        playerId: "p-1",
        type: "PLAYER_WON",
        data: { playerId: "p-1" },
      }),
      EventFactory.matchFinished("connect-four", c4MatchId, {
        winnerId: "p-1",
        result: "WIN",
        durationMs: 45000,
        moves: 12,
      }),
    ];

    expect(c4Events).toHaveLength(6);
    for (const ev of c4Events) {
      expect(ev.gameId).toBe("connect-four");
      expect(ev.matchId).toBe(c4MatchId);
      expect(ev.data).toBeDefined();
    }

    // 2. snake-arena
    const snakeMatchId = EventFactory.createMatchId();
    const snakeEvents: GameEvent[] = [
      EventFactory.matchStarted("snake-arena", snakeMatchId, { mode: "SOLO", players: ["p-2"] }),
      EventFactory.create({
        gameId: "snake-arena",
        matchId: snakeMatchId,
        playerId: "p-2",
        type: "FOOD_EATEN",
        data: { score: 10, length: 4 },
      }),
      EventFactory.create({
        gameId: "snake-arena",
        matchId: snakeMatchId,
        playerId: "p-2",
        type: "PLAYER_DIED",
        data: { cause: "WALL", score: 10 },
      }),
      EventFactory.matchFinished("snake-arena", snakeMatchId, {
        winnerId: null,
        result: "LOSS",
        durationMs: 12000,
        score: 10,
        length: 4,
      }),
    ];
    expect(snakeEvents).toHaveLength(4);

    // 3. memory-match
    const memMatchId = EventFactory.createMatchId();
    const memEvents: GameEvent[] = [
      EventFactory.matchStarted("memory-match", memMatchId, { mode: "SOLO", players: ["p-3"] }),
      EventFactory.create({
        gameId: "memory-match",
        matchId: memMatchId,
        playerId: "p-3",
        type: "CARD_FLIPPED",
        data: { cardIndex: 2 },
      }),
      EventFactory.create({
        gameId: "memory-match",
        matchId: memMatchId,
        playerId: "p-3",
        type: "PAIR_MATCHED",
        data: { pairId: "pair-A", attempts: 1 },
      }),
      EventFactory.matchFinished("memory-match", memMatchId, {
        winnerId: "p-3",
        result: "WIN",
        durationMs: 25000,
        pairs: 1,
        attempts: 1,
      }),
    ];
    expect(memEvents).toHaveLength(4);
  });
});
