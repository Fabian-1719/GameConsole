import { Match, MatchOptions } from "./Match.js";

/**
 * Abstraccion base para cualquier definicion de juego registrada en GameConsole.
 */
export abstract class Game {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly version: string = "1.0"
  ) {}

  public abstract createMatch(options?: MatchOptions): Match;
}
