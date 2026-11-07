import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanPlayer } from "../src/core/Player.js";
import { EventPublisher } from "../src/events/EventPublisher.js";
import { SnakeMatch } from "../src/games/snake/SnakeMatch.js";
import { buildServer } from "../src/server.js";

describe("Snake server lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers Snake and clears its timer when the server closes", async () => {
    const publisher = {
      start: vi.fn(),
      publish: vi.fn(),
      flushMatch: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventPublisher;
    const app = await buildServer({ publisher });
    await app.server.ready();
    const games = await app.server.inject({ method: "GET", url: "/api/games" });
    expect(JSON.parse(games.payload).map((game: { id: string }) => game.id)).toContain("snake-arena");

    const clearInterval = vi.spyOn(globalThis, "clearInterval");
    const match = app.matchManager.createMatch("snake-arena", { tickMs: 100_000 }) as SnakeMatch;
    const player = new HumanPlayer("p-shutdown-test", "Shutdown test");
    match.addPlayer(player);

    await app.server.close();

    expect(match.status).toBe("FINISHED");
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(publisher.stop).toHaveBeenCalledOnce();
  });
});
