import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";

describe("API REST de console-server", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    const app = await buildServer();
    server = app.server;
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /health responde 200 con estado ok", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("GET /api/games retorna la lista de juegos registrados", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/games",
    });

    expect(res.statusCode).toBe(200);
    const games = JSON.parse(res.payload);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThanOrEqual(1);
    expect(games[0].id).toBe("dummy-game");
  });

  it("POST /api/matches crea una nueva partida y retorna matchId y playerId", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: {
        gameId: "dummy-game",
        options: { playerName: "Jugador Test" },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.matchId).toMatch(/^m-/);
    expect(body.gameId).toBe("dummy-game");
    expect(body.playerId).toMatch(/^p-/);
  });

  it("GET /api/matches lista las partidas activas", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/matches",
    });

    expect(res.statusCode).toBe(200);
    const matches = JSON.parse(res.payload);
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
