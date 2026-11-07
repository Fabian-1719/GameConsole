import { ApiClient } from "./api/ApiClient.js";
import { ConsoleView } from "./ConsoleView.js";
import { ConnectFourView } from "./games/connect-four/ConnectFourView.js";
import { Router, Route } from "./router.js";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("No se encontró el contenedor #app");
}
const appRoot = root;

const api = new ApiClient();
let destroyCurrentView: (() => void) | undefined;

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
    appRoot.innerHTML = `
      <section class="empty-state">
        <p class="eyebrow">ACCESO A PARTIDA</p>
        <h1>Esta partida pertenece a otra pestaña</h1>
        <p class="muted">No hay un jugador guardado en esta pestaña; no se puede controlar esta partida.</p>
        <a class="button button-primary" href="/" data-back>← Volver a la consola</a>
      </section>`;
    appRoot.querySelector("[data-back]")?.addEventListener("click", (event) => {
      event.preventDefault();
      router.navigate("/");
    });
    return;
  }

  if (route.gameId !== "connect-four") {
    appRoot.innerHTML = `<section class="page-heading"><h1>Vista pendiente</h1><p class="muted">${escapeHtml(route.gameId)} aún no tiene interfaz.</p><a class="button button-quiet" href="/" data-back>← Volver a la consola</a></section>`;
    appRoot.querySelector("[data-back]")?.addEventListener("click", (event) => {
      event.preventDefault();
      router.navigate("/");
    });
    return;
  }

  const view = new ConnectFourView(
    appRoot,
    route.matchId,
    spectator ? `spectator-${crypto.randomUUID()}` : playerId!,
    spectator
  );
  destroyCurrentView = () => view.destroy();
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
