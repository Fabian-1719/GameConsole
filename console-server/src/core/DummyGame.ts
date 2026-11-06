import { Game } from "./Game.js";
import { Match, MatchOptions } from "./Match.js";
import { EventFactory } from "../events/EventFactory.js";

export class DummyMatch extends Match {
  private counter = 0;

  constructor(options: MatchOptions = {}) {
    super("dummy-game", options);
  }

  public handleAction(playerId: string, action: unknown): void {
    if (this.status !== "RUNNING") {
      throw new Error("La partida no esta en curso");
    }

    this.counter++;
    this.emitEvent(
      EventFactory.create({
        gameId: this.gameId,
        matchId: this.matchId,
        playerId,
        type: "DUMMY_ACTION",
        action: "INCREMENT",
        data: { counter: this.counter, payload: action },
      })
    );

    if (this.counter >= 5) {
      this.finish("WIN", playerId, { finalCounter: this.counter });
    } else {
      this.broadcastState();
    }
  }

  public getPublicState(): { counter: number; status: string } {
    return {
      counter: this.counter,
      status: this.status,
    };
  }
}

export class DummyGame extends Game {
  constructor() {
    super("dummy-game", "Juego Dummy de Prueba", "Utilizado exclusivamente para validar el nucleo OOP");
  }

  public createMatch(options?: MatchOptions): DummyMatch {
    return new DummyMatch(options);
  }
}
