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

  it("sirve la consola web y rutas History API cuando existe el build", async () => {
    const root = await server.inject({ method: "GET", url: "/" });
    const playRoute = await server.inject({
      method: "GET",
      url: "/play/connect-four/m-test",
    });

    expect(root.statusCode).toBe(200);
    expect(root.headers["content-type"]).toContain("text/html");
    expect(playRoute.statusCode).toBe(200);
    expect(playRoute.payload).toBe(root.payload);
  });

  it("no aplica el fallback web a rutas reservadas de API", async () => {
    const response = await server.inject({ method: "GET", url: "/api/not-a-route" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
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
    expect(games[0].id).toBe("connect-four");
  });

  it("POST /api/matches crea una nueva partida y retorna matchId y playerId", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: {
        gameId: "connect-four",
        options: { playerName: "Jugador Test" },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.matchId).toMatch(/^m-/);
    expect(body.gameId).toBe("connect-four");
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
