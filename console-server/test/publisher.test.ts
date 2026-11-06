import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import http from "node:http";
import { EventPublisher } from "../src/events/EventPublisher.js";
import { EventFactory } from "../src/events/EventFactory.js";
import { GameEvent } from "../src/events/contract.js";

describe("EventPublisher (concurrencia, lotes, reintentos y outbox)", () => {
  const outboxTestFile = "test-outbox.ndjson";

  beforeEach(async () => {
    try {
      await fs.unlink(outboxTestFile);
    } catch {
      // Ignorar si no existe
    }
  });

  afterEach(async () => {
    try {
      await fs.unlink(outboxTestFile);
    } catch {
      // Ignorar si no existe
    }
  });

  it("envia lotes a GameStats con workers concurrentes y sin mezclar partidas", async () => {
    const receivedBatches: GameEvent[][] = [];
    const server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/v1/events") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const batch = JSON.parse(body) as GameEvent[];
          receivedBatches.push(batch);
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ accepted: batch.length, rejected: 0 }));
        });
      } else {
        res.writeHead(404).end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const publisher = new EventPublisher({
      gamestatsUrl: `http://localhost:${port}`,
      workers: 4,
      maxBatchSize: 10,
      flushIntervalMs: 50,
      outboxPath: outboxTestFile,
    });

    publisher.start();

    // Simular 20 partidas en paralelo emitiendo eventos
    const matchCount = 20;
    const eventsPerMatch = 8;
    const matchIds: string[] = [];

    for (let m = 0; m < matchCount; m++) {
      const matchId = EventFactory.createMatchId();
      matchIds.push(matchId);

      for (let e = 0; e < eventsPerMatch; e++) {
        publisher.publish(
          EventFactory.create({
            gameId: "connect-four",
            matchId,
            type: "MOVE",
            data: { column: e % 7, row: 0, turn: e + 1 },
          })
        );
      }
    }

    // Flush de todas las partidas
    await publisher.flushAll();
    await publisher.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Verificar que ningun lote mezclo partidas distintas
    for (const batch of receivedBatches) {
      const mId = batch[0].matchId;
      for (const ev of batch) {
        expect(ev.matchId).toBe(mId);
      }
    }

    // Verificar que se recibieron todos los eventos (20 * 8 = 160)
    const totalEvents = receivedBatches.reduce((acc, b) => acc + b.length, 0);
    expect(totalEvents).toBe(matchCount * eventsPerMatch);
    expect(publisher.getStats().batchesSent).toBeGreaterThan(0);
    expect(publisher.getStats().batchesFailed).toBe(0);
  });

  it("con GameStats caido, los lotes van al outbox y se recuperan al reiniciar", async () => {
    // Puerto donde no hay ningun servidor escuchando
    const deadPort = 59999;

    const publisher = new EventPublisher({
      gamestatsUrl: `http://127.0.0.1:${deadPort}`,
      workers: 2,
      maxBatchSize: 5,
      flushIntervalMs: 20,
      maxRetries: 1, // Fallo rapido para el test
      initialBackoffMs: 10,
      outboxPath: outboxTestFile,
    });

    publisher.start();

    const matchId = EventFactory.createMatchId();
    for (let i = 0; i < 6; i++) {
      publisher.publish(
        EventFactory.create({
          gameId: "connect-four",
          matchId,
          type: "MOVE",
          data: { column: i, row: 0, turn: i + 1 },
        })
      );
    }

    await publisher.flushAll();
    await publisher.stop();

    // Comprobar que los eventos se guardaron en el outbox
    const stats = publisher.getStats();
    expect(stats.batchesFailed).toBeGreaterThan(0);
    expect(stats.batchesOutboxed).toBeGreaterThan(0);

    const outboxContent = await fs.readFile(outboxTestFile, "utf8");
    const outboxLines = outboxContent.trim().split("\n");
    expect(outboxLines.length).toBe(6);

    // Ahora levantamos el servidor GameStats
    const recoveredBatches: GameEvent[][] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        recoveredBatches.push(JSON.parse(body));
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const livePort = (server.address() as any).port;

    // Crear un nuevo publisher conectado al servidor vivo reutilizando el mismo outbox
    const recoveredPublisher = new EventPublisher({
      gamestatsUrl: `http://localhost:${livePort}`,
      outboxPath: outboxTestFile,
    });

    recoveredPublisher.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await recoveredPublisher.flushAll();
    await recoveredPublisher.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Verificar que los eventos del outbox fueron enviados exitosamente
    const recoveredCount = recoveredBatches.reduce((acc, b) => acc + b.length, 0);
    expect(recoveredCount).toBe(6);

    // Y el archivo outbox quedo vacio
    const remaining = await fs.readFile(outboxTestFile, "utf8");
    expect(remaining.trim()).toBe("");
  });
});
