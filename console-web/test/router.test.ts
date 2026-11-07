import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/router.js";

describe("parseRoute", () => {
  it("reconoce consola, panel y partidas", () => {
    expect(parseRoute("/")).toEqual({ kind: "console" });
    expect(parseRoute("/panel")).toEqual({ kind: "panel" });
    expect(parseRoute("/play/connect-four/m-123")).toEqual({
      kind: "play",
      gameId: "connect-four",
      matchId: "m-123",
    });
  });

  it("decodifica segmentos y rechaza rutas desconocidas", () => {
    expect(parseRoute("/play/my%20game/m%2F123")).toEqual({
      kind: "play",
      gameId: "my game",
      matchId: "m/123",
    });
    expect(parseRoute("/unknown")).toEqual({ kind: "not-found" });
  });
});
