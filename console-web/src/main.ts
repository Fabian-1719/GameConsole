import { ApiClient } from "./api/ApiClient.js";
import { ConsoleView } from "./ConsoleView.js";
import { ConnectFourView } from "./games/connect-four/ConnectFourView.js";
import { SnakeView } from "./games/snake/SnakeView.js";
import { matchSocketManager } from "./net/MatchSocketManager.js";
import { Router, Route } from "./router.js";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("No se encontró el contenedor #app");
}
const appRoot = root;

const api = new ApiClient();
let destroyCurrentView: (() => void) | undefined;
window.addEventListener("beforeunload", () => matchSocketManager.closeAll(), { once: true });

function render(route: Route): void {
  destroyCurrentView?.();
  destroyCurrentView = undefined;
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.pathname === window.location.pathname);
  });

  switch (route.kind) {
    case "console": {
      const view = new ConsoleView(appRoot, api, (path) => router.navigate(path));
      destroyCurrentView = () => view.destroy();
      break;
    }
    case "panel":
      appRoot.innerHTML = '<section class="page-heading"><p class="eyebrow">ANÁLISIS</p><h1>Panel</h1><p class="muted">Panel (pendiente)</p><a class="button button-quiet" href="/" data-back>← Volver a la consola</a></section>';
      appRoot.querySelector("[data-back]")?.addEventListener("click", (event) => {
        event.preventDefault();
        router.navigate("/");
      });
      break;
    case "play":
      renderMatch(route);
      break;
    case "not-found":
      appRoot.innerHTML = '<section class="page-heading"><h1>Página no encontrada</h1><a class="text-link" href="/" data-back>Volver a la consola</a></section>';
      appRoot.querySelector("[data-back]")?.addEventListener("click", (event) => {
        event.preventDefault();
        router.navigate("/");
      });
      break;
  }
}

function renderMatch(route: Extract<Route, { kind: "play" }>): void {
  const playerId = window.sessionStorage.getItem(`player:${route.matchId}`);
  const spectator = new URLSearchParams(window.location.search).get("spectator") === "1";
  if (!playerId && !spectator) {
    const spectatorPath = `/play/${encodeURIComponent(route.gameId)}/${encodeURIComponent(route.matchId)}?spectator=1`;
    appRoot.innerHTML = `
      <section class="empty-state">
        <p class="eyebrow">ACCESO A PARTIDA</p>
        <h1>Esta partida pertenece a otra pestaña</h1>
        <p class="muted">Esta dirección intenta entrar como jugador, pero esta pestaña no tiene su jugador guardado. Para verla sin jugar, abre la vista de espectador.</p>
        <a class="button button-primary" href="${escapeHtml(spectatorPath)}">Ver partida como espectador</a>
        <a class="button button-quiet" href="/" data-back>← Volver a la consola</a>
      </section>`;
    appRoot.querySelector("[data-back]")?.addEventListener("click", (event) => {
      event.preventDefault();
      router.navigate("/");
    });
    return;
  }

  if (route.gameId !== "connect-four" && route.gameId !== "snake-arena") {
    appRoot.innerHTML = `<section class="page-heading"><h1>Vista pendiente</h1><p class="muted">${escapeHtml(route.gameId)} aún no tiene interfaz.</p><a class="button button-quiet" href="/" data-back>← Volver a la consola</a></section>`;
    appRoot.querySelector("[data-back]")?.addEventListener("click", (event) => {
      event.preventDefault();
      router.navigate("/");
    });
    return;
  }

  if (route.gameId === "connect-four") {
    const view = new ConnectFourView(
      appRoot,
      route.matchId,
      spectator ? `spectator-${crypto.randomUUID()}` : playerId!,
      spectator
    );
    destroyCurrentView = () => view.destroy();
  } else {
    const view = new SnakeView(
      appRoot,
      route.matchId,
      spectator ? `spectator-${crypto.randomUUID()}` : playerId!,
      (path) => router.navigate(path),
      async () => {
        const match = await api.createMatch("snake-arena");
        window.sessionStorage.setItem(`player:${match.matchId}`, match.playerId);
        matchSocketManager.open(match.matchId, match.playerId);
        router.navigate(`/play/${encodeURIComponent(match.gameId)}/${encodeURIComponent(match.matchId)}`);
      },
      spectator
    );
    destroyCurrentView = () => view.destroy();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

const router = new Router(render);
document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    router.navigate(link.pathname);
  });
});
router.start();
