import { MatchFinishedMessage } from "../../net/MatchSocket.js";
import { matchSocketManager } from "../../net/MatchSocketManager.js";

interface ConnectFourState {
  status: string;
  board: number[][];
  currentTurnDisc: number;
  level: number;
  movesCount: number;
  winningCells?: Array<{ row: number; column: number }>;
}

export class ConnectFourView {
  private readonly matchId: string;
  private readonly unsubscribe: () => void;
  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-abandon]")) {
      this.abandon();
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-column]");
    if (button && !button.disabled) {
      try {
        matchSocketManager.sendAction(this.matchId, { column: Number(button.dataset.column) });
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
  private previousBoard?: number[][];

  constructor(
    private readonly root: HTMLElement,
    matchId: string,
    playerId: string,
    private readonly spectator = false
  ) {
    this.matchId = matchId;
    this.root.innerHTML = `
      <section class="page-heading">
        <p class="eyebrow">PARTIDA · ${escapeHtml(matchId.slice(0, 8))}</p>
        <h1>Cuatro en Línea</h1>
        <a class="button button-quiet back-button" href="/" data-back>← Volver a la consola</a>
        <p class="muted" data-connection>Conectando a la partida…</p>
        ${this.spectator ? "" : '<p class="muted">Puedes volver a la consola y retomar esta partida; cerrar la pestaña puede abandonarla.</p>'}
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
          <p class="muted" data-level>Dificultad IA: —</p>
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
    try {
      const entry = matchSocketManager.open(matchId, playerId);
      this.unsubscribe = matchSocketManager.subscribe(matchId, {
        onOpen: () => this.setConnection("Conectado; recibiendo estado en tiempo real."),
        onState: (state) => this.renderState(state as ConnectFourState),
        onFinished: (message) => this.renderFinished(message),
        onError: (message) => {
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
        },
        onClose: () => {
          this.setConnection("Conexión cerrada.");
          if (!this.finishedMessage) {
            this.setStatus("Se cerró la conexión. Vuelve a la consola para regresar a tus partidas.");
          }
        },
      });
      if (entry.lastState !== null) {
        this.setConnection("Conectado; recibiendo estado en tiempo real.");
      }
    } catch (error) {
      this.socketError = error instanceof Error ? error.message : String(error);
      this.setError(this.socketError);
      this.setStatus("No se pudo conectar a la partida.");
      this.setConnection("Sin conexión.");
      this.unsubscribe = () => undefined;
    }
  }

  public destroy(): void {
    this.root.removeEventListener("click", this.onClick);
    this.unsubscribe();
  }

  public abandon(): void {
    matchSocketManager.abandon(this.matchId);
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  private renderState(state: ConnectFourState): void {
    this.currentState = state;
    if (!this.socketError) {
      this.setError("");
    }
    const board = this.root.querySelector<HTMLElement>("[data-board]");
    const turn = this.root.querySelector<HTMLElement>("[data-turn]");
    const level = this.root.querySelector<HTMLElement>("[data-level]");
    const moves = this.root.querySelector<HTMLElement>("[data-moves]");
    if (!board || !turn || !level || !moves) {
      return;
    }

    const humanTurn = state.currentTurnDisc === 1;
    level.textContent = `Dificultad IA: nivel ${state.level}`;
    const lastDrop = this.findSingleDrop(this.previousBoard, state.board);
    const statusLabels: Record<string, string> = {
      WAITING: "Esperando jugadores…",
      RUNNING: this.spectator
        ? humanTurn ? "Turno del jugador…" : "Turno de la IA…"
        : humanTurn ? "Tu turno — elige una columna" : "Turno de la IA…",
      FINISHED: "Partida finalizada.",
    };
    this.setStatus(this.finishedMessage ?? this.socketError ?? statusLabels[state.status] ?? `Estado: ${state.status}`);
    turn.textContent = this.socketError
      ? "La partida está pausada por un error de conexión o del servidor."
      : this.spectator
      ? state.status === "RUNNING"
      ? humanTurn ? "El turno es del jugador rojo." : "Turno de la IA."
        : `Estado de la partida: ${state.status}.`
      : state.status !== "RUNNING"
        ? `Estado de la partida: ${state.status}.`
        : humanTurn ? "Tú juegas con rojo." : "Turno de la IA.";
    moves.textContent = `Jugadas: ${state.movesCount}`;
    const winningCells = new Set((state.winningCells ?? []).map(({ row, column }) => `${row}:${column}`));
    board.innerHTML = `<div class="column-controls">${Array.from({ length: 7 }, (_, column) => `
      <button class="drop-button" data-column="${column}" aria-label="Jugar columna ${column + 1}"
        ${this.spectator || this.socketError || state.status !== "RUNNING" || !humanTurn || state.board[0]?.[column] !== 0 ? "disabled" : ""}>↓</button>
    `).join("")}</div>
    <div class="disc-grid">${state.board.map((row, rowIndex) => row.map((disc, column) => {
      const animate = lastDrop?.row === rowIndex && lastDrop.column === column;
      const style = animate ? ` style="--fall-rows:${lastDrop.row + 1}"` : "";
      const winning = winningCells.has(`${rowIndex}:${column}`);
      return `<span class="cell${winning ? " cell-winning" : ""}"><span class="disc ${disc === 1 ? "disc-human" : disc === 2 ? "disc-cpu" : ""}${animate ? " disc-falling" : ""}"${style}></span></span>`;
    }).join("")).join("")}</div>`;
    this.previousBoard = state.board.map((row) => [...row]);
  }

  private findSingleDrop(
    previous: number[][] | undefined,
    current: number[][]
  ): { row: number; column: number } | undefined {
    if (!previous || previous.length !== current.length) {
      return undefined;
    }
    const changed: Array<{ row: number; column: number }> = [];
    for (let row = 0; row < current.length; row++) {
      if (previous[row]?.length !== current[row]?.length) {
        return undefined;
      }
      for (let column = 0; column < current[row].length; column++) {
        if (previous[row][column] !== current[row][column]) {
          changed.push({ row, column });
        }
      }
    }
    return changed.length === 1 ? changed[0] : undefined;
  }

  private renderFinished(message: MatchFinishedMessage): void {
    const result = String(message.result ?? "FINISHED");
    const labels: Record<string, string> = {
      WIN: "¡Conectaste cuatro en línea y ganaste!",
      LOSS: "La computadora conectó cuatro en línea y ganó.",
      DRAW: "Partida terminada en empate.",
      ABANDONED: "Partida abandonada.",
    };
    this.finishedMessage = labels[result] ?? `Partida finalizada: ${result}`;
    this.setStatus(this.finishedMessage);
    this.root.querySelectorAll<HTMLButtonElement>("button[data-column]").forEach((button) => {
      button.disabled = true;
    });
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
