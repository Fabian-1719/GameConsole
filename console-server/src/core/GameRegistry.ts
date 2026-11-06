import { Game } from "./Game.js";

/**
 * Registro central de juegos. Permite agregar nuevos juegos de forma desacoplada y abierta a extension.
 */
export class GameRegistry {
  private games = new Map<string, Game>();

  public register(game: Game): void {
    if (this.games.has(game.id)) {
      throw new Error(`El juego con id "${game.id}" ya esta registrado`);
    }
    this.games.set(game.id, game);
  }

  public get(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  public getAll(): Game[] {
    return Array.from(this.games.values());
  }

  public has(gameId: string): boolean {
    return this.games.has(gameId);
  }
}
