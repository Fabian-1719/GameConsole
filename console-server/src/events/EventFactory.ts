import { randomUUID } from "node:crypto";
import {
  GameEvent,
  MatchResult,
  MatchStartedData,
  PlayerJoinedData,
  PlayerLeftData,
  MatchFinishedData,
} from "./contract.js";

/**
 * Factoria centralizada para instanciar eventos de acuerdo al contrato de GameStats.
 */
export class EventFactory {
  public static createEventId(): string {
    return `e-${randomUUID()}`;
  }

  public static createMatchId(): string {
    return `m-${randomUUID()}`;
  }

  public static createPlayerId(): string {
    return `p-${randomUUID().slice(0, 8)}`;
  }

  public static createTimestamp(): string {
    return new Date().toISOString();
  }

  public static create(params: {
    gameId: string;
    gameVersion?: string;
    matchId: string;
    playerId?: string;
    type: string;
    action?: string;
    data: Record<string, unknown>;
    timestamp?: string;
  }): GameEvent {
    if (!params.gameId || !params.matchId || !params.type) {
      throw new Error("gameId, matchId y type son campos obligatorios");
    }

    return {
      eventId: EventFactory.createEventId(),
      timestamp: params.timestamp ?? EventFactory.createTimestamp(),
      gameId: params.gameId,
      gameVersion: params.gameVersion ?? "1.0",
      matchId: params.matchId,
      playerId: params.playerId,
      type: params.type,
      action: params.action ?? "NONE",
      data: params.data,
    };
  }

  public static matchStarted(
    gameId: string,
    matchId: string,
    data: MatchStartedData,
    gameVersion?: string
  ): GameEvent {
    return this.create({
      gameId,
      gameVersion,
      matchId,
      type: "MATCH_STARTED",
      action: "START",
      data,
    });
  }

  public static playerJoined(
    gameId: string,
    matchId: string,
    playerId: string,
    data: PlayerJoinedData,
    gameVersion?: string
  ): GameEvent {
    return this.create({
      gameId,
      gameVersion,
      matchId,
      playerId,
      type: "PLAYER_JOINED",
      action: "JOIN",
      data,
    });
  }

  public static playerLeft(
    gameId: string,
    matchId: string,
    playerId: string,
    data: PlayerLeftData,
    gameVersion?: string
  ): GameEvent {
    return this.create({
      gameId,
      gameVersion,
      matchId,
      playerId,
      type: "PLAYER_LEFT",
      action: "LEAVE",
      data,
    });
  }

  public static matchFinished(
    gameId: string,
    matchId: string,
    data: MatchFinishedData,
    gameVersion?: string
  ): GameEvent {
    return this.create({
      gameId,
      gameVersion,
      matchId,
      type: "MATCH_FINISHED",
      action: "FINISH",
      data,
    });
  }
}
