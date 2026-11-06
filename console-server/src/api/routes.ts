import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WebSocket } from "ws";
import { MatchManager } from "../core/MatchManager.js";
import { GameRegistry } from "../core/GameRegistry.js";
import { HumanPlayer } from "../core/Player.js";
import { EventFactory } from "../events/EventFactory.js";

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

      match.on("state", onState);
      match.on("finished", onFinished);

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
}
