import type { Game, GameStats, GeneralStats } from "../api/ApiClient.js";

/**
 * Funciones que SOLO dan formato (texto, %, segundos) a lo que devuelve GameStats.
 * No suman, no promedian, no cuentan: cada número llega ya calculado desde Scala.
 */

export const CONSOLE_GAMES = ["connect-four", "snake-arena", "memory-match"] as const;

const PATTERN_LABELS: Record<string, string> = {
  LIGHTNING_WIN: "Victorias relámpago",
  FOOD_STREAK: "Rachas de comida",
  PERFECT_MEMORY: "Memorias perfectas",
};

export function renderGeneral(stats: GeneralStats, games: Game[]): string {
  const perGame = CONSOLE_GAMES.map((id) =>
    metric(`Partidas · ${gameName(id, games)}`, String(stats.matchesByGame[id] ?? 0))
  ).join("");
  return `<dl class="analytics-metrics stats-general">
    ${metric("Partidas totales", String(stats.totalMatches))}
    ${metric("Completadas", String(stats.completedMatches))}
    ${metric("Abandonadas", String(stats.abandonedMatches))}
    ${metric("Jugadores", String(stats.players))}
    ${metric("Eventos recibidos", String(stats.events))}
    ${perGame}
  </dl>`;
}

export function renderGame(stats: GameStats, games: Game[]): string {
  const patterns = Object.entries(stats.patterns)
    .map(([kind, count]) => metric(PATTERN_LABELS[kind] ?? kind, String(count)))
    .join("");
  return `<article class="analytics-card" data-game-stats="${escapeHtml(stats.gameId)}">
    <div class="analytics-card-heading">
      <div><p class="eyebrow">${escapeHtml(stats.gameId)}</p><h3>${escapeHtml(gameName(stats.gameId, games))}</h3></div>
      <span class="status-pill">${stats.instances} ${stats.instances === 1 ? "instancia" : "instancias"}</span>
    </div>
    <dl class="analytics-metrics">
      ${metric("Instancias ejecutadas", String(stats.instances))}
      ${metric("Victorias", String(stats.wins))}
      ${metric("Derrotas", String(stats.losses))}
      ${metric("Empates", String(stats.draws))}
      ${metric("Abandonadas", String(stats.abandoned))}
      ${metric("Duración promedio", seconds(stats.avgDurationMs))}
      ${metric("Jugadores", String(stats.players))}
      ${patterns}
      ${gameSpecific(stats)}
    </dl>
    ${stats.gameId === "connect-four" ? levelTable(stats.metrics.byLevel) : ""}
  </article>`;
}

function gameSpecific(stats: GameStats): string {
  const m = stats.metrics;
  switch (stats.gameId) {
    case "connect-four":
      return metric("Jugadas promedio", decimal(m.avgMoves, 1)) +
        metric("Decisión media de la IA", ms(m.avgAiTimeMs)) +
        metric("Nodos evaluados por Prolog", decimal(m.totalNodes, 0));
    case "snake-arena":
      return metric("Puntaje máximo", decimal(m.bestScore, 0)) +
        metric("Puntaje promedio", decimal(m.avgScore, 1)) +
        metric("Largo promedio", decimal(m.avgLength, 1)) +
        metric("Comidas por minuto", decimal(m.avgFoodPerMinute, 1));
    case "memory-match":
      return metric("Precisión promedio", percent(m.avgAccuracy)) +
        metric("Intentos promedio", decimal(m.avgAttempts, 1)) +
        metric("Mejor nº de intentos", decimal(m.bestAttempts, 0)) +
        metric("Pares encontrados", decimal(m.totalPairs, 0));
    default:
      return "";
  }
}

/** Tabla "nivel de la IA contra resultado" de Cuatro en Línea. */
function levelTable(value: unknown): string {
  const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  if (rows.length === 0) {
    return '<p class="muted">Todavía no hay partidas contra la IA para comparar niveles.</p>';
  }
  const body = rows.map((row) => `<tr>
      <td>Nivel ${escapeHtml(String(row.level))}</td>
      <td>${escapeHtml(String(row.matches))}</td>
      <td>${escapeHtml(String(row.humanWins))}</td>
      <td>${escapeHtml(String(row.aiWins))}</td>
      <td>${escapeHtml(String(row.draws))}</td>
      <td>${escapeHtml(ms(row.avgAiTimeMs))}</td>
    </tr>`).join("");
  return `<div class="table-wrap"><table class="stats-table">
    <caption>Nivel de la IA contra resultado</caption>
    <thead><tr><th>Nivel</th><th>Partidas</th><th>Gana humano</th><th>Gana IA</th><th>Empates</th><th>Decisión media</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function metric(label: string, value: string): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function gameName(gameId: string, games: Game[]): string {
  return games.find((game) => game.id === gameId)?.name ?? gameId;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function seconds(value: unknown): string {
  return isNumber(value) ? `${(value / 1000).toFixed(1)} s` : "—";
}

export function ms(value: unknown): string {
  return isNumber(value) ? `${value.toFixed(1)} ms` : "—";
}

export function percent(value: unknown): string {
  return isNumber(value) ? `${(value * 100).toFixed(0)}%` : "—";
}

export function decimal(value: unknown, digits: number): string {
  return isNumber(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(digits)) : "—";
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
