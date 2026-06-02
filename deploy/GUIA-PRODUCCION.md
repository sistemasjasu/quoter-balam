# Guía de despliegue en producción

Despliegue de **Quotes · BALAM Studio** en Ubuntu Server con dominio `quoter.balamst.com`, HTTPS y persistencia en PostgreSQL.

Repositorio: `https://github.com/sistemasjasu/quoter-balam.git`

---

## 1. Arquitectura y puertos

La aplicación usa **tres contenedores Docker**. Nginx en el host (no en Docker) expone el dominio público y reparte el tráfico.

```
                    Internet
                        │
                        ▼
          quoter.balamst.com :443
          (nginx en el HOST + Certbot/SSL)
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
  location /api/                  location /
  127.0.0.1:8082                  127.0.0.1:8081
        │                               │
        ▼                               ▼
   quotes-api                    quotes-balamst
   (Node.js)                     (nginx + index.html)
        │                               │
        └───────────┬───────────────────┘
                    ▼
               quotes-db
            (PostgreSQL 16)
```

### Tabla de puertos en el servidor

| Puerto (host) | Servicio | Contenedor | Uso |
|---------------|----------|------------|-----|
| **8080** | GLPI u otra app | *(ajeno a este proyecto)* | **No usar** para Quotes |
| **8081** | Frontend cotizador | `quotes-balamst` | HTML, impresión, login en navegador |
| **8082** | API REST | `quotes-api` | `/api/health`, guardar/cargar cotizaciones |
| **5432** | PostgreSQL | `quotes-db` | Solo red interna Docker (no exponer) |
| **80 / 443** | nginx host | — | Dominio público |

Los puertos **8081** y **8082** solo escuchan en `127.0.0.1` (localhost). No deben abrirse en el firewall público; el acceso externo es solo vía nginx en **443**.

### Variables de entorno (`.env`)

Copia la plantilla y edita valores en producción:

```bash
cp .env.example .env
nano .env
```

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | Cambiar en producción |
| `AUTH_EMAIL` | Usuario de login | `aandrade@balamst.com` |
| `AUTH_PASS_HASH` | SHA-256 de la contraseña (mismo que `AUTH` en `index.html`) | Ver `.env.example` |
| `JWT_SECRET` | Secreto para tokens de sesión API | Cadena larga aleatoria |
| `QUOTES_PORT` | Puerto host del frontend | `8081` |
| `API_PORT` | Puerto host de la API | `8082` |

Si cambias `QUOTES_PORT` o `API_PORT`, actualiza también nginx del host (sección 5).

---

## 2. Requisitos previos

- Ubuntu **22.04** o **24.04** con SSH
- Registro DNS **A**: `quoter` → IP pública del VPS
- Puertos abiertos en firewall cloud: **22**, **80**, **443**
- Git, Docker, Docker Compose plugin, nginx, Certbot

---

## 3. Instalación inicial

### 3.1 Sistema base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Cierra sesión SSH y vuelve a entrar para aplicar el grupo `docker`.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 3.2 Clonar el proyecto

```bash
sudo mkdir -p /opt/quotes-balamst
sudo chown $USER:$USER /opt/quotes-balamst
git clone https://github.com/sistemasjasu/quoter-balam.git /opt/quotes-balamst
cd /opt/quotes-balamst
```

### 3.3 Configurar entorno

```bash
cp .env.example .env
nano .env
```

En producción, cambia al menos:

- `POSTGRES_PASSWORD`
- `JWT_SECRET` (ej. `openssl rand -hex 32`)

### 3.4 Levantar contenedores

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps
```

**Resultado esperado** — tres contenedores `Up`:

```
NAME             STATUS    PORTS
quotes-db        Up        5432/tcp
quotes-api       Up        127.0.0.1:8082->3000/tcp
quotes-balamst   Up        127.0.0.1:8081->80/tcp
```

### 3.5 Verificar Docker (obligatorio)

```bash
# API directa
curl -s http://127.0.0.1:8082/api/health
# → {"ok":true}

# Frontend
curl -I http://127.0.0.1:8081/
# → HTTP/1.1 200 OK

# API vía nginx del contenedor frontend
curl -s http://127.0.0.1:8081/api/health
# → {"ok":true}
```

Si `/api/health` devuelve **HTML** en lugar de `{"ok":true}`:

```bash
docker compose logs quotes --tail 30
docker exec quotes-balamst cat /etc/nginx/conf.d/default.conf
docker compose down
docker compose build --no-cache
docker compose up -d
```

Si `quotes-balamst` no está `Up`:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E '8081|8082'
docker compose logs quotes
```

Conflicto de puerto (ej. GLPI en **8080**, otro proceso en **8081**):

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Ajusta `QUOTES_PORT` / `API_PORT` en `.env` y en nginx del host.

---

## 4. nginx en el host (reverse proxy)

El dominio público **no** apunta directo a Docker. nginx en el servidor reparte:

