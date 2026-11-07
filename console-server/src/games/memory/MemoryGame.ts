import { Game } from "../../core/Game.js";
import { MatchOptions } from "../../core/Match.js";
import { MemoryMatch } from "./MemoryMatch.js";

export class MemoryGame extends Game {
  constructor() {
    super("memory-match", "Memoria", "Encuentra los ocho pares de cartas.", "1.0");
  }

  public createMatch(options?: MatchOptions): MemoryMatch {
    return new MemoryMatch(options);
  }
}
