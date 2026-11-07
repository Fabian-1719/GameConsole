import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSocket } from "../src/net/MatchSocket.js";
import { matchSocketManager } from "../src/net/MatchSocketManager.js";

describe("MatchSocketManager", () => {
  beforeEach(() => {
    matchSocketManager.closeAll();
    vi.restoreAllMocks();
  });

  it("reuses the socket when opening the same match twice", () => {
    const connect = vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
    const first = matchSocketManager.open("match-1", "player-1");
    const second = matchSocketManager.open("match-1", "player-1");

    expect(second).toBe(first);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not close the socket when unsubscribing", () => {
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
    const close = vi.spyOn(MatchSocket.prototype, "close");
    matchSocketManager.open("match-1", "player-1");
    const unsubscribe = matchSocketManager.subscribe("match-1", {
      onState: vi.fn(),
      onFinished: vi.fn(),
      onError: vi.fn(),
    });

    unsubscribe();

    expect(close).not.toHaveBeenCalled();
    expect(matchSocketManager.has("match-1")).toBe(true);
  });

  it("sends the last state immediately to a new subscriber", () => {
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
    const entry = matchSocketManager.open("match-1", "player-1");
    const state = { status: "RUNNING", movesCount: 2 };
    entry.socket.onState?.(state);
    const onState = vi.fn();

    matchSocketManager.subscribe("match-1", {
      onState,
      onFinished: vi.fn(),
      onError: vi.fn(),
    });

    expect(matchSocketManager.getLastState("match-1")).toBe(state);
    expect(onState).toHaveBeenCalledWith(state);
  });

  it("closes and removes an abandoned match", () => {
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
    const close = vi.spyOn(MatchSocket.prototype, "close");
    matchSocketManager.open("match-1", "player-1");

    matchSocketManager.abandon("match-1");

    expect(close).toHaveBeenCalledTimes(1);
    expect(matchSocketManager.has("match-1")).toBe(false);
  });

  it("marks a finished match and closes its socket", () => {
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
    const close = vi.spyOn(MatchSocket.prototype, "close");
    const entry = matchSocketManager.open("match-1", "player-1");
    const onFinished = vi.fn();
    matchSocketManager.subscribe("match-1", {
      onState: vi.fn(),
      onFinished,
      onError: vi.fn(),
    });
    const finished = { type: "FINISHED", result: "WIN" } as const;

    entry.socket.onFinished?.(finished);

    expect(entry.finished).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith(finished);
  });
});
