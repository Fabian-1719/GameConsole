import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRecentMatches,
  getCurrentSessionId,
  isCurrentSessionMatch,
  readRecentMatches,
  recordRecentMatch,
} from "../src/api/MatchHistory.js";

describe("historial local de partidas", () => {
  const entries = new Map<string, string>();
  const sessionEntries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
  const sessionStorage = {
    getItem: (key: string) => sessionEntries.get(key) ?? null,
    setItem: (key: string, value: string) => sessionEntries.set(key, value),
  };

  afterEach(() => {
    entries.clear();
    sessionEntries.clear();
    vi.unstubAllGlobals();
  });

  function useStorage(): void {
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("crypto", { randomUUID: () => "tab-session-1" });
  }

  it("guarda los IDs de jugador y conserva solo las 20 partidas recientes", () => {
    useStorage();
    for (let index = 0; index < 21; index++) {
      recordRecentMatch({
        matchId: `m-${index}`,
        gameId: "snake-arena",
        playerId: `p-${index}`,
      });
    }

    const recent = readRecentMatches();
    expect(recent).toHaveLength(20);
    expect(recent[0].matchId).toBe("m-20");
    expect(recent.at(-1)?.matchId).toBe("m-1");
    expect(recent[0].playerId).toBe("p-20");
  });

  it("distingue partidas de la pestaña actual del historial anterior", () => {
    useStorage();
    recordRecentMatch({ matchId: "m-current", gameId: "snake-arena", playerId: "p-1" });

    const [match] = readRecentMatches();
    expect(match.sessionId).toBe("tab-session-1");
    expect(isCurrentSessionMatch(match)).toBe(true);
    expect(getCurrentSessionId()).toBe("tab-session-1");
    expect(isCurrentSessionMatch({
      matchId: "m-old",
      gameId: "memory-match",
      playerId: "p-2",
      playedAt: new Date().toISOString(),
    })).toBe(false);
  });

  it("permite limpiar los resultados locales", () => {
    useStorage();
    recordRecentMatch({ matchId: "m-current", gameId: "snake-arena", playerId: "p-1" });

    clearRecentMatches();

    expect(readRecentMatches()).toEqual([]);
  });
});
