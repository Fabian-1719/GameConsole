import { Player } from "../../core/Player.js";
import { Match, MatchOptions, MatchStatus } from "../../core/Match.js";
import { EventFactory } from "../../events/EventFactory.js";
import { MatchResult } from "../../events/contract.js";
import { Food } from "./Food.js";
import { Grid, Point } from "./Grid.js";
import { Direction, isDirection, Snake } from "./Snake.js";

export interface SnakeMatchOptions extends MatchOptions {
  size?: number;
  tickMs?: number;
  pauseTimeoutMs?: number;
}

export interface SnakePublicState {
  matchId: string;
  gameId: string;
  status: MatchStatus;
  size: number;
  snake: Point[];
  food: Point | null;
  score: number;
  length: number;
  direction: Direction;
  paused: boolean;
  humanPlayer?: { id: string; name: string };
}

export class SnakeMatch extends Match {
  private readonly grid: Grid;
  private readonly snake: Snake;
  private readonly food: Food;
  private readonly tickMs: number;
  private readonly pauseTimeoutMs: number;
  private score = 0;
  private timer?: ReturnType<typeof setInterval>;
  private pauseTimer?: ReturnType<typeof setTimeout>;
  private pausedAt?: number;
  private totalPausedMs = 0;
  private paused = false;
  private deathCause?: "WALL" | "SELF";

  constructor(options: SnakeMatchOptions = {}) {
    super("snake-arena", options);
    this.grid = new Grid(options.size ?? 20);
    this.snake = new Snake(this.grid.getSize());
    this.food = new Food(this.grid, this.snake.getSegments());
    this.tickMs = options.tickMs ?? 120;
    if (!Number.isInteger(this.tickMs) || this.tickMs < 1) {
      throw new Error("tickMs debe ser un entero positivo");
    }
    this.pauseTimeoutMs = options.pauseTimeoutMs ?? 10 * 60 * 1000;
    if (!Number.isInteger(this.pauseTimeoutMs) || this.pauseTimeoutMs < 1) {
      throw new Error("pauseTimeoutMs debe ser un entero positivo");
    }
    this.on("finished", (info: unknown) => {
      if (this.deathCause && typeof info === "object" && info !== null) {
        Object.assign(info, { cause: this.deathCause });
      }
    });
  }

  public getScore(): number {
    return this.score;
  }

  public getLength(): number {
    return this.snake.getSegments().length;
  }

  public getDirection(): Direction {
    return this.snake.getDirection();
  }

  public getSnake(): Point[] {
    return this.snake.getSegments();
  }

  public getFood(): Point | null {
    return this.food.getPosition();
  }

  public override start(): void {
    if (this.status !== "WAITING") {
      return;
    }
    super.start();
    if (this.isRunning()) {
      this.timer = setInterval(() => this.tick(), this.tickMs);
      this.timer.unref?.();
    }
  }

  public handleAction(playerId: string, action: unknown): void {
    if (this.status !== "RUNNING" || playerId !== this.getHumanPlayer()?.id) {
      return;
    }
    if (typeof action !== "object" || action === null) {
      return;
    }
    if ("type" in action && action.type === "PAUSE") {
      this.pause();
      return;
    }
    if ("type" in action && action.type === "RESUME") {
      this.resume();
      return;
    }
    if (this.paused || !("direction" in action)) {
      return;
    }
    const direction = action.direction;
    if (isDirection(direction)) {
      this.snake.queueDirection(direction);
    }
  }

  public tick(): void {
    if (this.status !== "RUNNING" || this.paused) {
      return;
    }
    this.snake.applyPendingDirection();
    const nextHead = this.snake.getNextHead();
    const food = this.food.getPosition();
    const eating = food !== null && samePoint(nextHead, food);

    if (!this.grid.contains(nextHead)) {
      this.die("WALL");
      return;
    }
    if (this.snake.occupies(nextHead, eating)) {
      this.die("SELF");
      return;
    }

    this.snake.move(eating);
    if (eating) {
      this.score += 10;
      this.emitEvent(
        EventFactory.create({
          gameId: this.gameId,
          gameVersion: this.gameVersion,
          matchId: this.matchId,
          playerId: this.getHumanPlayer()?.id,
          type: "FOOD_EATEN",
          action: "EAT",
          data: { score: this.score, length: this.getLength() },
        })
      );
      if (!this.food.place(this.snake.getSegments())) {
        this.finish("WIN");
        return;
      }
    }
    this.broadcastState();
  }

  public override finish(
    result: MatchResult,
    winnerId: string | null = null,
    extraData: Record<string, unknown> = {}
  ): void {
    this.clearTimer();
    this.clearPauseTimer();
    this.accountForPause();
    super.finish(result, winnerId, {
      score: this.score,
      length: this.getLength(),
      durationMs: this.getDurationMs(),
      ...extraData,
    });
  }

  public getPublicState(): SnakePublicState {
    const human = this.getHumanPlayer();
    return {
      matchId: this.matchId,
      gameId: this.gameId,
      status: this.status,
      size: this.grid.getSize(),
      snake: this.snake.getSegments(),
      food: this.food.getPosition(),
      score: this.score,
      length: this.getLength(),
      direction: this.snake.getDirection(),
      paused: this.paused,
      humanPlayer: human ? { id: human.id, name: human.name } : undefined,
    };
  }

  public getHumanPlayer(): Player | undefined {
    return this.players.find((player) => player.isHuman);
  }

  private die(cause: "WALL" | "SELF"): void {
    this.deathCause = cause;
    this.emitEvent(
      EventFactory.create({
        gameId: this.gameId,
        gameVersion: this.gameVersion,
        matchId: this.matchId,
        playerId: this.getHumanPlayer()?.id,
        type: "PLAYER_DIED",
        action: "DIE",
        data: { cause, score: this.score },
      })
    );
    this.finish("LOSS");
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = undefined;
    }
  }

  private pause(): void {
    if (this.status !== "RUNNING" || this.paused) {
      return;
    }
    this.paused = true;
    this.pausedAt = Date.now();
    this.clearTimer();
    this.pauseTimer = setTimeout(() => {
      const human = this.getHumanPlayer();
      if (human) {
        this.removePlayer(human.id, "PAUSE_TIMEOUT");
      } else {
        this.finish("ABANDONED");
      }
    }, this.pauseTimeoutMs);
    this.pauseTimer.unref?.();
    this.broadcastState();
  }

  private resume(): void {
    if (this.status !== "RUNNING" || !this.paused) {
      return;
    }
    this.accountForPause();
    this.clearPauseTimer();
    this.paused = false;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref?.();
    this.broadcastState();
  }

  private accountForPause(): void {
    if (this.pausedAt !== undefined) {
      this.totalPausedMs += Date.now() - this.pausedAt;
      this.pausedAt = undefined;
    }
  }

  private getDurationMs(): number {
    const currentPause = this.pausedAt === undefined ? 0 : Date.now() - this.pausedAt;
    return Math.max(0, Date.now() - this.startedAt.getTime() - this.totalPausedMs - currentPause);
  }

  private isRunning(): boolean {
    return this.status === "RUNNING";
  }
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}
