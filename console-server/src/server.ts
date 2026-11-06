import Fastify, { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { GameRegistry } from "./core/GameRegistry.js";
import { MatchManager } from "./core/MatchManager.js";
import { ConnectFourGame } from "./games/connect-four/ConnectFourGame.js";
import { registerRoutes } from "./api/routes.js";
import { EventPublisher, EventPublisherOptions } from "./events/EventPublisher.js";
import { GameEvent } from "./events/contract.js";

export interface BuildServerOptions {
  registry?: GameRegistry;
  matchManager?: MatchManager;
  publisher?: EventPublisher;
  publisherOptions?: EventPublisherOptions;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{
  server: FastifyInstance;
  registry: GameRegistry;
  matchManager: MatchManager;
  publisher: EventPublisher;
}> {
  const server = Fastify({ logger: false });

  await server.register(fastifyCors, { origin: true });
  await server.register(fastifyWebsocket);

  const registry = options.registry ?? new GameRegistry();
  // Registrar juegos oficiales
  if (!registry.has("connect-four")) {
    registry.register(new ConnectFourGame());
  }

  const matchManager = options.matchManager ?? new MatchManager(registry);

  const publisher =
    options.publisher ??
    new EventPublisher(
      options.publisherOptions ?? {
        gamestatsUrl: process.env.GAMESTATS_URL || "http://localhost:8080",
        outboxPath: process.env.OUTBOX_PATH || "outbox.ndjson",
        workers: parseInt(process.env.PUBLISHER_WORKERS || "4", 10),
      }
    );

  publisher.start();

  // Conectar el manager con el publicador: cada partida nueva canaliza sus eventos
  const originalCreate = matchManager.createMatch.bind(matchManager);
  matchManager.createMatch = (gameId: string, opts?: any) => {
    const match = originalCreate(gameId, opts);
    match.on("event", (ev: GameEvent) => {
      publisher.publish(ev);
    });
    match.on("finished", () => {
      void publisher.flushMatch(match.matchId);
    });
    return match;
  };

  registerRoutes(server, registry, matchManager);

  return { server, registry, matchManager, publisher };
}
