import { EventEmitter } from "node:events";
import { Player } from "./Player.js";
import { GameEvent, MatchResult } from "../events/contract.js";
import { EventFactory } from "../events/EventFactory.js";

export type MatchStatus = "WAITING" | "RUNNING" | "FINISHED";

export interface MatchOptions {
  matchId?: string;
  gameVersion?: string;
  [key: string]: unknown;
}

/**
 * Abstraccion base de una partida concurrente e independiente.
 * Gestiona el ciclo de vida, jugadores, emision de eventos de dominio y difusion de estado.
 */
export abstract class Match extends EventEmitter {
  public readonly matchId: string;
  public readonly gameId: string;
  public readonly gameVersion: string;
  public readonly startedAt: Date;
  protected _status: MatchStatus;
  protected _players: Map<string, Player>;
  protected _finishedAt?: Date;

  constructor(gameId: string, options: MatchOptions = {}) {
    super();
    this.gameId = gameId;
    this.gameVersion = options.gameVersion ?? "1.0";
    this.matchId = options.matchId ?? EventFactory.createMatchId();
    this.startedAt = new Date();
    this._status = "WAITING";
    this._players = new Map();
  }

  public get status(): MatchStatus {
    return this._status;
  }

  public get players(): Player[] {
    return Array.from(this._players.values());
  }

  public get finishedAt(): Date | undefined {
    return this._finishedAt;
  }

  public addPlayer(player: Player): void {
    if (this._status === "FINISHED") {
      throw new Error("No se pueden unir jugadores a una partida finalizada");
    }
    this._players.set(player.id, player);
    
    // Emision de evento de union
    this.emitEvent(
      EventFactory.playerJoined(this.gameId, this.matchId, player.id, {
        name: player.name,
      }, this.gameVersion)
    );

    if (this._status === "WAITING" && this.canStart()) {
      this.start();
    }
  }

  public removePlayer(playerId: string, reason = "DISCONNECTED"): void {
    const player = this._players.get(playerId);
    if (!player) return;

    this.emitEvent(
      EventFactory.playerLeft(this.gameId, this.matchId, playerId, {
        reason,
      }, this.gameVersion)
    );

    // Si la partida esta en curso y un jugador abandona, finaliza como abandonada
    if (this._status === "RUNNING") {
      this.finish("ABANDONED", null, { reason: `Jugador ${player.name} abandono` });
    }
  }

  protected canStart(): boolean {
    return this._players.size >= 1;
  }

  public start(): void {
    if (this._status !== "WAITING") return;
    this._status = "RUNNING";

    const playerIds = Array.from(this._players.keys());
    const isVsAi = Array.from(this._players.values()).some((p) => !p.isHuman);

    this.emitEvent(
      EventFactory.matchStarted(this.gameId, this.matchId, {
        mode: isVsAi ? "VS_AI" : "SOLO",
        players: playerIds,
      }, this.gameVersion)
    );

    this.broadcastState();
  }

  public finish(
    result: MatchResult,
    winnerId: string | null = null,
    extraData: Record<string, unknown> = {}
  ): void {
    if (this._status === "FINISHED") return;
    this._status = "FINISHED";
    this._finishedAt = new Date();

    const durationMs = this._finishedAt.getTime() - this.startedAt.getTime();

    this.emitEvent(
      EventFactory.matchFinished(this.gameId, this.matchId, {
        winnerId,
        result,
        durationMs,
        ...extraData,
      }, this.gameVersion)
    );

    this.emit("finished", { result, winnerId, durationMs, extraData });
    this.broadcastState();
  }

  public emitEvent(event: GameEvent): void {
    this.emit("event", event);
  }

  public broadcastState(): void {
    this.emit("state", this.getPublicState());
  }

  public abstract handleAction(playerId: string, action: unknown): Promise<void> | void;
  public abstract getPublicState(): unknown;
}
