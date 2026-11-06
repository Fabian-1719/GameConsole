/**
 * Abstraccion base para cualquier jugador en GameConsole.
 */
export abstract class Player {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly isHuman: boolean
  ) {}
}

export class HumanPlayer extends Player {
  constructor(id: string, name: string) {
    super(id, name, true);
  }
}

export abstract class AiPlayer extends Player {
  constructor(id: string, name: string) {
    super(id, name, false);
  }

  public abstract decide(state: unknown): Promise<unknown>;
}
