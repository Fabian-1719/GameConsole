import "dotenv/config";

export interface Config {
  port: number;
  host: string;
  gamestatsUrl: string;
  analyticsUrl: string;
  prologUrl: string;
  outboxPath: string;
  publisherWorkers: number;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    gamestatsUrl: process.env.GAMESTATS_URL || "http://localhost:8080",
    analyticsUrl: process.env.ANALYTICS_URL || "http://localhost:8081",
    prologUrl: process.env.PROLOG_URL || "http://localhost:5000",
    outboxPath: process.env.OUTBOX_PATH || "outbox.ndjson",
    publisherWorkers: parseInt(process.env.PUBLISHER_WORKERS || "4", 10),
  };
}
