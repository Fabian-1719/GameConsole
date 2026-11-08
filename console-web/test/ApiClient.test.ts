import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/api/ApiClient.js";

describe("ApiClient", () => {
  it("lee catálogo y partidas desde los endpoints reales", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([
        { id: "connect-four", name: "Cuatro en Línea", description: "Juego", version: "1.0" },
      ]))
      .mockResolvedValueOnce(Response.json([
        { matchId: "m-1", gameId: "connect-four", status: "RUNNING", startedAt: "2026-01-01T00:00:00.000Z", playersCount: 2 },
      ]));
    const api = new ApiClient(fetcher);

    await expect(api.getGames()).resolves.toMatchObject([{ id: "connect-four", version: "1.0" }]);
    await expect(api.getMatches()).resolves.toMatchObject([{ matchId: "m-1", playersCount: 2 }]);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/games", undefined);
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/matches", undefined);
  });

  it("envía la creación con gameId y options", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ matchId: "m-1", gameId: "connect-four", playerId: "p-1" })
    );
    const api = new ApiClient(fetcher);

    await expect(api.createMatch("connect-four", { level: 2 })).resolves.toEqual({
      matchId: "m-1",
      gameId: "connect-four",
      playerId: "p-1",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: "connect-four", options: { level: 2 } }),
    });
  });

  it("consulta el análisis de una partida usando el gameId", async () => {
    const analysis = { matchId: "m/1", gameId: "snake-arena", complete: true, score: 30 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(analysis));
    const api = new ApiClient(fetcher);

    await expect(api.getMatchAnalysis("m/1", "snake-arena")).resolves.toEqual(analysis);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/analytics/matches/m%2F1?gameId=snake-arena",
      undefined
    );
  });

  it("propaga errores HTTP", async () => {
    const api = new ApiClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(api.getGames()).rejects.toThrow("HTTP 503");
  });
});
