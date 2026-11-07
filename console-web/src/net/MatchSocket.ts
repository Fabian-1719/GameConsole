export interface MatchStateMessage {
  type: "STATE";
  state: unknown;
}

export interface MatchFinishedMessage {
  type: "FINISHED";
  [key: string]: unknown;
}

export class MatchSocket {
  public onOpen?: () => void;
  public onState?: (state: unknown) => void;
  public onFinished?: (message: MatchFinishedMessage) => void;
  public onError?: (message: string) => void;
  public onClose?: () => void;

  private socket?: WebSocket;

  constructor(
    private readonly matchId: string,
    private readonly playerId: string
  ) {}

  public connect(): void {
    if (this.socket) {
      throw new Error("El WebSocket de esta partida ya fue conectado");
    }

    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const path = `/ws/matches/${encodeURIComponent(this.matchId)}`;
    const query = new URLSearchParams({ playerId: this.playerId });
    this.socket = new WebSocket(`${scheme}//${location.host}${path}?${query}`);

    this.socket.addEventListener("open", () => this.onOpen?.());
    this.socket.addEventListener("message", (event: MessageEvent<string>) => {
      this.handleMessage(event.data);
    });
    this.socket.addEventListener("close", () => this.onClose?.());
    this.socket.addEventListener("error", () => {
      this.onError?.("Error de conexión WebSocket");
    });
  }

  public sendAction(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("El WebSocket de la partida no está conectado");
    }
    this.socket.send(JSON.stringify({
      type: "ACTION",
      playerId: this.playerId,
      payload,
    }));
  }

  public close(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private handleMessage(data: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch {
      this.onError?.("El servidor envió un mensaje WebSocket inválido");
      return;
    }

    switch (message.type) {
      case "STATE":
        this.onState?.(message.state);
        break;
      case "FINISHED":
        this.onFinished?.(message as MatchFinishedMessage);
        break;
      case "ERROR":
        this.onError?.(String(message.message ?? "Error de partida"));
        break;
      default:
        this.onError?.(`Tipo de mensaje desconocido: ${String(message.type)}`);
    }
  }
}
