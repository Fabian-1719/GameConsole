import { MatchSocket, MatchFinishedMessage } from "./MatchSocket.js";

export interface MatchSocketListeners {
  onState: (state: unknown) => void;
  onFinished: (message: MatchFinishedMessage) => void;
  onError: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface ManagedMatchSocket {
  socket: MatchSocket;
  lastState: unknown | null;
  finished: boolean;
  listeners: Set<MatchSocketListeners>;
}

export class MatchSocketManager {
  private static instance?: MatchSocketManager;
  private readonly matches = new Map<string, ManagedMatchSocket>();

  private constructor() {}

  public static getInstance(): MatchSocketManager {
    MatchSocketManager.instance ??= new MatchSocketManager();
    return MatchSocketManager.instance;
  }

  public open(matchId: string, playerId: string): ManagedMatchSocket {
    const existing = this.matches.get(matchId);
    if (existing) {
      return existing;
    }

    const socket = new MatchSocket(matchId, playerId);
    const entry: ManagedMatchSocket = {
      socket,
      lastState: null,
      finished: false,
      listeners: new Set(),
    };
    this.matches.set(matchId, entry);

    socket.onOpen = () => {
      entry.listeners.forEach((listener) => listener.onOpen?.());
    };
    socket.onState = (state) => {
      entry.lastState = state;
      entry.listeners.forEach((listener) => listener.onState(state));
    };
    socket.onFinished = (message) => {
      entry.finished = true;
      entry.listeners.forEach((listener) => listener.onFinished(message));
      socket.close();
    };
    socket.onError = (message) => {
      entry.listeners.forEach((listener) => listener.onError(message));
    };
    socket.onClose = () => {
      entry.listeners.forEach((listener) => listener.onClose?.());
    };

    try {
      socket.connect();
    } catch (error) {
      this.matches.delete(matchId);
      throw error;
    }

    return entry;
  }

  public subscribe(matchId: string, listeners: MatchSocketListeners): () => void {
    const entry = this.matches.get(matchId);
    if (!entry) {
      throw new Error(`No hay una conexión abierta para la partida "${matchId}"`);
    }
    entry.listeners.add(listeners);
    if (entry.lastState !== null) {
      listeners.onState(entry.lastState);
    }
    return () => entry.listeners.delete(listeners);
  }

  public sendAction(matchId: string, payload: unknown): void {
    const entry = this.matches.get(matchId);
    if (!entry || entry.finished) {
      throw new Error(`La partida "${matchId}" no tiene una conexión activa`);
    }
    entry.socket.sendAction(payload);
  }

  public abandon(matchId: string): void {
    const entry = this.matches.get(matchId);
    if (!entry) {
      return;
    }
    this.matches.delete(matchId);
    entry.socket.close();
  }

  public closeAll(): void {
    const entries = [...this.matches.values()];
    this.matches.clear();
    entries.forEach((entry) => entry.socket.close());
  }

  public has(matchId: string): boolean {
    return this.matches.has(matchId);
  }

  public getLastState(matchId: string): unknown | null {
    return this.matches.get(matchId)?.lastState ?? null;
  }
}

export const matchSocketManager = MatchSocketManager.getInstance();
