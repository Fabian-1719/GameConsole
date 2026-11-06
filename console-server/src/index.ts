import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { server, matchManager, publisher } = await buildServer({
    publisherOptions: {
      gamestatsUrl: config.gamestatsUrl,
      outboxPath: config.outboxPath,
      workers: config.publisherWorkers,
      logMetrics: true,
    },
  });

  const shutdown = async () => {
    console.log("\nApagando console-server ordenadamente...");
    matchManager.closeAll("SERVER_SHUTDOWN");
    await publisher.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    const address = await server.listen({ port: config.port, host: config.host });
    console.log(`GameConsole server escuchando en ${address}`);
  } catch (err) {
    console.error("Error al iniciar el servidor:", err);
    process.exit(1);
  }
}

main();
