# Registro de decisiones de arquitectura (ADR)

Este documento registra las decisiones tomadas durante el desarrollo de GameConsole.

| ID | Fecha | Decisión | Motivo / Justificación |
|---|---|---|---|
| ADR-001 | 2026-11-06 | Uso de Fastify + `@fastify/websocket` para el servidor HTTP y WebSocket. | Mayor rendimiento, esquema tipado nativo en TypeScript y excelente soporte asíncrono. |
| ADR-002 | 2026-11-06 | Identificadores con prefijo semántico (`e-UUID` para eventos, `m-UUID` para partidas, `p-UUID` para jugadores). | Trazabilidad clara y compatibilidad estricta con el validador y modelo de GameStats. |
| ADR-003 | 2026-11-06 | Abstracciones base `Game`, `Match`, `Player` con patrón Registry (`GameRegistry`) y gestor (`MatchManager`). | Permite extender nuevos juegos (Snake, Memoria) sin modificar el núcleo del servidor ni las rutas de API. |
| ADR-004 | 2026-11-06 | `EventEmitter` de dominio interno por partida conectado a `EventFactory`. | Desacopla la lógica de juego del transporte y publicación de eventos hacia GameStats. |
