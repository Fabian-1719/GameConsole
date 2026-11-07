import { Grid, Point } from "./Grid.js";

export class Food {
  private position: Point | null;

  constructor(private readonly grid: Grid, occupied: Point[]) {
    this.position = grid.getRandomFreeCell(occupied);
  }

  public getPosition(): Point | null {
    return this.position ? { ...this.position } : null;
  }

  public place(occupied: Point[]): boolean {
    this.position = this.grid.getRandomFreeCell(occupied);
    return this.position !== null;
  }
}
