import { ApiClient, ApiError, Game, MatchAnalysis } from "./api/ApiClient.js";
import { CONSOLE_GAMES, renderGame, renderGeneral } from "./panel/StatsRender.js";

/** El enunciado pide actualización en vivo; la guía fija polling cada 2 segundos. */
export const PANEL_REFRESH_MS = 2000;
import {
  clearRecentMatches,
  isCurrentSessionMatch,
  readRecentMatches,
  RecentMatch,
} from "./api/MatchHistory.js";

interface MatchResultView {
  match: RecentMatch;
  analysis?: MatchAnalysis;
  error?: string;
}

export class PanelView {
  private readonly timer: number;
  private loading = false;
  private destroyed = false;
  private refreshVersion = 0;
  private statsLoading = false;
  private games: Game[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly api: ApiClient,
    private readonly navigate: (path: string) => void
  ) {
    this.root.innerHTML = `
      <section class="page-heading">
        <p class="eyebrow">ANÁLISIS DE GAMESTATS</p>
        <h1>Panel de estadísticas</h1>
        <p class="muted">Todos los números los calcula GameStats; la consola solo los muestra. Se actualiza cada 2 segundos, y cada partida aparece al terminar (GameStats la analiza cuando recibe MATCH_FINISHED).</p>
        <p class="muted stats-updated" data-stats-updated aria-live="polite"></p>
        <a class="button button-quiet" href="/" data-back>← Volver a la consola</a>
      </section>
      <section class="stats-zone" aria-labelledby="general-title">
        <div class="section-heading">
          <div><p class="eyebrow">TODOS LOS JUEGOS</p><h2 id="general-title">Generales</h2></div>
        </div>
        <div data-general-stats><p class="muted">Cargando estadísticas generales…</p></div>
      </section>
      <section class="stats-zone" aria-labelledby="per-game-title">
        <div class="section-heading">
          <div><p class="eyebrow">UNO POR UNO</p><h2 id="per-game-title">Por juego</h2></div>
        </div>
        <div class="analytics-list" data-game-stats-list><p class="muted">Cargando estadísticas por juego…</p></div>
        <p class="error-message" data-stats-error role="alert"></p>
      </section>
      <section class="stats-zone" aria-labelledby="results-title">
        <div class="section-heading">
          <div><p class="eyebrow">PARTIDAS DE ESTA PESTAÑA</p><h2 id="results-title">Sesión actual</h2></div>
        </div>
        <p class="muted">Partidas que creaste desde esta pestaña. Esto no es una lista de partidas activas.</p>
        <div class="analytics-list" data-current-results aria-live="polite"><p class="muted">Cargando resultados…</p></div>
      </section>
      <section class="history-section" aria-labelledby="history-title">
        <div class="section-heading">
          <div><p class="eyebrow">HISTORIAL GUARDADO EN ESTE NAVEGADOR</p><h2 id="history-title">Sesiones anteriores</h2></div>
          <button class="button button-quiet" type="button" data-clear-history>Limpiar historial local</button>
        </div>
        <p class="muted">Resultados de otras pestañas o sesiones. Eliminar esta lista no borra los análisis almacenados por GameStats.</p>
        <div class="analytics-list" data-history-results aria-live="polite"><p class="muted">Cargando historial…</p></div>
        <p class="error-message" data-error role="alert"></p>
      </section>`;

    this.root.querySelector("[data-back]")?.addEventListener("click", this.onBack);
    this.root.querySelector("[data-clear-history]")?.addEventListener("click", this.onClearHistory);
    void this.refresh();
    void this.refreshStats();
    this.timer = window.setInterval(() => {
      void this.refresh();
      void this.refreshStats();
    }, PANEL_REFRESH_MS);
  }

  /** Pide a GameStats (vía el proxy /api/stats/*) los resúmenes y los dibuja. Nada se calcula aquí. */
  private async refreshStats(): Promise<void> {
    if (this.statsLoading || this.destroyed) {
      return;
    }
    this.statsLoading = true;
    const error = this.root.querySelector<HTMLElement>("[data-stats-error]");
    try {
      if (this.games.length === 0) {
        this.games = await this.api.getGames().catch(() => []);
      }
      const [general, ...perGame] = await Promise.all([
        this.api.getGeneralStats(),
        ...CONSOLE_GAMES.map((gameId) => this.api.getGameStats(gameId)),
      ]);
      if (this.destroyed) {
        return;
      }
      const generalTarget = this.root.querySelector<HTMLElement>("[data-general-stats]");
      const gamesTarget = this.root.querySelector<HTMLElement>("[data-game-stats-list]");
      const updated = this.root.querySelector<HTMLElement>("[data-stats-updated]");
      if (generalTarget) generalTarget.innerHTML = renderGeneral(general, this.games);
      if (gamesTarget) gamesTarget.innerHTML = perGame.map((stats) => renderGame(stats, this.games)).join("");
      if (updated) updated.textContent = `Última actualización: ${new Date().toLocaleTimeString()}`;
      if (error) error.textContent = "";
    } catch (failure) {
      if (!this.destroyed && error) {
        error.textContent = `No se pudo consultar GameStats: ${errorMessage(failure)}. Se reintentará en 2 s.`;
      }
    } finally {
      this.statsLoading = false;
    }
  }

