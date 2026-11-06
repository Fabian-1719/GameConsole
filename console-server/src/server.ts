import Fastify, { FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { GameRegistry } from "./core/GameRegistry.js";
import { MatchManager } from "./core/MatchManager.js";
import { DummyGame } from "./core/DummyGame.js";
import { registerRoutes } from "./api/routes.js";

export interface BuildServerOptions {
  registry?: GameRegistry;
  matchManager?: MatchManager;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<{
  server: FastifyInstance;
  registry: GameRegistry;
  matchManager: MatchManager;
}> {
  const server = Fastify({ logger: false });

  await server.register(fastifyCors, { origin: true });
  await server.register(fastifyWebsocket);

  const registry = options.registry ?? new GameRegistry();
  // Registrar DummyGame para pruebas del nucleo
  if (!registry.has("dummy-game")) {
    registry.register(new DummyGame());
  }

  const matchManager = options.matchManager ?? new MatchManager(registry);

  registerRoutes(server, registry, matchManager);

  return { server, registry, matchManager };
}
