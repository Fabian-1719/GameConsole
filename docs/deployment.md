# Guía de Despliegue de GameConsole

Esta guía documenta la infraestructura de producción, el procedimiento de despliegue continuo (CI/CD) y las operaciones de mantenimiento para GameConsole.

---

## 1. Arquitectura de Producción

En el servidor de producción (VPS), la infraestructura se ejecuta mediante Docker Compose combinando `docker-compose.yml` y `docker-compose.prod.yml`:

```
Internet (HTTPS :443 / HTTP :80)
            │
            ▼
    [ Caddy Reverse Proxy ] (HTTPS automático Let's Encrypt + WSS)
            │
            ▼
    [ console-web ] (Nginx SPA + enrutamiento estático)
            │
            ▼ (red interna: gameconsole-network)
    [ console-server ] (:3000)
       ├──► [ prolog-ai ] (:5000)
       └──► [ gamestats-go ] (:8080) ──► [ gamestats-scala ] (:8081)
```

- **Puertos públicos:** Únicamente los puertos `80` y `443` de Caddy están expuestos al exterior. Los servicios de GameStats y la consola operan exclusivamente en la red privada interna de Docker.
- **WebSockets:** Caddy y Nginx reenvían automáticamente las cabeceras `Upgrade` y `Connection` para mantener las sesiones de juego activas sin desconexiones.
- **Outbox Persistente:** Montado en el volumen Docker `gameconsole_outbox` para asegurar cero pérdida de eventos si se reinician contenedores.

---

## 2. Requisitos Previos y Secretos de GitHub

Para habilitar el despliegue automático desde GitHub Actions, configure los siguientes secretos en el repositorio (**Settings → Secrets and variables → Actions**):

| Nombre del Secreto | Descripción | Ejemplo / Valor esperado |
|---|---|---|
| `DEPLOY_HOST` | Dirección IP o dominio del servidor VPS | `192.0.2.1` o `vps.mi-dominio.com` |
| `DEPLOY_USER` | Usuario con permisos sudo/docker en el servidor | `ubuntu` o `deploy` |
| `DEPLOY_SSH_KEY` | Llave privada SSH (formato OpenSSH) para autenticación | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `DEPLOY_PATH` | Ruta absoluta de la aplicación en el servidor | `/opt/gameconsole` |
| `DEPLOY_DOMAIN` | Dominio o subdominio asignado a la consola web | `consola.mi-dominio.com` |
| `GHCR_PULL_TOKEN` | Token de GitHub (opcional si las imágenes son públicas) | `ghp_...` con scope `read:packages` |

---

## 3. Preparación Inicial del Servidor (Una sola vez)

1. En el servidor VPS, cree el directorio de despliegue y asigne permisos:
   ```bash
   sudo mkdir -p /opt/gameconsole
   sudo chown -R $USER:$USER /opt/gameconsole
   cd /opt/gameconsole
   ```

2. Cree el archivo de variables de entorno de producción `.env`:
   ```bash
   nano /opt/gameconsole/.env
   ```
   *Contenido base:*
   ```env
   DEPLOY_DOMAIN=consola.mi-dominio.com
   ACME_EMAIL=admin@mi-dominio.com
   PORT=3000
   GAMESTATS_URL=http://gamestats-go:8080
   ANALYTICS_URL=http://gamestats-scala:8081
   PROLOG_URL=http://prolog-ai:5000
   PUBLISHER_WORKERS=4
   OUTBOX_PATH=/data/outbox.ndjson
   ```

3. Autentique Docker contra GHCR para descargar las imágenes (si son privadas):
   ```bash
   echo $GHCR_PULL_TOKEN | docker login ghcr.io -u <TU_USUARIO> --password-stdin
   ```

---

## 4. Métodos de Actualización y Despliegue

### 4.1 Despliegue Automático (CI/CD)
Cada commit o Pull Request mergeado a la rama `main` dispara el flujo de GitHub Actions:
1. Valida el código (`console` y `prolog`).
2. Publica las nuevas imágenes versionadas en GHCR (`images`).
3. Ejecuta el smoke test de integración (`smoke`).
4. Si todo está verde, el job `deploy` se conecta vía SSH al VPS, copia los archivos de configuración y ejecuta `deploy/deploy.sh`.

### 4.2 Despliegue Manual (Desde el Servidor)
En caso de requerir un despliegue manual o forzado:
```bash
cd /opt/gameconsole
bash deploy/deploy.sh
```

---

## 5. Mantenimiento y Operaciones

### Ver estado de los contenedores
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

### Consultar logs en tiempo real
```bash
# Todos los servicios
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Un servicio específico (ejemplo: console-server)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f console-server

# Logs del proxy Caddy
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
```

### Reiniciar un servicio sin perder datos
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart console-server
```

### Revertir a una versión anterior (Rollback)
Si una actualización falla o se desea volver a un SHA previo:
1. Modifique `.env` indicando la etiqueta anterior:
   ```env
   CONSOLE_IMAGE=ghcr.io/fabian-1719/gameconsole-server:abc1234
   ```
2. Levante los contenedores:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