- **`/api/`** → API en **8082**
- **`/`** → frontend en **8081**

### 4.1 Instalar configuración HTTP (antes de SSL)

```bash
sudo cp /opt/quotes-balamst/deploy/nginx-host.conf.example \
  /etc/nginx/sites-available/quoter.balamst.com

sudo ln -sf /etc/nginx/sites-available/quoter.balamst.com \
  /etc/nginx/sites-enabled/

sudo nginx -t
sudo systemctl reload nginx
```

Comprobar por HTTP:

```bash
curl -s http://quoter.balamst.com/api/health
# → {"ok":true}

curl -I http://quoter.balamst.com
# → HTTP/1.1 200 OK
```

### 4.2 Certificado SSL (HTTPS)

```bash
sudo certbot --nginx -d quoter.balamst.com
```

Certbot modifica el archivo y añade `listen 443 ssl`. **Después de Certbot**, abre el sitio y confirma que el bloque `server` de **443** sigue teniendo **ambos** `location`:

```bash
sudo nano /etc/nginx/sites-available/quoter.balamst.com
```

Debe verse así en el bloque HTTPS (443):

```nginx
server {
    server_name quoter.balamst.com;

    location /api/ {
        proxy_pass http://127.0.0.1:8082/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen [::]:443 ssl;
    listen 443 ssl;
    # ssl_certificate ... (Certbot)
}
```

> **Error frecuente:** solo `location /` → `8081`. Entonces `/api/health` devuelve HTML y el login falla.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4.3 Verificación final HTTPS

```bash
curl -s https://quoter.balamst.com/api/health
# → {"ok":true}
```

Abre **https://quoter.balamst.com** e inicia sesión.

| Campo | Valor por defecto |
|-------|-------------------|
| Email | `aandrade@balamst.com` |
| Contraseña | `Balam1234` |

---

## 5. Actualizar la aplicación (releases)

Cada vez que haya cambios en `main`:

```bash
cd /opt/quotes-balamst
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps
```

Checklist rápido:

```bash
curl -s http://127.0.0.1:8082/api/health
curl -s https://quoter.balamst.com/api/health
```

Si cambió el puerto de la API en `.env`, actualiza `proxy_pass` en nginx del host.

---

## 6. Solución de problemas

### «Could not connect to the quote server» al iniciar sesión

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Alert al login | API no alcanzable | `docker compose ps`, levantar `quotes-api` |
| `curl .../api/health` devuelve HTML | nginx sin `location /api/` o contenedor viejo | Añadir `location /api/` → **8082**, `docker compose build --no-cache` |
| Puerto en uso | GLPI en 8080 u otro en 8081/8082 | `docker ps`, ajustar `.env` |
| `quotes-balamst` not running | Puerto 8081 ocupado o fallo build | `docker compose logs quotes` |

### Comandos de diagnóstico

```bash
docker compose ps -a
docker compose logs api --tail 50
docker compose logs quotes --tail 30
docker exec quotes-api wget -qO- http://127.0.0.1:3000/api/health
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E '8081|8082|8080'
```

### Reinicio completo (sin borrar datos)

```bash
cd /opt/quotes-balamst
docker compose down
docker compose up -d --build
```

### Reinicio borrando cotizaciones guardadas

```bash
docker compose down -v
docker compose up -d --build
```

---

## 7. Respaldo de PostgreSQL

```bash
docker exec quotes-db pg_dump -U quotes quotes > backup-quotes-$(date +%F).sql
```

Restaurar (ejemplo):

```bash
cat backup-quotes-2026-06-01.sql | docker exec -i quotes-db psql -U quotes quotes
```

---

## 8. Cambiar contraseña de acceso

1. Generar hash SHA-256:

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('NuevaContraseña').digest('hex'));"
```

2. Actualizar **ambos**:
   - `AUTH.passHash` en `index.html`
   - `AUTH_PASS_HASH` en `.env`

3. Redesplegar:

```bash
docker compose up -d --build
```

---

## 9. Comandos útiles

```bash
# Logs en vivo
docker compose logs -f

# Solo API o DB
docker compose logs -f api
docker compose logs -f db

# Reiniciar servicios
docker compose restart

# Estado nginx
sudo systemctl status nginx
sudo nginx -t

# Certificados SSL
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## 10. Checklist de despliegue nuevo

- [ ] DNS `quoter.balamst.com` → IP del servidor
- [ ] `git clone` en `/opt/quotes-balamst`
- [ ] `.env` creado con secretos de producción
- [ ] `docker compose up -d --build` — 3 contenedores `Up`
- [ ] `curl 127.0.0.1:8082/api/health` → `{"ok":true}`
- [ ] nginx host con `location /api/` (8082) y `location /` (8081)
- [ ] Certbot SSL activo
- [ ] `curl https://quoter.balamst.com/api/health` → `{"ok":true}`
- [ ] Login en navegador OK
- [ ] Guardar y cargar una cotización de prueba
