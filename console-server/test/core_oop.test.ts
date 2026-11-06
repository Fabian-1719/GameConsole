import { describe, it, expect } from "vitest";
import { GameRegistry } from "../src/core/GameRegistry.js";
import { MatchManager } from "../src/core/MatchManager.js";
import { ConnectFourGame } from "../src/games/connect-four/ConnectFourGame.js";
import { ConnectFourMatch } from "../src/games/connect-four/ConnectFourMatch.js";
import { HumanPlayer } from "../src/core/Player.js";
import { GameEvent } from "../src/events/contract.js";

describe("Nucleo Orientado a Objetos (Game, Match, Player, Registry, Manager)", () => {
  it("GameRegistry permite registrar y consultar juegos desacoplados", () => {
    const registry = new GameRegistry();
    const game = new ConnectFourGame();

    registry.register(game);
    expect(registry.has("connect-four")).toBe(true);
    expect(registry.get("connect-four")).toBe(game);
    expect(registry.getAll()).toHaveLength(1);

    // No permite duplicados
    expect(() => registry.register(game)).toThrowError(/ya esta registrado/);
  });

  it("MatchManager administra el ciclo de vida de partidas", () => {
    const registry = new GameRegistry();
    registry.register(new ConnectFourGame());
    const manager = new MatchManager(registry);

    const match = manager.createMatch("connect-four");
    expect(match.matchId).toMatch(/^m-/);
    expect(match.gameId).toBe("connect-four");
    expect(match.status).toBe("WAITING");

    expect(manager.getMatch(match.matchId)).toBe(match);
    expect(manager.listActive()).toHaveLength(1);
  });

  it("dos partidas corren a la vez concurrentemente y emiten eventos independientes", async () => {
    const registry = new GameRegistry();
    registry.register(new ConnectFourGame());
    const manager = new MatchManager(registry);

    const matchA = manager.createMatch("connect-four") as ConnectFourMatch;
    const matchB = manager.createMatch("connect-four") as ConnectFourMatch;

    expect(matchA.matchId).not.toBe(matchB.matchId);

    const eventsA: GameEvent[] = [];
    const eventsB: GameEvent[] = [];

    matchA.on("event", (ev: GameEvent) => eventsA.push(ev));
    matchB.on("event", (ev: GameEvent) => eventsB.push(ev));

    const playerA = new HumanPlayer("p-alice", "Alice");
    const playerB = new HumanPlayer("p-bob", "Bob");

    matchA.addPlayer(playerA);
    matchB.addPlayer(playerB);

    expect(matchA.status).toBe("RUNNING");
    expect(matchB.status).toBe("RUNNING");

    // Todos los eventos emitidos por matchA llevan su matchId
    for (const ev of eventsA) {
      expect(ev.matchId).toBe(matchA.matchId);
    }

    // Todos los eventos emitidos por matchB llevan su matchId
    for (const ev of eventsB) {
      expect(ev.matchId).toBe(matchB.matchId);
    }
  });

  it("desconexion de jugador produce abandono y cierre garantizado con MATCH_FINISHED", () => {
    const registry = new GameRegistry();
    registry.register(new ConnectFourGame());
    const manager = new MatchManager(registry);

    const match = manager.createMatch("connect-four") as ConnectFourMatch;
    const events: GameEvent[] = [];
    match.on("event", (ev: GameEvent) => events.push(ev));

    const player = new HumanPlayer("p-carlos", "Carlos");
    match.addPlayer(player);
    expect(match.status).toBe("RUNNING");

    // Simular que el jugador se desconecta
    match.removePlayer(player.id, "TEST_DISCONNECT");

    expect(match.status).toBe("FINISHED");
    const types = events.map((e) => e.type);
    expect(types).toContain("PLAYER_LEFT");
    expect(types).toContain("MATCH_FINISHED");

    const finishEvent = events.find((e) => e.type === "MATCH_FINISHED");
    expect(finishEvent?.data.result).toBe("ABANDONED");
  });
});
