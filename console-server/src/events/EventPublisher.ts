import { GameEvent } from "./contract.js";
import { Outbox } from "./Outbox.js";

export interface EventPublisherOptions {
  gamestatsUrl: string;
  workers?: number;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  requestTimeoutMs?: number;
  outboxPath?: string;
  logMetrics?: boolean;
}

export interface PublisherStats {
  batchesSent: number;
  batchesFailed: number;
  batchesOutboxed: number;
  eventsSent: number;
}

interface MatchQueue {
  events: GameEvent[];
  timer?: NodeJS.Timeout;
}

/**
 * Publicador concurrente de eventos hacia GameStats.
 * Implementa colas independientes por partida, lotes temporizados, worker pool asincrono,
 * reintentos con backoff exponencial y outbox en disco.
 */
export class EventPublisher {
  private readonly gamestatsUrl: string;
  private readonly workersCount: number;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly requestTimeoutMs: number;
  private readonly outbox: Outbox;
  private readonly logMetrics: boolean;

  private matchQueues = new Map<string, MatchQueue>();
  private pendingBatches: GameEvent[][] = [];
  private activeWorkers = 0;
  private isRunning = false;
  private outboxTimer?: NodeJS.Timeout;

  private stats: PublisherStats = {
    batchesSent: 0,
    batchesFailed: 0,
    batchesOutboxed: 0,
    eventsSent: 0,
  };

  constructor(options: EventPublisherOptions) {
    this.gamestatsUrl = options.gamestatsUrl.replace(/\/+$/, "");
    this.workersCount = Math.max(1, options.workers ?? 4);
    this.maxBatchSize = Math.max(1, options.maxBatchSize ?? 20);
    this.flushIntervalMs = Math.max(10, options.flushIntervalMs ?? 200);
    this.maxRetries = Math.max(0, options.maxRetries ?? 5);
    this.initialBackoffMs = Math.max(50, options.initialBackoffMs ?? 200);
    this.requestTimeoutMs = Math.max(500, options.requestTimeoutMs ?? 3000);
    this.outbox = new Outbox(options.outboxPath ?? "outbox.ndjson");
    this.logMetrics = options.logMetrics ?? false;
  }

  public getStats(): PublisherStats {
    return { ...this.stats };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Procesar outbox pendiente al iniciar
    void this.processOutbox();

    // Reintentar vaciar el outbox periodicamente cada 30 segundos
    this.outboxTimer = setInterval(() => {
      void this.processOutbox();
    }, 30_000);
    this.outboxTimer.unref();
  }

  /**
   * Envia un evento. Es completamente no bloqueante (nunca espera I/O).
   */
  public publish(event: GameEvent): void {
    let queue = this.matchQueues.get(event.matchId);
    if (!queue) {
      queue = { events: [] };
      this.matchQueues.set(event.matchId, queue);
    }

    queue.events.push(event);

    if (queue.events.length >= this.maxBatchSize) {
      this.flushQueue(event.matchId, queue);
    } else if (!queue.timer) {
      queue.timer = setTimeout(() => {
        this.flushQueue(event.matchId, queue!);
      }, this.flushIntervalMs);
      queue.timer.unref();
    }
  }

  /**
   * Realiza un flush inmediato de la cola de una partida (ej. al terminar).
   */
  public async flushMatch(matchId: string): Promise<void> {
    const queue = this.matchQueues.get(matchId);
    if (queue) {
      this.flushQueue(matchId, queue);
    }
  }

  /**
   * Realiza flush de todas las colas activas y espera a que los workers procesen los lotes.
   */
  public async flushAll(): Promise<void> {
    for (const [matchId, queue] of this.matchQueues.entries()) {
      this.flushQueue(matchId, queue);
    }

    // Esperar a que la cola interna de lotes se vacie
    while (this.pendingBatches.length > 0 || this.activeWorkers > 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  public async stop(): Promise<void> {
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
      this.outboxTimer = undefined;
    }

    // Vaciar todas las colas
    for (const [matchId, queue] of this.matchQueues.entries()) {
      this.flushQueue(matchId, queue);
    }

    // Si quedan lotes que no alcanzaron a enviarse, guardarlos directamente en el outbox
    if (this.pendingBatches.length > 0) {
      for (const batch of this.pendingBatches) {
        await this.outbox.save(batch);
        this.stats.batchesOutboxed++;
      }
      this.pendingBatches = [];
    }

    this.isRunning = false;
  }

  private flushQueue(matchId: string, queue: MatchQueue): void {
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }

    if (queue.events.length === 0) return;

    const batch = [...queue.events];
    queue.events = [];
    this.matchQueues.delete(matchId);

    this.enqueueBatch(batch);
  }

  private enqueueBatch(batch: GameEvent[]): void {
    this.pendingBatches.push(batch);
    this.spawnWorkers();
  }

  private spawnWorkers(): void {
    while (this.activeWorkers < this.workersCount && this.pendingBatches.length > 0) {
      const batch = this.pendingBatches.shift();
      if (!batch) break;

      this.activeWorkers++;
      void this.dispatchBatch(batch).finally(() => {
        this.activeWorkers--;
        this.spawnWorkers();
      });
    }
  }

  private async dispatchBatch(batch: GameEvent[]): Promise<void> {
    const success = await this.sendWithRetry(batch);
    if (success) {
      this.stats.batchesSent++;
      this.stats.eventsSent += batch.length;
      if (this.logMetrics) {
        console.log(`[EventPublisher] Lote enviado: partida=${batch[0]?.matchId} eventos=${batch.length}`);
      }
    } else {
      this.stats.batchesFailed++;
      this.stats.batchesOutboxed++;
      console.error(`[EventPublisher] Falló el envío; lote guardado en outbox: partida=${batch[0]?.matchId}`);
      await this.outbox.save(batch);
    }
  }

  private async sendWithRetry(batch: GameEvent[]): Promise<boolean> {
    let backoff = this.initialBackoffMs;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2; // Backoff exponencial
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

        const res = await fetch(`${this.gamestatsUrl}/v1/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 207) {
          const result = (await res.json()) as {
            accepted?: number;
            rejected?: number;
            errors?: Array<{ eventId?: string; reason?: string }>;
          };
          if (typeof result.rejected !== "number" || result.rejected > 0) {
            console.error(
              `[EventPublisher] GameStats rechazó eventos: aceptados=${result.accepted ?? "?"} ` +
                `rechazados=${result.rejected ?? "?"} errores=${JSON.stringify(result.errors ?? [])}`
            );
            return false;
          }
        }

        // Go responde 202 cuando acepta todos los eventos.
        if (res.status >= 200 && res.status < 300) {
          return true;
        }

        // 4xx no recuperable (salvo 429 Too Many Requests)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const body = await res.text();
          console.error(
            `[EventPublisher] GameStats respondió HTTP ${res.status} para partida=${batch[0]?.matchId}: ${body}`
          );
          return false;
        }
      } catch {
        // Error de red, abort o timeout: continuar con el siguiente reintento
      }
    }

    return false;
  }

  private async processOutbox(): Promise<void> {
    try {
      const batches = await this.outbox.drain();
      for (const batch of batches) {
        this.enqueueBatch(batch);
      }
    } catch {
      // Ignorar error temporal de acceso al archivo
    }
  }
}
