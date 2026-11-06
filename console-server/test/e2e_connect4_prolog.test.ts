import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { ConnectFourMatch } from "../src/games/connect-four/ConnectFourMatch.js";
import { HumanPlayer } from "../src/core/Player.js";
import { GameEvent } from "../src/events/contract.js";

describe("E2E Connect Four contra servidor Prolog real", () => {
  let prologProcess: ChildProcess;
  const prologPort = 5055;

  beforeAll(async () => {
    // Iniciar servidor Prolog real en puerto 5055
    prologProcess = spawn(
      "C:\\Program Files\\swipl\\bin\\swipl.exe",
      ["-s", "server.pl", "-g", `server(${prologPort})`],
      {
        cwd: "../prolog-ai",
        stdio: "ignore",
      }
    );

    // Esperar a que /health responda
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://localhost:${prologPort}/health`);
        if (res.ok) return;
      } catch {
        // Esperando que arranque
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("No se pudo iniciar el servidor Prolog");
  });

  afterAll(() => {
    if (prologProcess && !prologProcess.killed) {
      prologProcess.kill();
    }
  });

  it("humano realiza jugada, Prolog decide con Minimax y emite AI_DECISION y MOVE", async () => {
    const match = new ConnectFourMatch({
      prologUrl: `http://localhost:${prologPort}`,
      level: 1, // Nivel 1 para respuesta inmediata (profundidad 2)
    });

    const emittedEvents: GameEvent[] = [];
    match.on("event", (ev: GameEvent) => emittedEvents.push(ev));

    const human = new HumanPlayer("p-fabian", "Fabián");
    match.addPlayer(human);

    // Humano juega columna 3
    await match.handleAction(human.id, { column: 3 });

    // Esperar respuesta de Prolog
    for (let i = 0; i < 20; i++) {
      if (emittedEvents.some((e) => e.type === "AI_DECISION")) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const aiEvent = emittedEvents.find((e) => e.type === "AI_DECISION");
    expect(aiEvent).toBeDefined();
    expect(aiEvent?.data.column).toBeGreaterThanOrEqual(0);
    expect(aiEvent?.data.column).toBeLessThanOrEqual(6);
    expect(aiEvent?.data.nodes).toBeGreaterThan(0);
    expect(aiEvent?.data.timeMs).toBeDefined();

    // Comprobar que en el tablero hay 2 fichas: la humana y la de la IA
    const matrix = match.getBoard().toMatrix();
    let countDiscs = 0;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        if (matrix[r][c] !== 0) countDiscs++;
      }
    }
    expect(countDiscs).toBe(2);
  });
});
