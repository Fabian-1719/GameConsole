import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { GameEvent } from "./contract.js";

/**
 * Gestiona la persistencia y recuperacion de eventos en disco (outbox.ndjson)
 * cuando GameStats esta inaccesible o se agotan los reintentos.
 */
export class Outbox {
  private isProcessing = false;

  constructor(private readonly filePath: string = "outbox.ndjson") {}

  public get path(): string {
    return this.filePath;
  }

  public async save(events: GameEvent[]): Promise<void> {
    if (events.length === 0) return;

    const dir = dirname(this.filePath);
    if (dir && dir !== ".") {
      await fs.mkdir(dir, { recursive: true });
    }

    const lines = events.map((ev) => JSON.stringify(ev)).join("\n") + "\n";
    await fs.appendFile(this.filePath, lines, "utf8");
  }

  public async count(): Promise<number> {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      return content.split("\n").filter((l) => l.trim().length > 0).length;
    } catch {
      return 0;
    }
  }

  /**
   * Lee y vacia el archivo outbox, agrupando los eventos por partida.
   */
  public async drain(): Promise<GameEvent[][]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    try {
      let content = "";
      try {
        content = await fs.readFile(this.filePath, "utf8");
      } catch {
        return [];
      }

      if (!content.trim()) return [];

      // Renombrar o vaciar archivo para evitar duplicidad de lectura concurrente
      await fs.writeFile(this.filePath, "", "utf8");

      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const eventsByMatch = new Map<string, GameEvent[]>();

      for (const line of lines) {
        try {
          const ev: GameEvent = JSON.parse(line);
          const list = eventsByMatch.get(ev.matchId) ?? [];
          list.push(ev);
          eventsByMatch.set(ev.matchId, list);
        } catch {
          // Linea corrupta ignorada
        }
      }

      return Array.from(eventsByMatch.values());
    } finally {
      this.isProcessing = false;
    }
  }
}
