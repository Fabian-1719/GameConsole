/**
 * Contrato canónico de eventos compatible con la plataforma GameStats (Go/Scala).
 * Centralizado para permitir ajustes en un único punto.
 */

export interface GameEvent {
  eventId: string;
  timestamp: string;
  gameId: string;
  gameVersion: string;
  matchId: string;
  playerId?: string;
  type: string;
  action?: string;
  data: Record<string, unknown>;
}

export type MatchResult = "WIN" | "LOSS" | "DRAW" | "ABANDONED";

export interface MatchStartedData extends Record<string, unknown> {
  mode: "VS_AI" | "SOLO" | "MULTIPLAYER";
  players: string[];
}

export interface PlayerJoinedData extends Record<string, unknown> {
  name: string;
}

export interface PlayerLeftData extends Record<string, unknown> {
  reason: string;
}

export interface MatchFinishedData extends Record<string, unknown> {
  winnerId: string | null;
  result: MatchResult;
  durationMs: number;
}
