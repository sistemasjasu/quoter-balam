# Quotes · BALAM Studio

Editor de cotizaciones en HTML para piedra natural (travertino). Un solo archivo estático con panel de edición en el navegador e impresión/exportación a PDF.

## Características

- Cotización imprimible en formato carta (letter)
- Editor integrado: empresa, cliente, productos, notas
- Cálculo de SF por línea: `(ancho × largo × piezas) / 144`
- Columnas de piezas, pallets y subtotales por ítem
- Totales generales opcionales (ocultos por defecto)
- **Persistencia en PostgreSQL**: guardar y cargar cotizaciones por código
- Despliegue con Docker + nginx + API Node.js + PostgreSQL
- Pantalla de login integrada (email + contraseña)

## Inicio rápido

### Opción 1: Abrir localmente

Abre `index.html` en el navegador solo para revisar el diseño. **Guardar y cargar cotizaciones requiere Docker** (API + PostgreSQL).

### Opción 2: Docker (recomendado)

Copia las variables de entorno (opcional):

```bash
cp .env.example .env
```

Levanta la app con base de datos:

```bash
docker compose up -d --build
```

Servicios:

| Servicio | Descripción |
|----------|-------------|
| `quotes` | Frontend nginx en `127.0.0.1:8081` |
| `api` | API REST Node.js en `127.0.0.1:8082` |
| `db` | PostgreSQL 16 (volumen `pgdata`) |

Visita `http://localhost:8081` e inicia sesión.

**Guardar / cargar cotizaciones**

- **Save** — guarda con el código actual (`Quote number`). Si la cotización fue cargada desde la lista, actualiza la misma.
- **Save as…** — pide un código nuevo y crea (o sobrescribe, con confirmación) otra cotización.
- **Load saved quote…** — lista desplegable con todos los códigos guardados; al seleccionar uno se precargan todos los campos.

**Credenciales por defecto:**

| Campo | Valor |
|-------|--------|
| Email | `aandrade@balamst.com` |
| Contraseña | `Balam1234` |

La sesión se mantiene en el navegador hasta cerrar pestaña/ventana o pulsar **Sign out**.

Para detener:

```bash
docker compose down
```

Para detener y borrar los datos de cotizaciones:

```bash
docker compose down -v
```

### Cambiar la contraseña

La contraseña debe coincidir en el frontend (`index.html` → `AUTH`) y en el API (`AUTH_PASS_HASH` en `.env` o `docker-compose.yml`).

1. Genera el hash SHA-256 de la nueva contraseña:

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('NuevaContraseña').digest('hex'));"
```

2. En `index.html`, actualiza `AUTH.passHash` con el valor generado (y `AUTH.email` si cambia el usuario).
3. Vuelve a desplegar: `docker compose up -d --build`

## Despliegue en producción (quoter.balamst.com)

Documentación completa: **[deploy/GUIA-PRODUCCION.md](deploy/GUIA-PRODUCCION.md)**  
(arquitectura, puertos, nginx, SSL, actualizaciones, respaldos y solución de problemas).

### Puertos en el servidor

| Puerto | Servicio | Notas |
|--------|----------|--------|
| **8080** | GLPI (u otra app) | No usar para Quotes |
| **8081** | Frontend (`quotes-balamst`) | Cotizador HTML |
| **8082** | API (`quotes-api`) | Guardar/cargar cotizaciones |
| **443** | nginx host | Dominio público HTTPS |

### Resumen rápido

```bash
# 1. Clonar y configurar
cd /opt/quotes-balamst
git clone https://github.com/sistemasjasu/quoter-balam.git .
cp .env.example .env && nano .env

# 2. Docker (3 contenedores)
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps

# 3. Verificar
curl -s http://127.0.0.1:8082/api/health   # → {"ok":true}
curl -s http://127.0.0.1:8081/api/health   # → {"ok":true}

# 4. nginx del host (ver deploy/nginx-host.conf.example)
sudo cp deploy/nginx-host.conf.example /etc/nginx/sites-available/quoter.balamst.com
sudo ln -sf /etc/nginx/sites-available/quoter.balamst.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. SSL
sudo certbot --nginx -d quoter.balamst.com
# Tras Certbot: confirmar que el bloque HTTPS (443) tiene location /api/ → 8082

# 6. Prueba pública
curl -s https://quoter.balamst.com/api/health
```

### Actualizar tras un `git push`

```bash
cd /opt/quotes-balamst
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
curl -s https://quoter.balamst.com/api/health
```

### nginx del host (imprescindible)

El dominio debe tener **dos** rutas. Sin `location /api/`, el login falla (la API devuelve HTML):

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8082/api/;
    # ... headers proxy ...
}

location / {
    proxy_pass http://127.0.0.1:8081;
    # ... headers proxy ...
}
```

Plantilla lista para copiar: `deploy/nginx-host.conf.example`.

### Diagrama

```
Internet → quoter.balamst.com:443 (nginx host)
              ├─ /api/*  → 127.0.0.1:8082  (quotes-api + PostgreSQL)
              └─ /*      → 127.0.0.1:8081  (quotes-balamst, frontend)
```

## Estructura del proyecto

```
quotes-balamst/
├── index.html                   # App (HTML + CSS + JS)
├── logo.png
├── server/                      # API Node.js + PostgreSQL
│   ├── index.js
│   ├── db.js
│   └── Dockerfile
├── nginx/
│   └── default.conf             # nginx interno del contenedor quotes
├── deploy/
│   ├── GUIA-PRODUCCION.md         # Guía completa de despliegue
│   └── nginx-host.conf.example  # Reverse proxy del servidor Ubuntu
├── docker-compose.yml           # db + api + quotes
├── .env.example                 # Variables de entorno
├── Dockerfile                   # Imagen frontend (nginx)
└── README.md
```

## Uso

1. Pulsa **Edit quote** para abrir el panel de edición.
2. Completa pestañas **Company**, **Client**, **Products** y **Notes**.
3. En **Products**, define dimensiones (in), piezas (Pcs) y precio por SF.
4. Marca **Show totals summary** si quieres mostrar subtotal/total al pie.
5. Pulsa **Print / Export PDF** para generar el PDF desde el navegador.

## Notas técnicas

- **Persistencia:** las cotizaciones se guardan en PostgreSQL vía API REST (`/api/quotes`).
- **Login:** validación en cliente (SHA-256) y en API (JWT). Requiere que la API esté activa (`/api/auth/login`).
- **Sesión:** token JWT en `sessionStorage` mientras la pestaña esté abierta.
- **PDF:** impresión del navegador (Ctrl+P / Cmd+P).
- **Fuentes:** Google Fonts (Cormorant Garamond + Inter) en la primera carga.

## Licencia

Uso interno · BALAM Studio LLC
