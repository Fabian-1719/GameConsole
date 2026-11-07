import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanPlayer } from "../src/core/Player.js";
import { GameEvent } from "../src/events/contract.js";
import { SnakeMatch } from "../src/games/snake/SnakeMatch.js";

function createMatch(options: { size?: number; tickMs?: number; pauseTimeoutMs?: number } = {}): {
  match: SnakeMatch;
  events: GameEvent[];
} {
  const match = new SnakeMatch(options);
  const events: GameEvent[] = [];
  match.on("event", (event: GameEvent) => events.push(event));
  match.addPlayer(new HumanPlayer("p-snake-test", "Snake tester"));
  return { match, events };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SnakeMatch", () => {
  it("finishes with WALL when the snake reaches the edge", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { match, events } = createMatch({ size: 5, tickMs: 100_000 });

    match.tick();
    match.tick();
    match.tick();

    expect(match.status).toBe("FINISHED");
    expect(events.find((event) => event.type === "PLAYER_DIED")?.data.cause).toBe("WALL");
    expect(events.find((event) => event.type === "MATCH_FINISHED")?.data.result).toBe("LOSS");
  });

  it("finishes with SELF when the snake runs into its body", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(53.5 / 97)
      .mockReturnValueOnce(53.5 / 96)
      .mockReturnValue(0);
    const { match, events } = createMatch({ size: 10, tickMs: 100_000 });
    const playerId = "p-snake-test";

    match.tick();
    match.handleAction(playerId, { direction: "UP" });
    match.tick();
    match.handleAction(playerId, { direction: "LEFT" });
    match.tick();
    match.handleAction(playerId, { direction: "DOWN" });
    match.tick();
    match.handleAction(playerId, { direction: "RIGHT" });
    match.tick();
    match.tick();
    match.handleAction(playerId, { direction: "UP" });
    match.tick();
    match.handleAction(playerId, { direction: "LEFT" });
    match.tick();
    match.handleAction(playerId, { direction: "DOWN" });
    match.tick();

    expect(match.status).toBe("FINISHED");
    expect(events.find((event) => event.type === "PLAYER_DIED")?.data.cause).toBe("SELF");
  });

  it("grows and adds ten points when food is eaten", () => {
    vi.spyOn(Math, "random").mockReturnValue(53.5 / 97);
    const { match, events } = createMatch({ size: 10, tickMs: 100_000 });

    match.tick();

    expect(match.getScore()).toBe(10);
    expect(match.getLength()).toBe(4);
    expect(events.find((event) => event.type === "FOOD_EATEN")?.data).toEqual({
      score: 10,
      length: 4,
    });
  });

  it("ignores reverse turns and buffers two turns for consecutive ticks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { match } = createMatch({ tickMs: 100_000 });
    const playerId = "p-snake-test";

    match.handleAction(playerId, { direction: "LEFT" });
    match.handleAction(playerId, { direction: "UP" });
    match.handleAction(playerId, { direction: "LEFT" });
    match.handleAction(playerId, { direction: "DOWN" });
    match.tick();

    expect(match.getDirection()).toBe("UP");
    expect(match.getSnake()[0]).toEqual({ x: 10, y: 9 });
    match.tick();
    expect(match.getDirection()).toBe("LEFT");
    expect(match.getSnake()[0]).toEqual({ x: 9, y: 9 });
  });

  it("pause stops movement, resume restarts it, and neither emits events", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { match, events } = createMatch({ tickMs: 120 });
    const startingEvents = events.length;
    const initialHead = match.getSnake()[0];

    match.handleAction("p-snake-test", { type: "PAUSE" });
    vi.advanceTimersByTime(1200);
    expect(match.status).toBe("RUNNING");
    expect(match.getPublicState().paused).toBe(true);
    expect(match.getSnake()[0]).toEqual(initialHead);
    expect(events).toHaveLength(startingEvents);

    match.handleAction("p-snake-test", { type: "RESUME" });
    vi.advanceTimersByTime(120);
    expect(match.getPublicState().paused).toBe(false);
    expect(match.getSnake()[0]).not.toEqual(initialHead);
    expect(events).toHaveLength(startingEvents);
    match.finish("ABANDONED");
  });

  it("excludes paused time from MATCH_FINISHED duration", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { match, events } = createMatch({ tickMs: 120 });

    vi.advanceTimersByTime(500);
    match.handleAction("p-snake-test", { type: "PAUSE" });
    vi.advanceTimersByTime(5000);
    match.handleAction("p-snake-test", { type: "RESUME" });
    vi.advanceTimersByTime(500);
    match.finish("LOSS");

    expect(events.find((event) => event.type === "MATCH_FINISHED")?.data.durationMs).toBe(1000);
  });

  it("abandons after pause timeout and reports PLAYER_LEFT", () => {
    vi.useFakeTimers();
    const { match, events } = createMatch({ tickMs: 120, pauseTimeoutMs: 1000 });

    match.handleAction("p-snake-test", { type: "PAUSE" });
    vi.advanceTimersByTime(1000);

    expect(match.status).toBe("FINISHED");
    expect(events.find((event) => event.type === "PLAYER_LEFT")?.data.reason).toBe("PAUSE_TIMEOUT");
    expect(events.find((event) => event.type === "MATCH_FINISHED")?.data.result).toBe("ABANDONED");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer when the match finishes or the player abandons", () => {
    vi.useFakeTimers();
    const finished = createMatch({ tickMs: 100 });
    expect(vi.getTimerCount()).toBe(1);
    finished.match.finish("LOSS");
    expect(vi.getTimerCount()).toBe(0);

    const abandoned = createMatch({ tickMs: 100 });
    expect(vi.getTimerCount()).toBe(1);
    abandoned.match.removePlayer("p-snake-test", "WEBSOCKET_CLOSED");
    expect(vi.getTimerCount()).toBe(0);
    expect(abandoned.events.find((event) => event.type === "MATCH_FINISHED")?.data.result).toBe("ABANDONED");
  });

  it("emits no GameStats event on ordinary ticks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { match, events } = createMatch({ tickMs: 100_000 });

    for (let tick = 0; tick < 5; tick++) {
      match.tick();
    }

    expect(events.map((event) => event.type)).toEqual(["MATCH_STARTED", "PLAYER_JOINED"]);
  });

  it("keeps events isolated across five simultaneous matches", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const matches = Array.from({ length: 5 }, () => createMatch({ tickMs: 100_000 }));

    matches.forEach(({ match }) => match.tick());

    for (const { match, events } of matches) {
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.matchId === match.matchId)).toBe(true);
    }
    expect(new Set(matches.map(({ match }) => match.matchId)).size).toBe(5);
    matches.forEach(({ match }) => match.finish("ABANDONED"));
  });
});