  public destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.timer);
    this.root.querySelector("[data-back]")?.removeEventListener("click", this.onBack);
    this.root.querySelector("[data-clear-history]")?.removeEventListener("click", this.onClearHistory);
  }

  private readonly onBack = (event: Event): void => {
    event.preventDefault();
    this.navigate("/");
  };

  private readonly onClearHistory = (): void => {
    if (!window.confirm("¿Quitar de este navegador la lista local de resultados? Esto no borra los análisis de GameStats y no se puede deshacer.")) {
      return;
    }
    clearRecentMatches();
    this.refreshVersion++;
    this.render([], []);
  };

  private async refresh(): Promise<void> {
    if (this.loading || this.destroyed) {
      return;
    }
    this.loading = true;
    const version = ++this.refreshVersion;
    try {
      const recent = readRecentMatches();
      const results = await Promise.all(recent.map(async (match): Promise<MatchResultView> => {
        try {
          return { match, analysis: await this.api.getMatchAnalysis(match.matchId, match.gameId) };
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            return { match };
          }
          return { match, error: errorMessage(error) };
        }
      }));
      if (!this.destroyed && version === this.refreshVersion) {
        this.render(
          results.filter(({ match }) => isCurrentSessionMatch(match)),
          results.filter(({ match }) => !isCurrentSessionMatch(match))
        );
      }
    } catch (error) {
      if (!this.destroyed && version === this.refreshVersion) {
        this.renderError(`No se pudo cargar el historial: ${errorMessage(error)}`);
      }
    } finally {
      this.loading = false;
    }
  }

  private render(current: MatchResultView[], history: MatchResultView[]): void {
    const currentTarget = this.root.querySelector<HTMLElement>("[data-current-results]");
    const historyTarget = this.root.querySelector<HTMLElement>("[data-history-results]");
    const error = this.root.querySelector<HTMLElement>("[data-error]");
    if (!currentTarget || !historyTarget || !error) {
      return;
    }
    error.textContent = "";
    currentTarget.innerHTML = current.length
      ? current.map((item) => this.renderMatch(item)).join("")
      : '<p class="muted">Todavía no has creado partidas desde esta pestaña. Los resultados anteriores están en el historial.</p>';
    historyTarget.innerHTML = history.length
      ? history.map((item) => this.renderMatch(item)).join("")
      : '<p class="muted">No hay resultados anteriores guardados en este navegador.</p>';
  }

  private renderMatch(item: MatchResultView): string {
    const analysis = item.analysis;
    const player = analysis?.players.find((entry) => entry.playerId === item.match.playerId);
    const content = analysis
      ? renderMetrics(item.match, analysis, player)
      : `<p class="muted">${item.error
        ? `No se pudo consultar GameStats: ${escapeHtml(item.error)}`
        : "Esperando el análisis de GameStats… Se actualizará automáticamente."}</p>`;
    return `<article class="analytics-card">
      <div class="analytics-card-heading">
        <div><p class="eyebrow">${escapeHtml(item.match.gameId)}</p><h3>Partida ${escapeHtml(item.match.matchId.slice(0, 8))}</h3></div>
        <span class="status-pill">${analysis
          ? analysis.complete ? "Analizada" : `Parcial · ${escapeHtml(analysis.status)}`
          : item.error ? "Error" : "Procesando"}</span>
      </div>
      ${content}
      <p class="muted analytics-date">Jugaste el ${escapeHtml(new Date(item.match.playedAt).toLocaleString())}</p>
    </article>`;
  }

  private renderError(message: string): void {
    const error = this.root.querySelector<HTMLElement>("[data-error]");
    if (error) {
      error.textContent = message;
    }
  }
}

function renderMetrics(
  match: RecentMatch,
  analysis: MatchAnalysis,
  player: MatchAnalysis["players"][number] | undefined
): string {
  const fields: Record<string, string[]> = {
    "connect-four": ["result", "winnerId", "moves", "durationMs", "totalNodes", "avgAiTimeMs"],
    "snake-arena": ["result", "score", "length", "foodEaten", "deathCause", "durationMs"],
    "memory-match": ["result", "pairs", "attempts", "flips", "accuracy", "durationMs"],
  };
  const keys = fields[match.gameId] ?? ["result", "durationMs"];
  const metrics = keys
    .filter((key) => analysis[key] !== undefined && analysis[key] !== null)
    .map((key) => `<div><dt>${escapeHtml(metricLabel(key))}</dt><dd>${escapeHtml(metricValue(key, analysis[key], match))}</dd></div>`)
    .join("");
  const playerMetrics = player && match.gameId === "connect-four"
    ? `<div><dt>Tus jugadas</dt><dd>${escapeHtml(String(player.moves ?? 0))}</dd></div>`
    : "";
  const status = analysis.complete ? "" : '<p class="muted">Partida incompleta; las estadísticas disponibles son parciales.</p>';
  return `${status}<dl class="analytics-metrics">${metrics}${playerMetrics}</dl>`;
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    result: "Resultado",
    winnerId: "Ganador",
    moves: "Movimientos",
    durationMs: "Duración",
    totalNodes: "Nodos de IA",
    avgAiTimeMs: "Tiempo medio de IA",
    score: "Puntuación",
    length: "Longitud final",
    foodEaten: "Comidas",
    deathCause: "Causa de fin",
    pairs: "Pares encontrados",
    attempts: "Intentos",
    flips: "Cartas volteadas",
    accuracy: "Precisión",
  };
  return labels[key] ?? key;
}

function metricValue(key: string, value: unknown, match: RecentMatch): string {
  if (key === "result") {
    return value === "WIN" ? "Victoria" : value === "LOSS" ? "Derrota" : value === "DRAW" ? "Empate" : String(value);
  }
  if (key === "durationMs" && typeof value === "number") {
    return `${(value / 1000).toFixed(1)} s`;
  }
  if (key === "avgAiTimeMs" && typeof value === "number") {
    return `${value.toFixed(1)} ms`;
  }
  if (key === "accuracy" && typeof value === "number") {
    return `${(value * 100).toFixed(0)}%`;
  }
  if (key === "winnerId") {
    return value === match.playerId ? "Tú" : "Oponente";
  }
  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
