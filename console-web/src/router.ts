export type Route =
  | { kind: "console" }
  | { kind: "panel" }
  | { kind: "play"; gameId: string; matchId: string }
  | { kind: "not-found" };

export function parseRoute(pathname: string): Route {
  let segments: string[];
  try {
    segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { kind: "not-found" };
  }

  if (segments.length === 0) {
    return { kind: "console" };
  }
  if (segments.length === 1 && segments[0] === "panel") {
    return { kind: "panel" };
  }
  if (segments.length === 3 && segments[0] === "play") {
    return { kind: "play", gameId: segments[1], matchId: segments[2] };
  }
  return { kind: "not-found" };
}

export class Router {
  private readonly handlePopState = (): void => this.renderCurrentRoute();

  constructor(private readonly render: (route: Route) => void) {}

  public start(): void {
    window.addEventListener("popstate", this.handlePopState);
    this.renderCurrentRoute();
  }

  public navigate(path: string): void {
    window.history.pushState(null, "", path);
    this.renderCurrentRoute();
  }

  public stop(): void {
    window.removeEventListener("popstate", this.handlePopState);
  }

  private renderCurrentRoute(): void {
    this.render(parseRoute(window.location.pathname));
  }
}
