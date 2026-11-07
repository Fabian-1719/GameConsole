export interface Point {
  x: number;
  y: number;
}

export class Grid {
  private readonly size: number;

  constructor(size = 20) {
    if (!Number.isInteger(size) || size < 5 || size > 100) {
      throw new Error("El tamaño del tablero debe ser un entero entre 5 y 100");
    }
    this.size = size;
  }

  public getSize(): number {
    return this.size;
  }

  public contains(point: Point): boolean {
    return point.x >= 0 && point.x < this.size && point.y >= 0 && point.y < this.size;
  }

  public getRandomFreeCell(occupied: Point[]): Point | null {
    const occupiedKeys = new Set(occupied.map((point) => `${point.x},${point.y}`));
    const free: Point[] = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!occupiedKeys.has(`${x},${y}`)) {
          free.push({ x, y });
        }
      }
    }
    if (free.length === 0) {
      return null;
    }
    return free[Math.floor(Math.random() * free.length)];
  }
}
