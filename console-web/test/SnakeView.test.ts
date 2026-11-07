import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSocket } from "../src/net/MatchSocket.js";
import { matchSocketManager } from "../src/net/MatchSocketManager.js";
import { SnakeView } from "../src/games/snake/SnakeView.js";

class FakeElement {
  public constructor(private readonly matchedSelector?: string) {}

  public closest(selector: string): FakeElement | null {
    return selector === this.matchedSelector ? this : null;
  }
}

function createRoot(): HTMLElement {
  const canvas = {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width: 400, height: 400 }),
  };
  return {
    innerHTML: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn((selector: string) => selector === "[data-snake-board]" ? canvas : null),
  } as unknown as HTMLElement;
}

describe("SnakeView lifecycle", () => {
  const windowListeners = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    sessionStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    },
    devicePixelRatio: 1,
  };
  const documentListeners = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    visibilityState: "visible",
  };

  beforeEach(() => {
    matchSocketManager.closeAll();
    vi.restoreAllMocks();
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("window", windowListeners);
    vi.stubGlobal("document", documentListeners);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(MatchSocket.prototype, "connect").mockImplementation(() => undefined);
  });

  afterEach(() => {
    matchSocketManager.closeAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("pauses on view exit without closing the socket and removes its listeners", () => {
    const root = createRoot();
    const view = new SnakeView(root, "snake-match", "snake-player", vi.fn(), async () => undefined);
    const entry = matchSocketManager.open("snake-match", "snake-player");
    const sendAction = vi.spyOn(entry.socket, "sendAction").mockImplementation(() => undefined);
    const close = vi.spyOn(entry.socket, "close").mockImplementation(() => undefined);

    view.destroy();

    expect(sendAction).toHaveBeenCalledWith({ type: "PAUSE" });
    expect(close).not.toHaveBeenCalled();
    expect(matchSocketManager.has("snake-match")).toBe(true);
    expect(root.removeEventListener).toHaveBeenCalledWith("click", expect.any(Function));
    expect(windowListeners.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(windowListeners.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(documentListeners.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("pauses with a single click on the pause button", () => {
    const root = createRoot();
    const view = new SnakeView(root, "snake-click-match", "snake-click-player", vi.fn(), async () => undefined);
    const entry = matchSocketManager.open("snake-click-match", "snake-click-player");
    const sendAction = vi.spyOn(entry.socket, "sendAction").mockImplementation(() => undefined);
    const clickHandler = vi.mocked(root.addEventListener).mock.calls
      .find(([eventName]) => eventName === "click")?.[1] as EventListener;

    clickHandler({ target: new FakeElement("[data-pause-toggle]"), preventDefault: vi.fn() } as unknown as Event);

    expect(sendAction).toHaveBeenCalledOnce();
    expect(sendAction).toHaveBeenCalledWith({ type: "PAUSE" });
    view.destroy();
  });
});
