# Registro de decisiones de arquitectura (ADR)

Este documento registra las decisiones tomadas durante el desarrollo de GameConsole.

| ID | Fecha | Decisión | Motivo / Justificación |
|---|---|---|---|
| ADR-001 | 2026-11-06 | Uso de Fastify + `@fastify/websocket` para el servidor HTTP y WebSocket. | Mayor rendimiento, esquema tipado nativo en TypeScript y excelente soporte asíncrono. |
| ADR-002 | 2026-11-06 | Identificadores con prefijo semántico (`e-UUID` para eventos, `m-UUID` para partidas, `p-UUID` para jugadores). | Trazabilidad clara y compatibilidad estricta con el validador y modelo de GameStats. |
| ADR-003 | 2026-11-06 | Abstracciones base `Game`, `Match`, `Player` con patrón Registry (`GameRegistry`) y gestor (`MatchManager`). | Permite extender nuevos juegos (Snake, Memoria) sin modificar el núcleo del servidor ni las rutas de API. |
| ADR-004 | 2026-11-06 | `EventEmitter` de dominio interno por partida conectado a `EventFactory`. | Desacopla la lógica de juego del transporte y publicación de eventos hacia GameStats. |
| ADR-005 | 2026-11-06 | EventPublisher con colas por partida y flushing a 20 eventos o 200 ms. | Evita mezclar eventos de distintas partidas y optimiza el trafico de red hacia GameStats. |
| ADR-006 | 2026-11-06 | Persistencia en Outbox (outbox.ndjson) con reintentos y reenvio periodico (30 s). | Garantiza tolerancia a desconexiones de GameStats (cero perdida de eventos). |
| ADR-007 | 2026-11-06 | Ampliacion de catalog.json en GameStats para connect-four, snake-arena y memory-match. | Estandariza la validacion en Go para los tres juegos sin romper los existentes. |
| ADR-008 | 2026-11-06 | Servicio HTTP independiente en SWI-Prolog (POST /decide) con Minimax y poda alfa-beta. | Desacopla el motor logico del servidor web y aprovecha el razonamiento declarativo nativo de Prolog. |
| ADR-009 | 2026-11-06 | ConnectFourMatch con Board 6x7 privado, turnos secuenciales e integracion con PrologAiPlayer. | Garantiza reglas estrictas de gravedad, deteccion de 4 en linea y decision con Minimax. |
| ADR-010 | 2026-11-06 | Eliminacion de DummyGame y transicion al primer juego oficial (ConnectFourGame). | Limpia el codigo temporal una vez validado el nucleo y el primer juego real. |
| ADR-011 | 2026-11-15 | Contenedor web con Nginx multi-stage (`console-web`) y proxy reverso hacia `console-server`. | Sirve la SPA con fallback a `index.html`, y enruta `/api/` y `/ws/` con soporte completo de WebSockets. |
| ADR-012 | 2026-11-15 | Orquestación en Docker Compose con `depends_on: service_healthy` en cadena lógica. | Asegura que Prolog y GameStats estén listos antes de levantar la consola y su interfaz web. |
| ADR-013 | 2026-11-15 | Volúmenes con nombre persistentes para el outbox (`gameconsole_outbox`) y GameStats (`gamestats_data`). | Garantiza persistencia de eventos ante reinicios y previene pérdida de datos. |
| ADR-014 | 2026-11-15 | Despliegue en VPS con Docker Compose, proxy Caddy para HTTPS/WSS y rollback en `deploy.sh`. | Simplifica la arquitectura reutilizando Compose, automatiza certificados SSL y asegura alta disponibilidad. |
