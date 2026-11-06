import { AiPlayer } from "../core/Player.js";

export interface AiDecision {
  column: number;
  level: number;
  nodes: number;
  timeMs: number;
  score: number;
  depthReached: number;
}

export class PrologAiPlayer extends AiPlayer {
  private readonly prologUrl: string;
  private readonly timeoutMs: number;

  constructor(prologUrl = "http://localhost:5000", timeoutMs = 3000) {
    super("cpu-prolog", "Computadora (Prolog)");
    this.prologUrl = prologUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  public async decide(state: { board: number[][]; level?: number }): Promise<AiDecision> {
    const level = state.level ?? 2;
    const body = JSON.stringify({
      board: state.board,
      player: 2,
      level,
    });

    let lastError: Error | null = null;

    // Se realiza la peticion y se reintenta exactamente una vez si falla (Seccion 8.5)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const res = await fetch(`${this.prologUrl}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`Prolog respondio status HTTP ${res.status}`);
        }

        const data = (await res.json()) as any;
        if (typeof data.column !== "number" || data.column < 0 || data.column > 6) {
          throw new Error(`Prolog retorno una columna invalida: ${data.column}`);
        }

        return {
          column: data.column,
          level,
          nodes: data.nodes ?? 1,
          timeMs: data.timeMs ?? 1,
          score: data.score ?? 0,
          depthReached: data.depthReached ?? level * 2,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Regla no negociable 3: Prohibido usar movimientos aleatorios como decision.
    throw new Error(
      `Servicio de IA Prolog inaccesible tras reintento (${lastError?.message}). No se permite respaldo aleatorio.`
    );
  }
}
