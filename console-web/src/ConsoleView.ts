import { ApiClient, Game, MatchSummary } from "./api/ApiClient.js";

type Navigate = (path: string) => void;

export class ConsoleView {
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const element = target.closest<HTMLElement>("[data-action]");
    if (!element) {
      return;
    }
    const { action, gameId, path } = element.dataset;
    if (action === "create" && gameId && element instanceof HTMLButtonElement) {
      void this.createMatch(gameId, element);
    } else if (action === "open" && path) {
      event.preventDefault();
      this.navigate(path);
    }
  };

  private readonly timer: number;
  private destroyed = false;
  private lastMatchesSignature = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly api: ApiClient,
    private readonly navigate: Navigate
  ) {
    this.root.innerHTML = `
      <section class="page-heading">
        <p class="eyebrow">JUEGOS DISPONIBLES</p>
        <h1>Consola</h1>
        <p class="muted">Elige un juego para crear una partida.</p>
        <p class="muted" data-console-status role="status">Cargando catálogo y partidas…</p>
      </section>
      <section aria-labelledby="games-title">
        <h2 id="games-title">Catálogo</h2>
        <div class="game-grid" data-games><p class="muted">Cargando juegos…</p></div>
      </section>
      <section class="matches-section" aria-labelledby="matches-title">
        <div class="section-heading">
          <div><p class="eyebrow">EN VIVO</p><h2 id="matches-title">Partidas activas</h2></div>
          <span class="muted" data-match-count></span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Juego</th><th>Partida</th><th>Estado</th><th>Hora</th><th>Abrir</th></tr></thead>
            <tbody data-matches><tr><td colspan="5" class="muted">Cargando partidas…</td></tr></tbody>
          </table>
        </div>
      </section>
      <p class="error-message" data-error role="alert"></p>`;

    this.root.addEventListener("click", this.onClick);
    void this.loadGames();
    void this.loadMatches();
    this.timer = window.setInterval(() => void this.loadMatches(), 2000);
  }

  public destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.timer);
    this.root.removeEventListener("click", this.onClick);
  }

  private async loadGames(): Promise<void> {
    try {
      const games = await this.api.getGames();
      if (!this.destroyed) {
        this.renderGames(games);
        this.setConsoleStatus("Catálogo actualizado.");
      }
    } catch (error) {
      this.showError(`No se pudo cargar el catálogo: ${errorMessage(error)}`);
    }
  }

  private async loadMatches(): Promise<void> {
    const target = this.root.querySelector<HTMLElement>("[data-console-status]");
    if (target && !this.destroyed) {
      target.textContent = "Actualizando partidas…";
    }
    try {
      const matches = await this.api.getMatches();
      if (!this.destroyed) {
        this.renderMatches(matches);
        this.setConsoleStatus(`Partidas actualizadas a las ${new Date().toLocaleTimeString()}.`);
      }
    } catch (error) {
      this.showError(`No se pudieron actualizar las partidas: ${errorMessage(error)}`);
      this.setConsoleStatus("No se pudo actualizar la lista; se reintentará automáticamente.");
    }
  }

  private renderGames(games: Game[]): void {
    const target = this.root.querySelector<HTMLElement>("[data-games]");
    if (!target) {
      return;
    }
    target.innerHTML = games.length
      ? games.map((game) => `
        <article class="game-card">
          <div class="game-mark" aria-hidden="true">GC</div>
          <p class="eyebrow">${escapeHtml(game.id)}</p>
          <h3>${escapeHtml(game.name)}</h3>
          <p class="muted">${escapeHtml(game.description)}</p>
          <button class="button button-primary" data-action="create" data-game-id="${escapeHtml(game.id)}">
            Nueva partida
          </button>
        </article>`).join("")
      : '<p class="muted">No hay juegos registrados.</p>';
  }

  private renderMatches(matches: MatchSummary[]): void {
    const target = this.root.querySelector<HTMLElement>("[data-matches]");
    const count = this.root.querySelector<HTMLElement>("[data-match-count]");
    if (!target || !count) {
      return;
    }
    count.textContent = `${matches.length} partidas`;
    const markup = matches.length
      ? matches.map((match) => {
        const path = `/play/${encodeURIComponent(match.gameId)}/${encodeURIComponent(match.matchId)}`;
        return `<tr>
          <td><span class="game-pill">${escapeHtml(match.gameId)}</span></td>
          <td class="mono">${escapeHtml(match.matchId.slice(0, 8))}</td>
          <td><span class="status-pill">${escapeHtml(match.status)}</span></td>
          <td>${escapeHtml(new Date(match.startedAt).toLocaleTimeString())}</td>
          <td class="actions">
            <a class="button button-small" href="${escapeHtml(path)}" data-action="open" data-path="${escapeHtml(path)}">Abrir</a>
            <a class="button button-small button-quiet" href="${escapeHtml(path)}?spectator=1" target="_blank" rel="noopener noreferrer">Ver en otra pestaña</a>
          </td>
        </tr>`;
      }).join("")
      : '<tr><td colspan="5" class="muted">Todavía no hay partidas.</td></tr>';
    const signature = JSON.stringify(matches);
    if (signature !== this.lastMatchesSignature) {
      target.innerHTML = markup;
      this.lastMatchesSignature = signature;
    }
  }

  private async createMatch(gameId: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    this.clearError();
    try {
      const match = await this.api.createMatch(gameId);
      if (this.destroyed) {
        return;
      }
      window.sessionStorage.setItem(`player:${match.matchId}`, match.playerId);
      this.navigate(`/play/${encodeURIComponent(match.gameId)}/${encodeURIComponent(match.matchId)}`);
    } catch (error) {
      this.showError(error);
      button.disabled = false;
    }
  }

  private showError(error: unknown): void {
    if (this.destroyed) {
      return;
    }
    const target = this.root.querySelector<HTMLElement>("[data-error]");
    if (target) {
      target.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private setConsoleStatus(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-console-status]");
    if (target) {
      target.textContent = message;
    }
  }

  private clearError(): void {
    const target = this.root.querySelector<HTMLElement>("[data-error]");
    if (target) {
      target.textContent = "";
    }
  }
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
