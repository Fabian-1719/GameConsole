import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WebSocket } from "ws";
import { promises as fs } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MatchManager } from "../core/MatchManager.js";
import { GameRegistry } from "../core/GameRegistry.js";
import { HumanPlayer } from "../core/Player.js";
import { EventFactory } from "../events/EventFactory.js";

const consoleWebRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../console-web/dist");

interface CreateMatchBody {
  gameId: string;
  options?: {
    playerName?: string;
    level?: number;
    [key: string]: unknown;
  };
}

export function registerRoutes(
  server: FastifyInstance,
  registry: GameRegistry,
  matchManager: MatchManager
): void {
  // GET / y GET /connect4 (Pagina minima de prueba HTML)
  const serveHtml = async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const htmlPath = join(process.cwd(), "public", "connect4-test.html");
      const content = await fs.readFile(htmlPath, "utf8");
      return reply.type("text/html").send(content);
    } catch {
      return reply.status(404).send({ error: "connect4-test.html no encontrado" });
    }
  };

  server.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    if (await fileExists(resolve(consoleWebRoot, "index.html"))) {
      return serveConsoleWeb(req, reply);
    }
    return serveHtml(req, reply);
  });
  server.get("/connect4", serveHtml);

  // GET /health
  server.get("/health", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });

  // GET /api/games
  server.get("/api/games", async (_req: FastifyRequest, reply: FastifyReply) => {
    const games = registry.getAll().map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      version: g.version,
    }));
    return reply.send(games);
  });

  // GET /api/matches
  server.get("/api/matches", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(matchManager.listActive());
  });

  // POST /api/matches
  server.post("/api/matches", async (req: FastifyRequest<{ Body: CreateMatchBody }>, reply: FastifyReply) => {
    const { gameId, options = {} } = req.body || {};
    if (!gameId) {
      return reply.status(400).send({ error: "gameId es obligatorio" });
    }

    try {
      const match = matchManager.createMatch(gameId, options);
      const playerName = options.playerName || "Jugador Humano";
      const playerId = EventFactory.createPlayerId();
      const human = new HumanPlayer(playerId, playerName);
      match.addPlayer(human);

      return reply.status(201).send({
        matchId: match.matchId,
        gameId: match.gameId,
        playerId: human.id,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido al crear partida";
      return reply.status(400).send({ error: message });
    }
  });

  // WS /ws/matches/:matchId
  server.get(
    "/ws/matches/:matchId",
    { websocket: true },
    (socket: WebSocket, req: FastifyRequest<{ Params: { matchId: string }; Querystring: { playerId?: string } }>) => {
      const { matchId } = req.params;
      const playerId = req.query?.playerId;

      const match = matchManager.getMatch(matchId);
      if (!match) {
        socket.send(JSON.stringify({ type: "ERROR", message: `Partida "${matchId}" no encontrada` }));
        socket.close();
        return;
      }

      // Enviar estado inicial
      socket.send(JSON.stringify({ type: "STATE", state: match.getPublicState() }));

      // Suscribirse a difusiones de la partida
      const onState = (state: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "STATE", state }));
        }
      };

      const onFinished = (info: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "FINISHED", ...(info as object) }));
        }
      };

      const onError = (msg: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ERROR", message: String(msg) }));
        }
      };

      match.on("state", onState);
      match.on("finished", onFinished);
      match.on("error", onError);

      socket.on("message", async (data: Buffer | string) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === "ACTION") {
            const actorId = parsed.playerId || playerId || match.players[0]?.id || "anonymous";
            await match.handleAction(actorId, parsed.payload);
          } else {
            socket.send(JSON.stringify({ type: "ERROR", message: `Tipo de mensaje no reconocido: ${parsed.type}` }));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Error al procesar accion";
          socket.send(JSON.stringify({ type: "ERROR", message: msg }));
        }
      });

      socket.on("close", () => {
        match.off("state", onState);
        match.off("finished", onFinished);
        match.off("error", onError);

        // Si la partida sigue activa, tratar desconexion como abandono segun seccion 5.3
        if (match.status === "RUNNING") {
          const pId = playerId || match.players[0]?.id;
          if (pId) {
            match.removePlayer(pId, "WEBSOCKET_CLOSED");
          }
        }
      });
    }
  );

  server.setNotFoundHandler(async (req, reply) => {
    if (!(await fileExists(resolve(consoleWebRoot, "index.html")))) {
      return reply.status(404).send({ error: "Not Found" });
    }
    return serveConsoleWeb(req, reply);
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function serveConsoleWeb(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply> {
  const pathname = new URL(req.url, "http://localhost").pathname;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return reply.status(400).send({ error: "Invalid URL path" });
  }

  if (
    (req.method !== "GET" && req.method !== "HEAD") ||
    decodedPath === "/api" || decodedPath.startsWith("/api/") ||
    decodedPath === "/ws" || decodedPath.startsWith("/ws/") ||
    decodedPath === "/health" || decodedPath.startsWith("/health/")
  ) {
    return reply.status(404).send({ error: "Not Found" });
  }

  const filePath = resolve(consoleWebRoot, `.${decodedPath}`);
  const relativePath = relative(consoleWebRoot, filePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return reply.status(400).send({ error: "Invalid URL path" });
  }

  if (extname(decodedPath)) {
    try {
      const file = await fs.readFile(filePath);
      return reply.type(contentType(filePath)).send(file);
    } catch (error) {
      if (!isNodeError(error) || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) {
        throw error;
      }
      return reply.status(404).send({ error: "Not Found" });
    }
  }

  const indexPath = resolve(consoleWebRoot, "index.html");
  return reply.type("text/html; charset=utf-8").send(await fs.readFile(indexPath));
}

function contentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
