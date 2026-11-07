import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryView } from "../src/games/memory/MemoryView.js";
import { MatchSocket } from "../src/net/MatchSocket.js";
import { matchSocketManager } from "../src/net/MatchSocketManager.js";

class FakeElement {
  public constructor(private readonly matchedSelector?: string) {}

  public closest(selector: string): FakeElement | null {
    return selector === this.matchedSelector ? this : null;
  }
}

class FakeCardButton extends FakeElement {
  public disabled = false;
  public readonly dataset = { cardIndex: "0" };

  constructor() {
    super("button[data-card-index]");
  }
}

function createRoot(): HTMLElement {
  const elements = new Map<string, { textContent: string | null; innerHTML?: string }>();
  return {
    innerHTML: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn((selector: string) => {
      let element = elements.get(selector);
      if (!element) {
        element = { textContent: "" };
        elements.set(selector, element);
      }
      return element;
    }),
    querySelectorAll: vi.fn(() => []),
  } as unknown as HTMLElement;
}

describe("MemoryView", () => {
  beforeEach(() => {
    matchSocketManager.closeAll();
    vi.restoreAllMocks();
    vi.stubGlobal("Element", FakeElement);
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
  });

  afterEach(() => {
    matchSocketManager.closeAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends a card flip on click and blocks clicks while a mismatch is pending", () => {
    const root = createRoot();
    const view = new MemoryView(root, "memory-view-match", "memory-view-player", vi.fn(), async () => undefined);
    const entry = matchSocketManager.open("memory-view-match", "memory-view-player");
    const sendAction = vi.spyOn(entry.socket, "sendAction").mockImplementation(() => undefined);
    const clickHandler = vi.mocked(root.addEventListener).mock.calls
      .find(([eventName]) => eventName === "click")?.[1] as EventListener;
    const state = {
      matchId: "memory-view-match",
      gameId: "memory-match",
      status: "RUNNING",
      cards: [
        { index: 0, state: "HIDDEN" as const },
        { index: 1, state: "HIDDEN" as const },
      ],
      attempts: 0,
      pairsMatched: 0,
      pendingHide: false,
    };
    entry.socket.onState?.(state);
    const click = (): void => {
      clickHandler({
        target: new FakeCardButton(),
        preventDefault: vi.fn(),
      } as unknown as Event);
    };

    click();
    expect(sendAction).toHaveBeenCalledOnce();
    expect(sendAction).toHaveBeenCalledWith({ cardIndex: 0 });

    entry.socket.onState?.({ ...state, pendingHide: true });
    click();
    expect(sendAction).toHaveBeenCalledOnce();
    view.destroy();
  });
});
