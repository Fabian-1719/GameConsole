import { describe, it, expect } from "vitest";
import { Board } from "../src/games/connect-four/Board.js";

describe("Reglas del Tablero de Cuatro en Línea (Board)", () => {
  it("la ficha cae por gravedad a la fila más baja disponible", () => {
    const board = new Board();

    const d1 = board.drop(3, 1);
    expect(d1.row).toBe(5); // Fila inferior (base)
    expect(d1.column).toBe(3);
    expect(board.getCell(5, 3)).toBe(1);

    const d2 = board.drop(3, 2);
    expect(d2.row).toBe(4); // Fila encima de la anterior
    expect(board.getCell(4, 3)).toBe(2);
  });

  it("rechaza columnas fuera de rango y columnas llenas", () => {
    const board = new Board();

    expect(() => board.drop(-1, 1)).toThrowError(/fuera de rango/);
    expect(() => board.drop(7, 1)).toThrowError(/fuera de rango/);

    // Llenar columna 0 con 6 fichas
    for (let i = 0; i < 6; i++) {
      board.drop(0, 1);
    }

    expect(board.isColumnFull(0)).toBe(true);
    expect(() => board.drop(0, 2)).toThrowError(/esta llena/);
  });

  it("detecta victoria horizontal", () => {
    const board = new Board();
    // 4 fichas en fila en la base (fila 5, columnas 1, 2, 3, 4)
    board.drop(1, 1);
    board.drop(2, 1);
    board.drop(3, 1);
    expect(board.findWinner()).toBeNull();

    board.drop(4, 1);
    expect(board.findWinner()).toBe(1);
  });

  it("detecta victoria vertical", () => {
    const board = new Board();
    // 4 fichas apiladas en columna 2
    board.drop(2, 2);
    board.drop(2, 2);
    board.drop(2, 2);
    expect(board.findWinner()).toBeNull();

    board.drop(2, 2);
    expect(board.findWinner()).toBe(2);
  });

  it("detecta victoria diagonal descendente (\\)", () => {
    const board = new Board();
    // Construir diagonal para jugador 1:
    // col 0: 1 en fila 2
    // col 1: 1 en fila 3
    // col 2: 1 en fila 4
    // col 3: 1 en fila 5
    // Relleno para dar altura:
    // col 0 necesita 3 fichas abajo (filas 5,4,3)
    board.drop(0, 2); board.drop(0, 2); board.drop(0, 2); board.drop(0, 1); // fila 2
    // col 1 necesita 2 fichas abajo (filas 5,4)
    board.drop(1, 2); board.drop(1, 2); board.drop(1, 1); // fila 3
    // col 2 necesita 1 ficha abajo (fila 5)
    board.drop(2, 2); board.drop(2, 1); // fila 4
    // col 3 en la base
    board.drop(3, 1); // fila 5

    expect(board.findWinner()).toBe(1);
  });

  it("detecta victoria diagonal ascendente (/)", () => {
    const board = new Board();
    // Construir diagonal ascendente para jugador 2:
    // col 0 en fila 5
    board.drop(0, 2);
    // col 1 en fila 4
    board.drop(1, 1); board.drop(1, 2);
    // col 2 en fila 3
    board.drop(2, 1); board.drop(2, 1); board.drop(2, 2);
    // col 3 en fila 2
    board.drop(3, 1); board.drop(3, 1); board.drop(3, 1); board.drop(3, 2);

    expect(board.findWinner()).toBe(2);
  });
});
