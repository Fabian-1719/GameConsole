import { describe, it, expect } from "vitest";
import http from "node:http";
import { ConnectFourMatch } from "../src/games/connect-four/ConnectFourMatch.js";
import { HumanPlayer } from "../src/core/Player.js";
import { GameEvent } from "../src/events/contract.js";

describe("ConnectFourMatch (flujo de partida, eventos y turnos)", () => {
  async function startPrologMock(columns: number[]): Promise<{
    server: ReturnType<typeof http.createServer>;
    url: string;
  }> {
    let decisionIndex = 0;
    const server = http.createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/decide") {
        res.writeHead(404).end();
        return;
      }
      req.resume();
      req.on("end", () => {
        const column = columns[decisionIndex++];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ column, score: 0, nodes: 1, timeMs: 1, depthReached: 2 }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("No se pudo determinar el puerto del mock de Prolog");
    }
    return { server, url: `http://127.0.0.1:${address.port}` };
  }

  async function waitForTurnOrFinish(match: ConnectFourMatch): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = match.getPublicState() as { currentTurnDisc: number };
      if (match.status === "FINISHED" || state.currentTurnDisc === 1) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("La IA no terminó su turno dentro del tiempo esperado");
  }

  it("inicia partida, procesa turno humano y turno de IA con eventos conformes", async () => {
    // Mock de Prolog HTTP
    const mockPrologServer = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/decide") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              column: 3,
              score: 10,
              nodes: 120,
              timeMs: 5,
              depthReached: 4,
            })
          );
        });
      } else {
        res.writeHead(404).end();
      }
    });

    await new Promise<void>((resolve) => mockPrologServer.listen(0, resolve));
    const port = (mockPrologServer.address() as any).port;

    const match = new ConnectFourMatch({
      prologUrl: `http://localhost:${port}`,
      level: 2,
    });

    const emittedEvents: GameEvent[] = [];
    match.on("event", (ev: GameEvent) => emittedEvents.push(ev));

    const human = new HumanPlayer("p-fabian", "Fabián");
    match.addPlayer(human);

    expect(match.status).toBe("RUNNING");
    expect(emittedEvents.some((e) => e.type === "PLAYER_JOINED")).toBe(true);
    expect(emittedEvents.some((e) => e.type === "MATCH_STARTED")).toBe(true);

    // Humano juega en columna 2
    await match.handleAction(human.id, { column: 2 });

    // Esperar a que la IA complete su turno asíncrono
    await new Promise((resolve) => setTimeout(resolve, 100));

    await new Promise<void>((resolve) => mockPrologServer.close(() => resolve()));

    // Verificar que la ficha humana esté en (5, 2) y la de la IA en (5, 3)
    const boardMatrix = match.getBoard().toMatrix();
    expect(boardMatrix[5][2]).toBe(1); // Humano
    expect(boardMatrix[5][3]).toBe(2); // IA

    // Comprobar eventos emitidos
    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain("MOVE");
    expect(eventTypes).toContain("AI_DECISION");

    const aiDecisionEvent = emittedEvents.find((e) => e.type === "AI_DECISION");
    expect(aiDecisionEvent?.data.column).toBe(3);
    expect(aiDecisionEvent?.data.level).toBe(2);
    expect(aiDecisionEvent?.playerId).toBe("cpu-prolog");
  });

  it("rechaza jugadas en columnas llenas sin emitir evento de juego", async () => {
    const match = new ConnectFourMatch();
    const human = new HumanPlayer("p-fabian", "Fabián");
    match.addPlayer(human);

    // Llenar columna 1 artificialmente
    for (let i = 0; i < 6; i++) {
      match.getBoard().drop(1, 1);
    }

    const eventsCountBefore = (match as any).board.toMatrix();
    await expect(match.handleAction(human.id, { column: 1 })).rejects.toThrowError(/esta completa/);
  });

  it("abandono por desconexion genera PLAYER_LEFT y MATCH_FINISHED con ABANDONED", () => {
    const match = new ConnectFourMatch();
    const emittedEvents: GameEvent[] = [];
    match.on("event", (ev: GameEvent) => emittedEvents.push(ev));

    const human = new HumanPlayer("p-fabian", "Fabián");
    match.addPlayer(human);

    match.removePlayer(human.id, "WEBSOCKET_CLOSED");

    expect(match.status).toBe("FINISHED");
    const finishEvent = emittedEvents.find((e) => e.type === "MATCH_FINISHED");
    expect(finishEvent?.data.result).toBe("ABANDONED");
  });

  it("declara ganador humano solo al colocar la cuarta ficha y transmite el estado final antes de FINISHED", async () => {
    const prolog = await startPrologMock([6, 6, 5]);
    try {
      const match = new ConnectFourMatch({ prologUrl: prolog.url });
      const human = new HumanPlayer("p-human-win", "Jugador");
      const emittedEvents: GameEvent[] = [];
      const notifications: string[] = [];
      let finalState: ReturnType<ConnectFourMatch["getPublicState"]> | undefined;
      match.on("event", (event: GameEvent) => emittedEvents.push(event));
      match.on("state", (state) => {
        if ((state as { status?: string }).status === "FINISHED") {
          finalState = state as ReturnType<ConnectFourMatch["getPublicState"]>;
          notifications.push("state");
        }
      });
      match.on("finished", () => notifications.push("finished"));
      match.addPlayer(human);

      for (const column of [0, 1, 2]) {
        await match.handleAction(human.id, { column });
        await waitForTurnOrFinish(match);
      }
      expect(match.status).toBe("RUNNING");

      await match.handleAction(human.id, { column: 3 });

      expect(match.status).toBe("FINISHED");
      expect(emittedEvents.find((event) => event.type === "MATCH_FINISHED")?.data).toMatchObject({
        result: "WIN",
        winnerId: human.id,
      });
      expect(finalState?.winningCells).toHaveLength(4);
      expect(notifications).toEqual(["state", "finished"]);
    } finally {
      await new Promise<void>((resolve) => prolog.server.close(() => resolve()));
    }
  });

  it("muestra la ficha ganadora de la IA antes de anunciar que ganó", async () => {
    const prolog = await startPrologMock([0, 1, 2, 3]);
    try {
      const match = new ConnectFourMatch({ prologUrl: prolog.url });
      const human = new HumanPlayer("p-cpu-win", "Jugador");
      const emittedEvents: GameEvent[] = [];
      const notifications: string[] = [];
      let finalState: ReturnType<ConnectFourMatch["getPublicState"]> | undefined;
      match.on("event", (event: GameEvent) => emittedEvents.push(event));
      match.on("state", (state) => {
        if ((state as { status?: string }).status === "FINISHED") {
          finalState = state as ReturnType<ConnectFourMatch["getPublicState"]>;
          notifications.push("state");
        }
      });
      match.on("finished", () => notifications.push("finished"));
      match.addPlayer(human);

      for (const column of [6, 6, 5, 5]) {
        await match.handleAction(human.id, { column });
        await waitForTurnOrFinish(match);
        if (match.status === "RUNNING") {
          expect(match.getBoard().findWinner()).toBeNull();
        }
      }

      expect(match.status).toBe("FINISHED");
      expect(emittedEvents.find((event) => event.type === "MATCH_FINISHED")?.data).toMatchObject({
        result: "LOSS",
        winnerId: "cpu-prolog",
      });
      expect(finalState?.board[5].slice(0, 4)).toEqual([2, 2, 2, 2]);
      expect(finalState?.winningCells).toEqual([
        { row: 5, column: 0 },
        { row: 5, column: 1 },
        { row: 5, column: 2 },
        { row: 5, column: 3 },
      ]);
      expect(notifications).toEqual(["state", "finished"]);
    } finally {
      await new Promise<void>((resolve) => prolog.server.close(() => resolve()));
    }
  });
});
