import { MatchFinishedMessage } from "../../net/MatchSocket.js";
import { matchSocketManager } from "../../net/MatchSocketManager.js";

interface SnakeState {
  status: string;
  size: number;
  snake: Array<{ x: number; y: number }>;
  food: { x: number; y: number } | null;
  score: number;
  length: number;
  direction: "UP" | "DOWN" | "LEFT" | "RIGHT";
  paused: boolean;
}

type Navigate = (path: string) => void;
type Direction = SnakeState["direction"];

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "UP",
  w: "UP",
  W: "UP",
  ArrowDown: "DOWN",
  s: "DOWN",
  S: "DOWN",
  ArrowLeft: "LEFT",
  a: "LEFT",
  A: "LEFT",
  ArrowRight: "RIGHT",
  d: "RIGHT",
  D: "RIGHT",
};

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

export class SnakeView {
  private readonly unsubscribe: () => void;
  private state?: SnakeState;
  private previousState?: SnakeState;
  private previousStateAt = 0;
  private interpolationMs = 120;
  private lastSentDirection?: Direction;
  private lastBestScore = 0;
  private frameId = 0;
  private countdownTimer?: number;
  private countdown = 0;
  private finished = false;
  private eatAnimationUntil = 0;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.isInteractiveTarget(event.target)) {
      return;
    }
    if (this.state?.paused && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      this.beginResumeCountdown();
      return;
    }
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) {
      return;
    }
    event.preventDefault();
    if (this.spectator || !this.state || this.state.status !== "RUNNING" || this.state.paused || this.finished) {
      return;
    }
    const currentDirection = this.lastSentDirection ?? this.state.direction;
    if (direction === currentDirection || direction === OPPOSITE[currentDirection]) {
      return;
    }
    try {
      matchSocketManager.sendAction(this.matchId, { direction });
      this.lastSentDirection = direction;
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      this.sendPause();
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-back]")) {
      event.preventDefault();
      this.navigate("/");
    } else if (target.closest("[data-pause]")) {
      this.sendPause();
    } else if (target.closest("[data-resume]")) {
      this.beginResumeCountdown();
    } else if (target.closest("[data-pause-toggle]")) {
      if (this.state?.paused) {
        this.beginResumeCountdown();
      } else {
        this.sendPause();
      }
    } else if (target.closest("[data-new-match]")) {
      void this.createNewMatch().catch((error: unknown) => {
        this.setError(error instanceof Error ? error.message : String(error));
      });
    } else if (target.closest("[data-abandon]")) {
      this.abandon();
    }
  };

  private readonly redraw = (): void => {
    this.resizeCanvas();
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
      <section class="page-heading snake-heading">
        <p class="eyebrow">PARTIDA · ${escapeHtml(matchId.slice(0, 8))}</p>
        <h1>Snake</h1>
        <p class="muted" data-connection>Conectando a la partida…</p>
      </section>
      <section class="game-layout snake-layout">
        <div class="game-board-wrap snake-board-wrap">
          <canvas class="snake-canvas" data-snake-board aria-label="Tablero de Snake"></canvas>
          <div class="snake-pause-overlay" data-pause-overlay hidden>
            <h2 data-pause-title>En pausa</h2>
            <p class="muted" data-pause-message>Tu partida está guardada. Reanuda cuando quieras.</p>
            <button class="button button-primary" data-resume>Reanudar</button>
          </div>
          <div class="snake-finish-overlay" data-finish-overlay hidden>
            <p class="eyebrow">PARTIDA FINALIZADA</p>
            <h2>Fin de la partida</h2>
            <p class="muted" data-finish-score></p>
            <p class="muted" data-finish-cause></p>
            <div class="snake-finished-actions">
              <button class="button button-primary" data-new-match>Jugar de nuevo</button>
              <button class="button button-quiet" data-back>Volver a consola</button>
            </div>
          </div>
        </div>
        <aside class="game-sidebar snake-sidebar">
          <p class="eyebrow">${this.spectator ? "VISTA EN VIVO · ESPECTADOR" : "PARTIDA"}</p>
          <h2>${this.spectator ? "Espectador" : "Tu partida"}</h2>
          <div class="snake-score-block">
            <span class="snake-score-label">Puntaje</span>
            <strong data-score>0</strong>
          </div>
          <p class="muted" data-length>Largo: 3</p>
          <p class="muted" data-best>Mejor de la sesión: 0</p>
          <p class="snake-state-indicator" data-game-status>Conectando…</p>
          <p class="muted snake-help">Flechas o WASD para moverte.<br>Espacio para pausar.</p>
          ${this.spectator ? "" : `
            <div class="snake-controls">
              <button class="button button-primary" data-pause-toggle>Pausar</button>
              <button class="button button-quiet" data-abandon>Abandonar</button>
              <button class="button button-quiet" data-back>Volver a consola</button>
            </div>`}
          <p class="error-message" data-error role="alert"></p>
        </aside>
      </section>`;

    this.lastBestScore = Number(window.sessionStorage.getItem("snake-best-score") ?? 0);
    this.root.addEventListener("click", this.onClick);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.redraw);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeCanvas();
    this.frameId = requestAnimationFrame(this.animate);

    let unsubscribe = (): void => undefined;
    try {
      const entry = matchSocketManager.open(matchId, playerId);
      unsubscribe = matchSocketManager.subscribe(matchId, {
        onOpen: () => this.setConnection("Conectado; recibiendo estado en tiempo real."),
        onState: (state) => this.renderState(state as SnakeState),
        onFinished: (message) => this.renderFinished(message),
        onError: (message) => this.setError(message),
        onClose: () => this.setConnection("Conexión cerrada."),
      });
      if (entry.lastState !== null) {
        this.setConnection("Conectado; recibiendo estado en tiempo real.");
      }
      if (entry.finished) {
        this.renderFinished({ type: "FINISHED", result: "LOSS" });
      }
    } catch (error) {
      this.setConnection("Sin conexión.");
      this.setError(error instanceof Error ? error.message : String(error));
    }
    this.unsubscribe = unsubscribe;
  }

  public destroy(): void {
    this.sendPause();
    this.unsubscribe();
    this.root.removeEventListener("click", this.onClick);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.redraw);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    cancelAnimationFrame(this.frameId);
    this.clearCountdown();
  }

  public abandon(): void {
    this.clearCountdown();
    matchSocketManager.abandon(this.matchId);
    this.navigate("/");
  }

  private readonly animate = (time: number): void => {
    if (this.state && !this.finished) {
      this.draw(time);
    }
    this.frameId = requestAnimationFrame(this.animate);
  };

  private renderState(state: SnakeState): void {
    const now = performance.now();
    if (this.state && !state.paused && !this.state.paused) {
      this.previousState = this.state;
      this.interpolationMs = Math.max(50, Math.min(500, now - this.previousStateAt));
    } else {
      this.previousState = state;
    }
    if (this.state && state.score > this.state.score) {
      this.eatAnimationUntil = now + 380;
    }
    this.previousStateAt = now;
    this.state = state;
    this.lastSentDirection = state.direction;
    this.updateStats(state);
    this.updatePauseState(state.paused);
    const gameStatus = this.root.querySelector<HTMLElement>("[data-game-status]");
    if (gameStatus) {
      gameStatus.textContent = state.paused ? "En pausa" : state.status === "RUNNING" ? "Jugando" : state.status;
      gameStatus.classList.toggle("is-paused", state.paused);
    }
    if (state.status === "FINISHED" && !this.finished) {
      this.renderFinished({ type: "FINISHED", result: "LOSS" });
    }
  }

  private updateStats(state: SnakeState): void {
    const score = this.root.querySelector<HTMLElement>("[data-score]");
    const length = this.root.querySelector<HTMLElement>("[data-length]");
    const best = this.root.querySelector<HTMLElement>("[data-best]");
    if (score) {
      score.textContent = String(state.score);
    }
    if (length) {
      length.textContent = `Largo: ${state.length}`;
    }
    this.lastBestScore = Math.max(this.lastBestScore, state.score);
    window.sessionStorage.setItem("snake-best-score", String(this.lastBestScore));
    if (best) {
      best.textContent = `Mejor de la sesión: ${this.lastBestScore}`;
    }
  }

  private updatePauseState(paused: boolean): void {
    const overlay = this.root.querySelector<HTMLElement>("[data-pause-overlay]");
    const toggle = this.root.querySelector<HTMLButtonElement>("[data-pause-toggle]");
    if (overlay) {
      overlay.hidden = !paused || this.finished;
    }
    if (toggle) {
      toggle.textContent = paused ? "Reanudar" : "Pausar";
    }
    if (!paused) {
      this.clearCountdown();
    }
  }

  private draw(time: number): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("[data-snake-board]");
    const state = this.state;
    if (!canvas || !state) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      this.setError("No se pudo inicializar el tablero.");
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const side = Math.min(width, height);
    const offsetX = (width - side) / 2;
    const offsetY = (height - side) / 2;
    const cell = side / state.size;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101827";
    context.fillRect(offsetX, offsetY, side, side);
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if ((x + y) % 2 === 0) {
          context.fillStyle = "#ffffff06";
          context.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
        }
      }
    }

    const progress = state.paused ? 1 : Math.min(1, (time - this.previousStateAt) / this.interpolationMs);
    const priorSegments = this.previousState?.snake ?? state.snake;
    const segments = state.snake.map((segment, index) => {
      const from = priorSegments[index] ?? segment;
      return {
        x: from.x + (segment.x - from.x) * progress,
        y: from.y + (segment.y - from.y) * progress,
      };
    });

    if (state.food) {
      const pulse = 0.94 + Math.sin(time / 180) * 0.06;
      const cx = offsetX + (state.food.x + 0.5) * cell;
      const cy = offsetY + (state.food.y + 0.5) * cell;
      const radius = cell * 0.32 * pulse;
      context.save();
      context.shadowColor = "#ff6666b8";
      context.shadowBlur = cell * 0.35;
      const apple = context.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius * 1.4);
      apple.addColorStop(0, "#ffb2a1");
      apple.addColorStop(0.5, "#f35e67");
      apple.addColorStop(1, "#b92c48");
      context.fillStyle = apple;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = "#a9e3a8";
      context.lineWidth = Math.max(1, cell * 0.06);
      context.beginPath();
      context.moveTo(cx, cy - radius * 0.75);
      context.quadraticCurveTo(cx + radius * 0.3, cy - radius * 1.5, cx + radius * 0.7, cy - radius * 1.1);
      context.stroke();
      if (time < this.eatAnimationUntil) {
        const ratio = 1 - (this.eatAnimationUntil - time) / 380;
        context.globalAlpha = 1 - ratio;
        context.strokeStyle = "#ffe1a0";
        context.lineWidth = Math.max(1, cell * 0.05);
        context.beginPath();
        context.arc(cx, cy, radius + ratio * cell * 0.5, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }

    segments.forEach((segment, index) => {
      const inset = cell * 0.07;
      const x = offsetX + segment.x * cell + inset;
      const y = offsetY + segment.y * cell + inset;
      const size = cell - inset * 2;
      const gradient = context.createLinearGradient(x, y, x + size, y + size);
      const shade = Math.min(index / Math.max(1, segments.length - 1), 1);
      gradient.addColorStop(0, mixColor("#b0f4dc", "#28795f", shade));
      gradient.addColorStop(1, mixColor("#70d8b5", "#174438", shade));
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(x, y, size, size, cell * 0.32);
      context.fill();
      if (index === 0) {
        this.drawEyes(context, x, y, size, cell, state.direction);
      }
    });
  }

  private drawEyes(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    cell: number,
    direction: Direction
  ): void {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const forward = cell * 0.16;
    const sideways = cell * 0.17;
    const eyes = direction === "UP"
      ? [[centerX - sideways, centerY - forward], [centerX + sideways, centerY - forward]]
      : direction === "DOWN"
        ? [[centerX - sideways, centerY + forward], [centerX + sideways, centerY + forward]]
        : direction === "LEFT"
          ? [[centerX - forward, centerY - sideways], [centerX - forward, centerY + sideways]]
          : [[centerX + forward, centerY - sideways], [centerX + forward, centerY + sideways]];
    context.fillStyle = "#10251e";
    for (const [eyeX, eyeY] of eyes) {
      context.beginPath();
      context.arc(eyeX, eyeY, cell * 0.055, 0, Math.PI * 2);
      context.fill();
    }
  }

  private resizeCanvas(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("[data-snake-board]");
    if (!canvas) {
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    if (this.state) {
      this.draw(performance.now());
    }
  }

  private sendPause(): void {
    if (this.spectator || this.finished || this.state?.paused) {
      return;
    }
    try {
      matchSocketManager.sendAction(this.matchId, { type: "PAUSE" });
    } catch {
      return;
    }
  }

  private beginResumeCountdown(): void {
    if (this.spectator || !this.state?.paused || this.countdownTimer !== undefined || this.finished) {
      return;
    }
    this.countdown = 3;
    this.setPauseMessage(`La partida continúa en ${this.countdown}…`);
    const button = this.root.querySelector<HTMLButtonElement>("[data-resume]");
    if (button) {
      button.disabled = true;
      button.textContent = `Reanudando… ${this.countdown}`;
    }
    this.countdownTimer = window.setInterval(() => {
      this.countdown--;
      if (this.countdown > 0) {
        this.setPauseMessage(`La partida continúa en ${this.countdown}…`);
        if (button) {
          button.textContent = `Reanudando… ${this.countdown}`;
        }
        return;
      }
      this.clearCountdown();
      try {
        matchSocketManager.sendAction(this.matchId, { type: "RESUME" });
      } catch (error) {
        this.setError(error instanceof Error ? error.message : String(error));
      }
    }, 1000);
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== undefined) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    const button = this.root.querySelector<HTMLButtonElement>("[data-resume]");
    if (button) {
      button.disabled = false;
      button.textContent = "Reanudar";
    }
    if (this.state?.paused) {
      this.setPauseMessage("Tu partida está guardada. Reanuda cuando quieras.");
    }
  }

  private renderFinished(message: MatchFinishedMessage): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.clearCountdown();
    const extraData = isRecord(message.extraData) ? message.extraData : {};
    const finalScore = typeof extraData.score === "number" ? extraData.score : this.state?.score ?? 0;
    const finalLength = typeof extraData.length === "number" ? extraData.length : this.state?.length ?? 3;
    const cause = message.cause === "WALL" ? "Muro" : message.cause === "SELF" ? "Cuerpo" : "Abandono";
    const overlay = this.root.querySelector<HTMLElement>("[data-finish-overlay]");
    const score = this.root.querySelector<HTMLElement>("[data-finish-score]");
    const causeLabel = this.root.querySelector<HTMLElement>("[data-finish-cause]");
    if (overlay) {
      overlay.hidden = false;
    }
    if (score) {
      score.textContent = `Puntaje final: ${finalScore} · Largo: ${finalLength}`;
    }
    if (causeLabel) {
      causeLabel.textContent = `Causa: ${cause}`;
    }
    this.updatePauseState(false);
    const toggle = this.root.querySelector<HTMLButtonElement>("[data-pause-toggle]");
    if (toggle) {
      toggle.disabled = true;
    }
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element &&
      !!target.closest("button, input, select, textarea, [contenteditable='true']");
  }

  private setPauseMessage(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-pause-message]");
    if (target) {
      target.textContent = message;
    }
  }

  private setStatus(message: string): void {
    const target = this.root.querySelector<HTMLElement>("[data-game-status]");
    if (target) {
      target.textContent = message;
    }
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

function mixColor(from: string, to: string, ratio: number): string {
  const start = from.match(/[0-9a-f]{2}/gi)?.map((component) => Number.parseInt(component, 16)) ?? [0, 0, 0];
  const end = to.match(/[0-9a-f]{2}/gi)?.map((component) => Number.parseInt(component, 16)) ?? [0, 0, 0];
  const color = start.map((value, index) => Math.round(value + (end[index] - value) * ratio));
  return `rgb(${color[0]} ${color[1]} ${color[2]})`;
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
