import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectFourView } from "../src/games/connect-four/ConnectFourView.js";
import { MatchSocket } from "../src/net/MatchSocket.js";
import { matchSocketManager } from "../src/net/MatchSocketManager.js";

class FakeElement {
  public constructor(private readonly matchedSelector?: string) {}

  public closest(selector: string): FakeElement | null {
    return selector === this.matchedSelector ? this : null;
  }
}

function createRoot(): {
  root: HTMLElement;
  elements: Map<string, { textContent: string; innerHTML?: string }>;
} {
  const elements = new Map([
    ["[data-board]", { textContent: "", innerHTML: "" }],
    ["[data-turn]", { textContent: "" }],
    ["[data-level]", { textContent: "" }],
    ["[data-moves]", { textContent: "" }],
    ["[data-status]", { textContent: "" }],
    ["[data-connection]", { textContent: "" }],
    ["[data-error]", { textContent: "" }],
  ]);
  const root = {
    innerHTML: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn((selector: string) => elements.get(selector) ?? null),
    querySelectorAll: vi.fn(() => []),
  } as unknown as HTMLElement;
  return { root, elements };
}

describe("ConnectFourView", () => {
  beforeEach(() => {
    matchSocketManager.closeAll();
    vi.stubGlobal("Element", FakeElement);
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
  });

  afterEach(() => {
    matchSocketManager.closeAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("muestra la jugada final y resalta las cuatro fichas antes del aviso de victoria", () => {
    const { root, elements } = createRoot();
    const view = new ConnectFourView(root, "match-final", "p-human");
    const socket = matchSocketManager.open("match-final", "p-human").socket;
    const board = Array.from({ length: 6 }, () => Array<number>(7).fill(0));
    board[5].splice(0, 4, 2, 2, 2, 2);

    socket.onState?.({
      status: "FINISHED",
      board,
      currentTurnDisc: 2,
      level: 2,
      movesCount: 8,
      winnerId: "cpu-prolog",
      winningCells: [0, 1, 2, 3].map((column) => ({ row: 5, column })),
    });

    const finalBoard = elements.get("[data-board]")?.innerHTML ?? "";
    expect(finalBoard.match(/cell-winning/g)).toHaveLength(4);
    expect(finalBoard).toContain("disc-cpu");

    socket.onFinished?.({ type: "FINISHED", result: "LOSS", winnerId: "cpu-prolog" });
    expect(elements.get("[data-status]")?.textContent)
      .toBe("La computadora conectó cuatro en línea y ganó.");
    view.destroy();
  });
});
