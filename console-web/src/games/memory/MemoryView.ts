import { MatchFinishedMessage } from "../../net/MatchSocket.js";
import { matchSocketManager } from "../../net/MatchSocketManager.js";

type CardState = "HIDDEN" | "FACEUP" | "MATCHED";

interface MemoryState {
  status: string;
  cards: Array<{ index: number; state: CardState; value?: string }>;
  attempts: number;
  pairsMatched: number;
  pendingHide: boolean;
}

type Navigate = (path: string) => void;

export class MemoryView {
  private readonly unsubscribe: () => void;
  private state?: MemoryState;
  private finished = false;

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-back]")) {
      event.preventDefault();
      this.navigate("/");
      return;
    }
    if (target.closest("[data-new-match]")) {
      void this.createNewMatch().catch((error: unknown) => this.setError(errorMessage(error)));
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-card-index]");
    if (!button || button.disabled || this.spectator || this.finished || !this.state || this.state.pendingHide) {
      return;
    }
    const cardIndex = Number(button.dataset.cardIndex);
    const card = this.state.cards[cardIndex];
    if (!card || card.state !== "HIDDEN") {
      return;
    }
    try {
      matchSocketManager.sendAction(this.matchId, { cardIndex });
    } catch (error) {
      this.setError(errorMessage(error));
    }
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly matchId: string,
    playerId: string,
    private readonly navigate: Navigate,
    private readonly createNewMatch: () => Promise<void>,
    private readonly spectator = false
  ) {
    this.root.innerHTML = `
      <section class="page-heading">
        <p class="eyebrow">PARTIDA · ${escapeHtml(matchId.slice(0, 8))}</p>
        <h1>Memoria</h1>
        <a class="button button-quiet back-button" href="/" data-back>← Volver a la consola</a>
        <p class="muted" data-connection>Conectando a la partida…</p>
      </section>
      <section class="game-layout memory-layout">
        <div class="game-board-wrap memory-board-wrap">
          <div class="memory-grid" data-memory-board aria-label="Tablero de memoria"></div>
          <div class="memory-finish-overlay" data-finish-overlay hidden>
            <p class="eyebrow">PARTIDA FINALIZADA</p>
            <h2 data-finish-title>¡Completaste los pares!</h2>
            <p class="muted" data-finish-attempts></p>
            <div class="memory-finished-actions">
              <button class="button button-primary" data-new-match>Nueva partida</button>
              <button class="button button-quiet" data-back>Volver a consola</button>
            </div>
          </div>
        </div>
        <aside class="game-sidebar memory-sidebar">
          <p class="eyebrow">${this.spectator ? "VISTA EN VIVO · ESPECTADOR" : "PARTIDA"}</p>
          <h2>${this.spectator ? "Espectador" : "Tu partida"}</h2>
          <p class="memory-counter" data-attempts>Intentos: 0</p>
          <p class="memory-counter" data-pairs>Pares: 0 / 8</p>
          <p class="muted" data-game-status>Esperando estado del servidor…</p>
          <p class="error-message" data-error role="alert"></p>
        </aside>
      </section>`;

    this.root.addEventListener("click", this.onClick);
    let unsubscribe = (): void => undefined;
    try {
      const entry = matchSocketManager.open(matchId, playerId);
      unsubscribe = matchSocketManager.subscribe(matchId, {
        onOpen: () => this.setConnection("Conectado; recibiendo estado en tiempo real."),
        onState: (state) => this.renderState(state as MemoryState),
        onFinished: (message) => this.renderFinished(message),
        onError: (message) => this.setError(message),
        onClose: () => this.setConnection("Conexión cerrada."),
      });
      if (entry.lastState !== null) {
        this.setConnection("Conectado; recibiendo estado en tiempo real.");
      }
      if (entry.finished) {
        this.renderFinished({ type: "FINISHED", result: "WIN" });
      }
    } catch (error) {
      this.setConnection("Sin conexión.");
      this.setError(errorMessage(error));
    }
    this.unsubscribe = unsubscribe;
  }

  public destroy(): void {
    this.root.removeEventListener("click", this.onClick);
    this.unsubscribe();
  }

  private renderState(state: MemoryState): void {
    this.state = state;
    const board = this.root.querySelector<HTMLElement>("[data-memory-board]");
    const attempts = this.root.querySelector<HTMLElement>("[data-attempts]");
    const pairs = this.root.querySelector<HTMLElement>("[data-pairs]");
    const status = this.root.querySelector<HTMLElement>("[data-game-status]");
    if (!board || !attempts || !pairs || !status) {
      return;
    }

    board.innerHTML = state.cards.map((card) => {
      const revealed = card.state !== "HIDDEN";
      const disabled = this.spectator || this.finished || state.status !== "RUNNING" ||
        state.pendingHide || revealed;
      const label = revealed ? `Carta ${card.index + 1}: ${card.value}` : `Voltear carta ${card.index + 1}`;
      return `
        <button class="memory-card${revealed ? " is-revealed" : ""}${card.state === "MATCHED" ? " is-matched" : ""}"
          type="button" data-card-index="${card.index}" aria-label="${escapeHtml(label)}"
          aria-pressed="${revealed}" ${disabled ? "disabled" : ""}>
          <span class="memory-card-inner">
            <span class="memory-card-back" aria-hidden="true">?</span>
            <span class="memory-card-face" aria-hidden="true">${revealed ? escapeHtml(card.value ?? "") : ""}</span>
          </span>
        </button>`;
    }).join("");
    attempts.textContent = `Intentos: ${state.attempts}`;
    pairs.textContent = `Pares: ${state.pairsMatched} / ${state.cards.length / 2}`;
    status.textContent = state.status === "FINISHED"
      ? "Partida finalizada."
      : state.pendingHide
        ? "No coinciden; observa las cartas."
        : this.spectator
          ? "Partida en curso."
          : "Voltea dos cartas para encontrar un par.";
    this.setError("");
    if (state.status === "FINISHED" && !this.finished) {
      this.renderFinished({ type: "FINISHED", result: "WIN" });
    }
  }

  private renderFinished(message: MatchFinishedMessage): void {
    this.finished = true;
    const extraData = isRecord(message.extraData) ? message.extraData : {};
    const attempts = typeof extraData.attempts === "number" ? extraData.attempts : this.state?.attempts ?? 0;
    const title = this.root.querySelector<HTMLElement>("[data-finish-title]");
    const attemptsLabel = this.root.querySelector<HTMLElement>("[data-finish-attempts]");
    const overlay = this.root.querySelector<HTMLElement>("[data-finish-overlay]");
    if (title) {
      title.textContent = message.result === "WIN" ? "¡Completaste los pares!" : "Partida finalizada";
    }
    if (attemptsLabel) {
      attemptsLabel.textContent = `Lo lograste en ${attempts} intentos.`;
    }
    if (overlay) {
      overlay.hidden = false;
    }
    this.root.querySelectorAll<HTMLButtonElement>("button[data-card-index]").forEach((button) => {
      button.disabled = true;
    });
  }

  private setConnection(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-connection]");
    if (target) {
      target.textContent = message;
    }
  }

  private setError(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-error]");
    if (target) {
      target.textContent = message;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
