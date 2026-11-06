import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { server, matchManager } = await buildServer();

  const shutdown = async () => {
    console.log("\nApagando console-server ordenadamente...");
    matchManager.closeAll("SERVER_SHUTDOWN");
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
