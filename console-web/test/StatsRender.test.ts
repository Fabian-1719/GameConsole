import { describe, expect, it, vi } from "vitest";
import { ApiClient, GameStats, GeneralStats } from "../src/api/ApiClient.js";
import { renderGame, renderGeneral, percent, seconds } from "../src/panel/StatsRender.js";

const games = [
  { id: "connect-four", name: "Cuatro en Línea", description: "", version: "1.0" },
  { id: "snake-arena", name: "Snake", description: "", version: "1.0" },
  { id: "memory-match", name: "Memoria", description: "", version: "1.0" },
];

describe("Panel de estadísticas", () => {
  it("ApiClient consulta el proxy /api/stats/*", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}));
    const api = new ApiClient(fetcher);
    await api.getGeneralStats();
    await api.getGameStats("snake-arena");
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/stats/general", undefined);
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/stats/games/snake-arena", undefined);
  });

  it("la zona Generales muestra los números tal como llegan de GameStats", () => {
    const general: GeneralStats = {
      totalMatches: 7,
      completedMatches: 6,
      abandonedMatches: 1,
      matchesByGame: { "connect-four": 4, "snake-arena": 3 },
      players: 3,
      events: 120,
    };
    const html = renderGeneral(general, games);
    expect(html).toContain("<dd>7</dd>");
    expect(html).toContain("<dd>120</dd>");
    expect(html).toContain("Partidas · Cuatro en Línea</dt><dd>4</dd>");
    expect(html).toContain("Partidas · Memoria</dt><dd>0</dd>"); // juego sin partidas aparece en 0
  });

  it("la zona Por juego muestra instancias, patrones y nivel contra resultado", () => {
    const stats: GameStats = {
      gameId: "connect-four",
      instances: 3,
      completed: 3,
      wins: 1,
      losses: 2,
      draws: 0,
      abandoned: 0,
      avgDurationMs: 40000,
      players: 2,
      patterns: { LIGHTNING_WIN: 1 },
      metrics: {
        avgMoves: 12,
        avgAiTimeMs: 30,
        totalNodes: 900,
        byLevel: [{ level: 3, matches: 2, humanWins: 0, aiWins: 2, draws: 0, avgAiTimeMs: 40 }],
      },
    };
    const html = renderGame(stats, games);
    expect(html).toContain("3 instancias");
    expect(html).toContain("Instancias ejecutadas</dt><dd>3</dd>");
    expect(html).toContain("Duración promedio</dt><dd>40.0 s</dd>");
    expect(html).toContain("Victorias relámpago</dt><dd>1</dd>");
    expect(html).toContain("Nivel de la IA contra resultado");
    expect(html).toContain("<td>Nivel 3</td>");
  });

  it("los valores vacíos de GameStats se muestran como guion, sin inventar ceros", () => {
    expect(seconds(null)).toBe("—");
    expect(percent(undefined)).toBe("—");
    expect(percent(0.75)).toBe("75%");
  });
});
