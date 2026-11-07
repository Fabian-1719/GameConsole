import { Game } from "../../core/Game.js";
import { MatchOptions } from "../../core/Match.js";
import { SnakeMatch } from "./SnakeMatch.js";

export class SnakeGame extends Game {
  constructor() {
    super("snake-arena", "Snake", "Controla la serpiente, come y evita chocar.", "1.0");
  }

  public createMatch(options?: MatchOptions): SnakeMatch {
    return new SnakeMatch(options);
  }
}
