import { describe, it, expect } from "vitest";
import { EventFactory } from "../src/events/EventFactory.js";

describe("EventFactory y Contrato de Eventos", () => {
  it("genera 1000 matchId unicos con prefijo m- y formato UUID", () => {
    const ids = new Set<string>();
    const count = 1000;
    const uuidRegex = /^m-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (let i = 0; i < count; i++) {
      const id = EventFactory.createMatchId();
      expect(id).toMatch(uuidRegex);
      ids.add(id);
    }

    expect(ids.size).toBe(count);
  });

  it("genera 1000 eventId unicos con prefijo e- y formato UUID", () => {
    const ids = new Set<string>();
    const count = 1000;
    const uuidRegex = /^e-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (let i = 0; i < count; i++) {
      const id = EventFactory.createEventId();
      expect(id).toMatch(uuidRegex);
      ids.add(id);
    }

    expect(ids.size).toBe(count);
  });

  it("cada evento creado contiene todos los campos obligatorios del contrato", () => {
    const matchId = EventFactory.createMatchId();
    const event = EventFactory.create({
      gameId: "connect-four",
      matchId,
      playerId: "p-test1",
      type: "MOVE",
      action: "DROP_DISC",
      data: { column: 3, row: 5, turn: 1 },
    });

    expect(event.eventId).toMatch(/^e-/);
    expect(event.matchId).toBe(matchId);
    expect(event.gameId).toBe("connect-four");
    expect(event.gameVersion).toBe("1.0");
    expect(event.playerId).toBe("p-test1");
    expect(event.type).toBe("MOVE");
    expect(event.action).toBe("DROP_DISC");
    expect(event.data).toEqual({ column: 3, row: 5, turn: 1 });

    // Timestamp ISO 8601 UTC en formato Z
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsedDate = new Date(event.timestamp);
    expect(parsedDate.getTime()).not.toBeNaN();
  });

  it("valida la creacion de los eventos del ciclo de vida", () => {
    const matchId = EventFactory.createMatchId();

    const evStart = EventFactory.matchStarted("connect-four", matchId, {
      mode: "VS_AI",
      players: ["p-1", "cpu-prolog"],
    });
    expect(evStart.type).toBe("MATCH_STARTED");
    expect(evStart.data.mode).toBe("VS_AI");

    const evJoin = EventFactory.playerJoined("connect-four", matchId, "p-1", {
      name: "Alice",
    });
    expect(evJoin.type).toBe("PLAYER_JOINED");
    expect(evJoin.playerId).toBe("p-1");

    const evLeave = EventFactory.playerLeft("connect-four", matchId, "p-1", {
      reason: "TIMEOUT",
    });
    expect(evLeave.type).toBe("PLAYER_LEFT");

    const evFinish = EventFactory.matchFinished("connect-four", matchId, {
      winnerId: "p-1",
      result: "WIN",
      durationMs: 15420,
    });
    expect(evFinish.type).toBe("MATCH_FINISHED");
    expect(evFinish.data.result).toBe("WIN");
  });
});
