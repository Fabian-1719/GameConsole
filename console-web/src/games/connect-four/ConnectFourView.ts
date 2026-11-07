import { MatchFinishedMessage, MatchSocket } from "../../net/MatchSocket.js";

interface ConnectFourState {
  status: string;
  board: number[][];
  currentTurnDisc: number;
  movesCount: number;
}

export class ConnectFourView {
  private readonly socket: MatchSocket;
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-column]");
    if (button && !button.disabled) {
      try {
        this.socket.sendAction({ column: Number(button.dataset.column) });
        this.setStatus("Jugada enviada; esperando al servidor…");
      } catch (error) {
        this.setError(error instanceof Error ? error.message : String(error));
        this.setStatus("No se pudo enviar la jugada. Revisa la conexión.");
      }
    }
  };
  private finishedMessage?: string;
  private socketError?: string;
  private currentState?: ConnectFourState;

  constructor(
    private readonly root: HTMLElement,
    matchId: string,
    playerId: string,
    private readonly spectator = false
  ) {
    this.root.innerHTML = `
      <section class="page-heading">
        <p class="eyebrow">PARTIDA · ${escapeHtml(matchId.slice(0, 8))}</p>
        <h1>Cuatro en Línea</h1>
        <a class="button button-quiet back-button" href="/" data-back>← Volver a la consola</a>
        <p class="muted" data-connection>Conectando a la partida…</p>
        ${this.spectator ? "" : '<p class="muted">Aviso: salir de la partida o volver a la consola la marcará como abandonada.</p>'}
      </section>
      <section class="game-layout">
        <div class="game-board-wrap">
          <p class="game-status" data-status>Conectando…</p>
          <div class="connect-four-board" data-board aria-label="Tablero de Cuatro en Línea"></div>
        </div>
        <aside class="game-sidebar">
          <p class="eyebrow">${this.spectator ? "VISTA EN VIVO · ESPECTADOR" : "PARTIDA"}</p>
          <h2>${this.spectator ? "Espectador" : "Tu partida"}</h2>
          <p class="muted" data-turn>Esperando estado del servidor…</p>
          <p class="muted" data-moves>Jugadas: 0</p>
          <p class="error-message" data-error role="alert"></p>
        </aside>
      </section>`;

    this.root.addEventListener("click", this.onClick);
    this.root.querySelector("[data-back]")?.addEventListener("click", (event) => {
      event.preventDefault();
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    this.socket = new MatchSocket(matchId, playerId);
    this.socket.onOpen = () => this.setConnection("Conectado; recibiendo estado en tiempo real.");
    this.socket.onState = (state) => this.renderState(state as ConnectFourState);
    this.socket.onFinished = (message) => this.renderFinished(message);
    this.socket.onError = (message) => {
      this.setError(message);
      const fatal = message === "Error de conexión WebSocket" ||
        !this.currentState ||
        this.currentState.currentTurnDisc === 2;
      if (fatal) {
        this.socketError = message;
        this.setStatus("La partida está pausada por un error. Vuelve a la consola para iniciar otra.");
      } else {
        this.setStatus("No se aplicó la jugada. Revisa el mensaje e inténtalo de nuevo.");
      }
    };
    this.socket.onClose = () => {
      this.setConnection("Conexión cerrada.");
      if (!this.finishedMessage) {
        this.setStatus("Se cerró la conexión. Vuelve a la consola para regresar a tus partidas.");
      }
    };
    try {
      this.socket.connect();
    } catch (error) {
      this.socketError = error instanceof Error ? error.message : String(error);
      this.setError(this.socketError);
      this.setStatus("No se pudo conectar a la partida.");
      this.setConnection("Sin conexión.");
    }
  }

  public destroy(): void {
    this.root.removeEventListener("click", this.onClick);
    this.socket.close();
  }

  private renderState(state: ConnectFourState): void {
    this.currentState = state;
    if (!this.socketError) {
      this.setError("");
    }
    const board = this.root.querySelector<HTMLElement>("[data-board]");
    const turn = this.root.querySelector<HTMLElement>("[data-turn]");
    const moves = this.root.querySelector<HTMLElement>("[data-moves]");
    if (!board || !turn || !moves) {
      return;
    }

    const humanTurn = state.currentTurnDisc === 1;
    const statusLabels: Record<string, string> = {
      WAITING: "Esperando jugadores…",
      RUNNING: this.spectator
        ? humanTurn ? "Turno del jugador…" : "Turno de la computadora…"
        : humanTurn ? "Tu turno — elige una columna" : "Turno de la computadora…",
      FINISHED: "Partida finalizada.",
    };
    this.setStatus(this.finishedMessage ?? this.socketError ?? statusLabels[state.status] ?? `Estado: ${state.status}`);
    turn.textContent = this.socketError
      ? "La partida está pausada por un error de conexión o del servidor."
      : this.spectator
      ? state.status === "RUNNING"
        ? humanTurn ? "El turno es del jugador rojo." : "El turno es de la computadora."
        : `Estado de la partida: ${state.status}.`
      : state.status !== "RUNNING"
        ? `Estado de la partida: ${state.status}.`
        : humanTurn ? "Tú juegas con rojo." : "La computadora juega con amarillo.";
    moves.textContent = `Jugadas: ${state.movesCount}`;
    board.innerHTML = `
      <div class="column-controls">${Array.from({ length: 7 }, (_, column) => `
        <button class="drop-button" data-column="${column}" aria-label="Jugar columna ${column + 1}"
          ${this.spectator || this.socketError || state.status !== "RUNNING" || !humanTurn || state.board[0]?.[column] !== 0 ? "disabled" : ""}>↓</button>
      `).join("")}</div>
      <div class="disc-grid">${state.board.map((row) => row.map((disc) => `
        <span class="disc ${disc === 1 ? "disc-human" : disc === 2 ? "disc-cpu" : ""}"></span>
      `).join("")).join("")}</div>`;
  }

  private renderFinished(message: MatchFinishedMessage): void {
    const result = String(message.result ?? "FINISHED");
    const labels: Record<string, string> = {
      WIN: "¡Ganaste la partida!",
      LOSS: "La computadora ganó la partida.",
      DRAW: "Partida terminada en empate.",
      ABANDONED: "Partida abandonada.",
    };
    this.finishedMessage = labels[result] ?? `Partida finalizada: ${result}`;
    this.setStatus(this.finishedMessage);
    const turn = this.root.querySelector<HTMLElement>("[data-turn]");
    if (turn) {
      turn.textContent = "La partida terminó. Puedes volver a la consola.";
    }
  }

  private setConnection(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-connection]");
    if (target) {
      target.textContent = message;
    }
  }

  private setStatus(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-status]");
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
