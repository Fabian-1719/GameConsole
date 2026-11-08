import { CreateMatchResponse } from "./ApiClient.js";

export interface RecentMatch {
  matchId: string;
  gameId: string;
  playerId: string;
  playedAt: string;
  sessionId?: string;
}

const storageKey = "gameconsole:recent-matches";
const sessionKey = "gameconsole:tab-session";
const maxRecentMatches = 20;

export function recordRecentMatch(match: CreateMatchResponse): void {
  const sessionId = getCurrentSessionId();
  const recent = readRecentMatches().filter((entry) => entry.matchId !== match.matchId);
  recent.unshift({
    matchId: match.matchId,
    gameId: match.gameId,
    playerId: match.playerId,
    playedAt: new Date().toISOString(),
    sessionId,
  });
  localStorage.setItem(storageKey, JSON.stringify(recent.slice(0, maxRecentMatches)));
}

export function getCurrentSessionId(): string {
  let sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(sessionKey, sessionId);
  }
  return sessionId;
}

export function isCurrentSessionMatch(match: RecentMatch): boolean {
  return match.sessionId === getCurrentSessionId();
}

export function readRecentMatches(): RecentMatch[] {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("El historial local de partidas tiene un formato inválido");
  }

  return parsed.filter(isRecentMatch);
}

export function clearRecentMatches(): void {
  localStorage.removeItem(storageKey);
}

function isRecentMatch(value: unknown): value is RecentMatch {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.matchId === "string" &&
    typeof entry.gameId === "string" &&
    typeof entry.playerId === "string" &&
    typeof entry.playedAt === "string" &&
    (entry.sessionId === undefined || typeof entry.sessionId === "string");
}
