import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchSocket } from "../src/net/MatchSocket.js";

class MockWebSocket {
  public static readonly OPEN = 1;
  public static instances: MockWebSocket[] = [];
  public readyState = MockWebSocket.OPEN;
  public readonly sent: string[] = [];
  public readonly listeners = new Map<string, EventListener[]>();

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  public addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {}

  public emit(type: string, event: Event): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

describe("MatchSocket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it("conecta con la partida y envía ACTION en el contrato esperado", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("location", { protocol: "https:", host: "console.example" });
    const socket = new MatchSocket("m-123", "p-456");

    socket.connect();
    socket.sendAction({ column: 3 });

    expect(MockWebSocket.instances[0].url).toBe(
      "wss://console.example/ws/matches/m-123?playerId=p-456"
    );
    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({
      type: "ACTION",
      playerId: "p-456",
      payload: { column: 3 },
    });
  });

  it("entrega al consumidor los estados, finalización y errores del servidor", () => {
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:3000" });
    const socket = new MatchSocket("m-123", "p-456");
    const onState = vi.fn();
    const onFinished = vi.fn();
    const onError = vi.fn();
    socket.onState = onState;
    socket.onFinished = onFinished;
    socket.onError = onError;
    socket.connect();

    const webSocket = MockWebSocket.instances[0];
    const send = (message: unknown) => webSocket.emit("message", {
      data: JSON.stringify(message),
    } as MessageEvent<string> as Event);

    send({ type: "STATE", state: { movesCount: 2 } });
    send({ type: "FINISHED", result: "DRAW" });
    send({ type: "ERROR", message: "Acción inválida" });

    expect(onState).toHaveBeenCalledWith({ movesCount: 2 });
    expect(onFinished).toHaveBeenCalledWith({ type: "FINISHED", result: "DRAW" });
    expect(onError).toHaveBeenCalledWith("Acción inválida");
  });
});
