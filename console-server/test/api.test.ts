import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import http from "node:http";
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
    expect(games.map((game: { id: string }) => game.id)).toContain("snake-arena");
    expect(games.map((game: { id: string }) => game.id)).toContain("memory-match");
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

  it("POST /api/matches crea una partida de Memoria con el juego registrado", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/matches",
      payload: { gameId: "memory-match", options: { seed: 7 } },
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.payload).gameId).toBe("memory-match");
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

  it("GET /api/analytics/matches/:id consulta Scala y conserva el filtro de juego", async () => {
    const analysis = { matchId: "m-analytics", gameId: "snake-arena", complete: true, score: 30 };
    let requestPath = "";
    const analyticsServer = http.createServer((request, response) => {
      requestPath = request.url ?? "";
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(analysis));
    });
    await new Promise<void>((resolve) => analyticsServer.listen(0, resolve));
    const port = (analyticsServer.address() as { port: number }).port;
    const app = await buildServer({ analyticsUrl: `http://127.0.0.1:${port}` });

    try {
      const response = await app.server.inject({
        method: "GET",
        url: "/api/analytics/matches/m-analytics?gameId=snake-arena",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(analysis);
      expect(requestPath).toBe("/v1/matches/m-analytics?gameId=snake-arena");
    } finally {
      await app.server.close();
      await new Promise<void>((resolve) => analyticsServer.close(() => resolve()));
    }
  });

  it("GET /api/analytics/matches/:id informa si GameStats no está disponible", async () => {
    const app = await buildServer({ analyticsUrl: "http://127.0.0.1:1" });
    try {
      const response = await app.server.inject({
        method: "GET",
        url: "/api/analytics/matches/m-unavailable?gameId=memory-match",
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().error).toContain("GameStats");
    } finally {
      await app.server.close();
    }
  });
});
