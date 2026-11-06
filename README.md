# GameConsole

Plataforma de videojuegos orientada a objetos con inteligencia de juego en Prolog, integrada con la plataforma GameStats para ingestión concurrente y análisis estadístico funcional.

## Estructura del proyecto

- `console-server/`: Servidor de juegos orientado a objetos desarrollado en TypeScript (Node 20, Fastify, WebSocket).
- `prolog-ai/`: Servicio de inteligencia artificial en SWI-Prolog (Minimax con poda alfa-beta para Cuatro en Línea).
- `docs/`: Especificación técnica de eventos, registro de decisiones arquitectónicas y traspaso.

## Juegos soportados

1. `connect-four` (Cuatro en Línea contra IA Minimax en Prolog)
2. `snake-arena` (Catálogo definido, listo para extensión)
3. `memory-match` (Catálogo definido, listo para extensión)

## Requisitos

- Node.js >= 20
- npm >= 10
- SWI-Prolog >= 9 (para `prolog-ai`)
- GameStats corriendo (Go en puerto 8080)
