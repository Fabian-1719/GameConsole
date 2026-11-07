import { Point } from "./Grid.js";

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

const DELTAS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

export function isDirection(value: unknown): value is Direction {
  return value === "UP" || value === "DOWN" || value === "LEFT" || value === "RIGHT";
}

export class Snake {
  private segments: Point[];
  private direction: Direction = "RIGHT";
  private readonly pendingDirections: Direction[] = [];

  constructor(size: number) {
    const center = Math.floor(size / 2);
    this.segments = [
      { x: center, y: center },
      { x: center - 1, y: center },
      { x: center - 2, y: center },
    ];
  }

  public getSegments(): Point[] {
    return this.segments.map((point) => ({ ...point }));
  }

  public getDirection(): Direction {
    return this.direction;
  }

  public queueDirection(direction: Direction): boolean {
    const previous = this.pendingDirections[this.pendingDirections.length - 1] ?? this.direction;
    if (direction === previous || direction === OPPOSITE[previous] || this.pendingDirections.length >= 2) {
      return false;
    }
    this.pendingDirections.push(direction);
    return true;
  }

  public applyPendingDirection(): boolean {
    const nextDirection = this.pendingDirections.shift();
    if (!nextDirection) {
      return false;
    }
    this.direction = nextDirection;
    return true;
  }

  public getNextHead(): Point {
    const delta = DELTAS[this.direction];
    const head = this.segments[0];
    return { x: head.x + delta.x, y: head.y + delta.y };
  }

  public occupies(point: Point, growing: boolean): boolean {
    const body = growing ? this.segments : this.segments.slice(0, -1);
    return body.some((segment) => segment.x === point.x && segment.y === point.y);
  }

  public move(growing: boolean): void {
    this.segments.unshift(this.getNextHead());
    if (!growing) {
      this.segments.pop();
    }
  }
}
