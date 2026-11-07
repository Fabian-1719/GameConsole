import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanPlayer } from "../src/core/Player.js";
import { EventPublisher } from "../src/events/EventPublisher.js";
import { MemoryMatch } from "../src/games/memory/MemoryMatch.js";
import { buildServer } from "../src/server.js";

describe("Memory server lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers Memory and clears a pending hide timer when the server closes", async () => {
    vi.useFakeTimers();
    const publisher = {
      start: vi.fn(),
      publish: vi.fn(),
      flushMatch: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventPublisher;
    const app = await buildServer({ publisher });
    await app.server.ready();
    const games = await app.server.inject({ method: "GET", url: "/api/games" });
    expect(JSON.parse(games.payload).map((game: { id: string }) => game.id)).toContain("memory-match");

    const match = app.matchManager.createMatch("memory-match", { pairs: 2, seed: 17 }) as MemoryMatch;
    match.addPlayer(new HumanPlayer("p-memory-shutdown", "Shutdown test"));
    const activeServerTimers = vi.getTimerCount();
    match.handleAction("p-memory-shutdown", { cardIndex: 0 });
    match.handleAction("p-memory-shutdown", { cardIndex: 1 });
    expect(vi.getTimerCount()).toBe(activeServerTimers + 1);

    await app.server.close();

    expect(match.status).toBe("FINISHED");
    expect(vi.getTimerCount()).toBe(activeServerTimers);
    expect(publisher.stop).toHaveBeenCalledOnce();
  });
});
