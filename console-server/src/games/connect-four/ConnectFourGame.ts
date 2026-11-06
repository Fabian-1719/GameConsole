import { Game } from "../../core/Game.js";
import { MatchOptions } from "../../core/Match.js";
import { ConnectFourMatch } from "./ConnectFourMatch.js";

export class ConnectFourGame extends Game {
  constructor() {
    super(
      "connect-four",
      "Cuatro en Línea",
      "Juego de estrategia por turnos contra IA Minimax con poda alfa-beta implementada en Prolog"
    );
  }

  public createMatch(options?: MatchOptions): ConnectFourMatch {
    return new ConnectFourMatch(options);
  }
}
