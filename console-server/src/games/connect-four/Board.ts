export type Disc = 0 | 1 | 2; // 0: vacio, 1: humano, 2: computadora

export class Board {
  public static readonly ROWS = 6;
  public static readonly COLS = 7;

  private grid: Disc[][];

  constructor(initialGrid?: Disc[][]) {
    if (initialGrid) {
      this.grid = initialGrid.map((row) => [...row]);
    } else {
      this.grid = Array.from({ length: Board.ROWS }, () =>
        Array.from({ length: Board.COLS }, () => 0 as Disc)
      );
    }
  }

  public getCell(row: number, col: number): Disc {
    if (row < 0 || row >= Board.ROWS || col < 0 || col >= Board.COLS) {
      throw new Error(`Coordenadas fuera de rango: (${row}, ${col})`);
    }
    return this.grid[row][col];
  }

  public isColumnFull(col: number): boolean {
    if (col < 0 || col >= Board.COLS) return true;
    return this.grid[0][col] !== 0;
  }

  public isFull(): boolean {
    for (let c = 0; c < Board.COLS; c++) {
      if (this.grid[0][c] === 0) return false;
    }
    return true;
  }

  public drop(col: number, disc: 1 | 2): { row: number; column: number } {
    if (col < 0 || col >= Board.COLS) {
      throw new Error(`Columna fuera de rango: ${col}. Debe ser entre 0 y 6.`);
    }

    if (this.isColumnFull(col)) {
      throw new Error(`La columna ${col} esta llena.`);
    }

    // Gravedad: buscar de abajo hacia arriba (fila 5 a 0)
    for (let r = Board.ROWS - 1; r >= 0; r--) {
      if (this.grid[r][col] === 0) {
        this.grid[r][col] = disc;
        return { row: r, column: col };
      }
    }

    throw new Error(`No se pudo colocar ficha en columna ${col}`);
  }

  public findWinner(): Disc | null {
    // 1. Horizontal
    for (let r = 0; r < Board.ROWS; r++) {
      for (let c = 0; c <= Board.COLS - 4; c++) {
        const val = this.grid[r][c];
        if (
          val !== 0 &&
          val === this.grid[r][c + 1] &&
          val === this.grid[r][c + 2] &&
          val === this.grid[r][c + 3]
        ) {
          return val;
        }
      }
    }

    // 2. Vertical
    for (let r = 0; r <= Board.ROWS - 4; r++) {
      for (let c = 0; c < Board.COLS; c++) {
        const val = this.grid[r][c];
        if (
          val !== 0 &&
          val === this.grid[r + 1][c] &&
          val === this.grid[r + 2][c] &&
          val === this.grid[r + 3][c]
        ) {
          return val;
        }
      }
    }

    // 3. Diagonal descendente (\)
    for (let r = 0; r <= Board.ROWS - 4; r++) {
      for (let c = 0; c <= Board.COLS - 4; c++) {
        const val = this.grid[r][c];
        if (
          val !== 0 &&
          val === this.grid[r + 1][c + 1] &&
          val === this.grid[r + 2][c + 2] &&
          val === this.grid[r + 3][c + 3]
        ) {
          return val;
        }
      }
    }

    // 4. Diagonal ascendente (/)
    for (let r = 3; r < Board.ROWS; r++) {
      for (let c = 0; c <= Board.COLS - 4; c++) {
        const val = this.grid[r][c];
        if (
          val !== 0 &&
          val === this.grid[r - 1][c + 1] &&
          val === this.grid[r - 2][c + 2] &&
          val === this.grid[r - 3][c + 3]
        ) {
          return val;
        }
      }
    }

    return null;
  }

  public toMatrix(): Disc[][] {
    return this.grid.map((row) => [...row]);
  }
}
