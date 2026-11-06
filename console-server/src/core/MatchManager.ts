import { Match, MatchOptions } from "./Match.js";
import { GameRegistry } from "./GameRegistry.js";

export interface MatchSummary {
  matchId: string;
  gameId: string;
  status: string;
  startedAt: string;
  playersCount: number;
}

/**
 * Administrador del ciclo de vida y concurrencia de partidas.
 * Garantiza aislamiento y evita estados globales compartidos entre partidas.
 */
export class MatchManager {
  private matches = new Map<string, Match>();

  constructor(private readonly registry: GameRegistry) {}

  public createMatch(gameId: string, options?: MatchOptions): Match {
    const game = this.registry.get(gameId);
    if (!game) {
      throw new Error(`Juego desconocido: "${gameId}"`);
    }

    const match = game.createMatch(options);
    this.matches.set(match.matchId, match);

    // Al finalizar, no se borra de inmediato para permitir consultas finales
    match.on("finished", () => {
      // Dejar disponible para auditoria o consulta
    });

    return match;
  }

  public getMatch(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  public listActive(): MatchSummary[] {
    return Array.from(this.matches.values()).map((m) => ({
      matchId: m.matchId,
      gameId: m.gameId,
      status: m.status,
      startedAt: m.startedAt.toISOString(),
      playersCount: m.players.length,
    }));
  }

  public cleanupFinished(maxAgeMs = 5 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, match] of this.matches.entries()) {
      if (
        match.status === "FINISHED" &&
        match.finishedAt &&
        now - match.finishedAt.getTime() > maxAgeMs
      ) {
        this.matches.delete(id);
        removed++;
      }
    }

    return removed;
  }

  public closeAll(reason = "SHUTDOWN"): void {
    for (const match of this.matches.values()) {
      if (match.status !== "FINISHED") {
        match.finish("ABANDONED", null, { reason });
      }
    }
    this.matches.clear();
  }
}
