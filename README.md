# Quotes · BALAM Studio

Editor de cotizaciones en HTML para piedra natural (travertino). Un solo archivo estático con panel de edición en el navegador e impresión/exportación a PDF.

## Características

- Cotización imprimible en formato carta (letter)
- Editor integrado: empresa, cliente, productos, notas
- Cálculo de SF por línea: `(ancho × largo × piezas) / 144`
- Columnas de piezas, pallets y subtotales por ítem
- Totales generales opcionales (ocultos por defecto)
- Despliegue con Docker + nginx
- Pantalla de login integrada (email + contraseña)

## Inicio rápido

### Opción 1: Abrir localmente

Abre `index.html` en el navegador. Verás la pantalla de **Sign in** antes de acceder al editor.

### Opción 2: Docker

```bash
docker compose up -d --build
```

Visita `http://localhost:8080` e inicia sesión.

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

### Cambiar la contraseña

1. Genera el hash SHA-256 de la nueva contraseña:

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('NuevaContraseña').digest('hex'));"
```

2. En `index.html`, actualiza `AUTH.passHash` con el valor generado (y `AUTH.email` si cambia el usuario).
3. Vuelve a desplegar: `docker compose up -d --build`

## Despliegue en Ubuntu Server (quoter.balamst.com)

Guía para publicar la app en un VPS Ubuntu con dominio y HTTPS.

### Requisitos previos

- Servidor **Ubuntu 22.04 o 24.04** con acceso SSH
- Dominio **`quoter.balamst.com`** apuntando al servidor (registro **A** → IP pública del VPS)
- Puertos **22**, **80** y **443** abiertos en el firewall del proveedor cloud

### 1. DNS

En el panel DNS de `balamst.com`, crea:

| Tipo | Nombre | Valor |
|------|--------|--------|
| A | `quoter` | `IP_PUBLICA_DEL_SERVIDOR` |

Comprueba propagación (puede tardar unos minutos):

```bash
dig +short quoter.balamst.com
```

### 2. Preparar el servidor

Conéctate por SSH y actualiza el sistema:

```bash
sudo apt update && sudo apt upgrade -y
```

Instala Docker, Docker Compose, nginx y Certbot:

```bash
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Cierra sesión y vuelve a entrar por SSH para aplicar el grupo `docker`.

Firewall (UFW):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 3. Clonar el proyecto

```bash
sudo mkdir -p /opt/quotes-balamst
sudo chown $USER:$USER /opt/quotes-balamst
git clone https://github.com/TU-USUARIO/quotes-balamst.git /opt/quotes-balamst
cd /opt/quotes-balamst
```

> Sustituye la URL del repositorio por la tuya cuando esté en GitHub.

### 4. Levantar la aplicación (Docker)

El contenedor escucha en **localhost:8080** (no expone el puerto al exterior directamente):

```bash
cd /opt/quotes-balamst
docker compose up -d --build
docker compose ps
```

Verifica que responde en el servidor:

```bash
curl -I http://127.0.0.1:8080/
# Debe devolver HTTP/1.1 200 OK
```

### 5. Configurar nginx en el host (reverse proxy)

Copia la plantilla incluida en el repo:

```bash
sudo cp /opt/quotes-balamst/deploy/nginx-host.conf.example \
  /etc/nginx/sites-available/quoter.balamst.com

sudo ln -sf /etc/nginx/sites-available/quoter.balamst.com \
  /etc/nginx/sites-enabled/quoter.balamst.com

sudo nginx -t
sudo systemctl reload nginx
```

Comprueba HTTP antes de SSL:

```bash
curl -I http://quoter.balamst.com
# Debe devolver HTTP/1.1 200 OK
```

### 6. Certificado SSL (HTTPS)

```bash
sudo certbot --nginx -d quoter.balamst.com
```

Sigue el asistente (email, términos, redirección HTTP → HTTPS recomendada).

Renovación automática (Certbot la instala vía systemd timer). Prueba:

```bash
sudo certbot renew --dry-run
```

### 7. Acceso final

Abre en el navegador e inicia sesión:

**https://quoter.balamst.com**

| Campo | Valor |
|-------|--------|
| Email | `aandrade@balamst.com` |
| Contraseña | `Balam1234` |

### 8. Actualizar la app

Cuando subas cambios al repositorio:

```bash
cd /opt/quotes-balamst
git pull
docker compose up -d --build
```

### 9. Comandos útiles

```bash
# Logs del contenedor
docker compose logs -f

# Reiniciar app
docker compose restart

# Estado de nginx
sudo systemctl status nginx

# Ver certificados
sudo certbot certificates
```

### Diagrama de arquitectura

```
Internet
   │
   ▼
quoter.balamst.com :443 (nginx host + Let's Encrypt)
   │
   ▼
127.0.0.1:8080 (Docker → nginx estático + login en index.html)
```

## Estructura del proyecto

```
quotes-balamst/
├── index.html          # App completa (HTML + CSS + JS)
├── logo.png            # Logo de la empresa
├── nginx/
│   └── default.conf    # Config nginx (solo archivos estáticos)
├── deploy/
│   └── nginx-host.conf.example  # Reverse proxy para Ubuntu
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
└── README.md
```

## Uso

1. Pulsa **Edit quote** para abrir el panel de edición.
2. Completa pestañas **Company**, **Client**, **Products** y **Notes**.
3. En **Products**, define dimensiones (in), piezas (Pcs) y precio por SF.
4. Marca **Show totals summary** si quieres mostrar subtotal/total al pie.
5. Pulsa **Print / Export PDF** para generar el PDF desde el navegador.

## Notas técnicas

- Sin backend ni base de datos: todos los datos viven en memoria del navegador.
- El login es una pantalla en la propia app; la sesión usa `sessionStorage` (dura mientras la pestaña esté abierta).
- La contraseña se valida en el cliente (hash SHA-256). Es adecuada para uso interno; no sustituye un backend con autenticación real.
- El PDF se genera con la función de impresión del navegador (Ctrl+P / Cmd+P).
- Fuentes Google Fonts (Cormorant Garamond + Inter) requieren conexión a internet la primera vez.

## Licencia

Uso interno · BALAM Studio LLC
