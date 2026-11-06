import { Match, MatchOptions } from "../../core/Match.js";
import { Board } from "./Board.js";
import { PrologAiPlayer } from "../../ai/PrologAiPlayer.js";
import { EventFactory } from "../../events/EventFactory.js";
import { Player } from "../../core/Player.js";

export interface ConnectFourMatchOptions extends MatchOptions {
  level?: number;
  prologUrl?: string;
}

export interface ConnectFourPublicState {
  matchId: string;
  gameId: string;
  status: string;
  board: number[][];
  currentTurnPlayerId: string;
  currentTurnDisc: 1 | 2;
  level: number;
  movesCount: number;
  winnerId: string | null;
  humanPlayer?: { id: string; name: string };
  cpuPlayer?: { id: string; name: string };
}

/**
 * Logica y ciclo de vida de una partida de Cuatro en Linea contra IA Prolog.
 */
export class ConnectFourMatch extends Match {
  private readonly board: Board;
  private readonly level: number;
  private readonly aiPlayer: PrologAiPlayer;
  private currentTurnDisc: 1 | 2 = 1; // 1: humano primero, 2: computadora
  private movesCount = 0;
  private winnerId: string | null = null;
  private isAiThinking = false;

  constructor(options: ConnectFourMatchOptions = {}) {
    super("connect-four", options);
    this.board = new Board();
    this.level = options.level && [1, 2, 3].includes(options.level) ? options.level : 2;
    this.aiPlayer = new PrologAiPlayer(
      options.prologUrl || process.env.PROLOG_URL || "http://localhost:5000"
    );
    // Registrar jugador CPU
    this._players.set(this.aiPlayer.id, this.aiPlayer);
  }

  public getLevel(): number {
    return this.level;
  }

  public getMovesCount(): number {
    return this.movesCount;
  }

  public getBoard(): Board {
    return this.board;
  }

  public async handleAction(playerId: string, action: unknown): Promise<void> {
    if (this.status !== "RUNNING") {
      throw new Error(`La partida no esta en curso (estado: ${this.status})`);
    }

    if (this.isAiThinking) {
      throw new Error("La computadora esta procesando su turno. Espera por favor.");
    }

    const human = this.getHumanPlayer();
    if (!human || playerId !== human.id) {
      throw new Error("No es el turno de este jugador.");
    }

    if (this.currentTurnDisc !== 1) {
      throw new Error("Es el turno de la computadora.");
    }

    // Validar columna
    const col = (action as any)?.column;
    if (typeof col !== "number" || col < 0 || col >= Board.COLS) {
      throw new Error(`Columna invalida: ${col}. Debe ser un entero entre 0 y 6.`);
    }

    if (this.board.isColumnFull(col)) {
      throw new Error(`La columna ${col} esta completa.`);
    }

    // 1. Ejecutar jugada del humano
    const dropResult = this.board.drop(col, 1);
    this.movesCount++;

    this.emitEvent(
      EventFactory.create({
        gameId: this.gameId,
        gameVersion: this.gameVersion,
        matchId: this.matchId,
        playerId: human.id,
        type: "MOVE",
        action: "DROP_DISC",
        data: {
          column: col,
          row: dropResult.row,
          turn: this.movesCount,
        },
      })
    );

    // 2. Comprobar condicion de victoria del humano
    const winner = this.board.findWinner();
    if (winner === 1) {
      this.winnerId = human.id;
      this.emitEvent(
        EventFactory.create({
          gameId: this.gameId,
          gameVersion: this.gameVersion,
          matchId: this.matchId,
          playerId: human.id,
          type: "PLAYER_WON",
          action: "WIN",
          data: { playerId: human.id },
        })
      );
      this.finish("WIN", human.id, { moves: this.movesCount });
      return;
    }

    // 3. Comprobar empate por tablero lleno
    if (this.board.isFull()) {
      this.finish("DRAW", null, { moves: this.movesCount });
      return;
    }

    // 4. Cambiar turno a la computadora
    this.currentTurnDisc = 2;
    this.broadcastState();

    // 5. Turno de la computadora (asincrono, no bloquea peticiones)
    void this.executeAiTurn();
  }

  private async executeAiTurn(): Promise<void> {
    this.isAiThinking = true;
    try {
      const decision = await this.aiPlayer.decide({
        board: this.board.toMatrix(),
        level: this.level,
      });

      // Validar que la columna devuelta por Prolog sea valida
      if (this.board.isColumnFull(decision.column)) {
        throw new Error(`Prolog devolvio una columna llena (${decision.column})`);
      }

      // Emision de evento AI_DECISION (Seccion 5.2)
      this.emitEvent(
        EventFactory.create({
          gameId: this.gameId,
          gameVersion: this.gameVersion,
          matchId: this.matchId,
          playerId: this.aiPlayer.id,
          type: "AI_DECISION",
          action: "DROP_DISC",
          data: {
            column: decision.column,
            level: decision.level,
            nodes: decision.nodes,
            timeMs: decision.timeMs,
            score: decision.score,
          },
        })
      );

      // Aplicar jugada de la computadora en el tablero
      const dropResult = this.board.drop(decision.column, 2);
      this.movesCount++;

      // Emision de evento MOVE de la computadora
      this.emitEvent(
        EventFactory.create({
          gameId: this.gameId,
          gameVersion: this.gameVersion,
          matchId: this.matchId,
          playerId: this.aiPlayer.id,
          type: "MOVE",
          action: "DROP_DISC",
          data: {
            column: decision.column,
            row: dropResult.row,
            turn: this.movesCount,
          },
        })
      );

      // Comprobar si la computadora gano
      const winner = this.board.findWinner();
      const human = this.getHumanPlayer();

      if (winner === 2) {
        this.winnerId = this.aiPlayer.id;
        if (human) {
          this.emitEvent(
            EventFactory.create({
              gameId: this.gameId,
              gameVersion: this.gameVersion,
              matchId: this.matchId,
              playerId: human.id,
              type: "PLAYER_LOST",
              action: "LOSE",
              data: { playerId: human.id },
            })
          );
        }
        this.finish("LOSS", this.aiPlayer.id, { moves: this.movesCount });
        return;
      }

      // Comprobar empate
      if (this.board.isFull()) {
        this.finish("DRAW", null, { moves: this.movesCount });
        return;
      }

      // Turno regresa al humano
      this.currentTurnDisc = 1;
      this.broadcastState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fallo en motor de IA Prolog";
      this.emit("error", msg);
      this.broadcastState();
    } finally {
      this.isAiThinking = false;
    }
  }

  public getHumanPlayer(): Player | undefined {
    return Array.from(this._players.values()).find((p) => p.isHuman);
  }

  public override finish(
    result: "WIN" | "LOSS" | "DRAW" | "ABANDONED",
    winnerId: string | null = null,
    extraData: Record<string, unknown> = {}
  ): void {
    super.finish(result, winnerId, { moves: this.movesCount, ...extraData });
  }

  public getPublicState(): ConnectFourPublicState {
    const human = this.getHumanPlayer();
    const currentTurnPlayerId = this.currentTurnDisc === 1 ? human?.id ?? "" : this.aiPlayer.id;

    return {
      matchId: this.matchId,
      gameId: this.gameId,
      status: this.status,
      board: this.board.toMatrix(),
      currentTurnPlayerId,
      currentTurnDisc: this.currentTurnDisc,
      level: this.level,
      movesCount: this.movesCount,
      winnerId: this.winnerId,
      humanPlayer: human ? { id: human.id, name: human.name } : undefined,
      cpuPlayer: { id: this.aiPlayer.id, name: this.aiPlayer.name },
    };
  }
}
