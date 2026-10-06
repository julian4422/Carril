# Despliegue en producción

Topología v1.2 (ver `docs/CONTRACT.md`, sección Móvil): el build estático del frontend y la API se sirven desde el **mismo
origen** detrás de un proxy inverso con HTTPS. HTTPS es obligatorio: el service worker de la PWA no se registra sin él
(salvo en `localhost`).

```
navegador ──HTTPS──> Caddy (:443)
                       ├── /api/*  ──HTTP──> api:8000 (Uvicorn, FastAPI)  ──> db:5432 (Postgres)
                       └── resto   ──> archivos de frontend/dist/frontend/browser, fallback a index.html
```

El frontend usa URLs relativas (`/api/v1/...`), así que no hace falta configurarle la URL de la API. Como todo es el mismo
origen, el navegador no aplica CORS a esas peticiones.

## Variables

| Variable | Valor en producción |
|---|---|
| `JWT_SECRET` | Obligatoria. 32 caracteres o más: `openssl rand -hex 32`. Guárdala como secreto; cambiarla invalida todas las sesiones. |
| `DATABASE_URL` | `postgresql+asyncpg://<usuario>:<clave>@db:5432/carril`. Usa una contraseña propia, no la de desarrollo. |
| `CORS_ORIGINS` | El origen público, p. ej. `https://carril.example.com`. Con el mismo origen no es necesario, pero no dejes `http://localhost:4200`. |
| `FORWARDED_ALLOW_IPS` | IP o subred del proxy. Sin ella, Uvicorn ignora `X-Forwarded-*` y la API cree que la petición llegó por HTTP desde la IP del proxy. |
| `JWT_EXPIRES_MINUTES` | Opcional (defecto 720). |

### `FORWARDED_ALLOW_IPS`

La imagen arranca Uvicorn con `--proxy-headers` y `FORWARDED_ALLOW_IPS=127.0.0.1` por defecto. Uvicorn lee la variable
directamente. Solo acepta `X-Forwarded-Proto` y `X-Forwarded-For` de las IPs listadas (separadas por comas; admite subredes CIDR).

- Caddy en el host y la API publicada en `127.0.0.1:8000`: el valor por defecto sirve. Desde la API, las peticiones de Docker
  llegan con la IP de la pasarela de la red (p. ej. `172.18.0.1`): ponla, o su subred, si no ves `https` en `request.url`.
- Caddy como contenedor en la misma red que `api`: usa la subred de esa red (`docker network inspect <red>`, p. ej. `172.18.0.0/16`),
  o fíjala en el compose con `ipam`.
- `*` confía en cualquiera. Úsalo solo si el puerto de la API **no** está publicado y nadie salvo el proxy puede alcanzarla;
  si no, un cliente podría falsear su IP o el esquema.

## Ejemplo con Caddy

Caddy obtiene y renueva el certificado HTTPS solo, siempre que el dominio apunte al servidor y los puertos 80 y 443 estén abiertos.

`Caddyfile`:

```caddyfile
carril.example.com {
	encode zstd gzip

	# API: sin recortar el prefijo, las rutas ya empiezan por /api/v1
	handle /api/* {
		reverse_proxy api:8000
	}

	# Frontend: estáticos con fallback a index.html (rutas del router de Angular)
	handle {
		root * /srv/carril
		try_files {path} /index.html
		file_server
	}

	# El service worker y el shell deben revalidarse siempre; los archivos con hash pueden cachearse para siempre
	@nocache path / /index.html /ngsw.json /ngsw-worker.js /safety-worker.js /manifest.webmanifest
	header @nocache Cache-Control "no-cache"
	@hashed path_regexp \.[0-9a-f]{16,}\.(js|css|woff2?)$
	header @hashed Cache-Control "public, max-age=31536000, immutable"
}
```

`reverse_proxy` envía `X-Forwarded-For`, `X-Forwarded-Proto` y `X-Forwarded-Host`. La API ya comprime con GZip; `encode` de Caddy
no vuelve a comprimir respuestas que ya traen `Content-Encoding`, y sí comprime los estáticos.

`/docs` y `/openapi.json` quedan fuera de `/api/*`, así que no se publican. Si los quieres, añade `handle /docs* /openapi.json`
con el mismo `reverse_proxy`.

Fragmento de compose para producción (no es el `docker-compose.yml` de desarrollo):

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./frontend/dist/frontend/browser:/srv/carril:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [api]

  api:
    build: ./backend
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql+asyncpg://carril:${POSTGRES_PASSWORD:?}@db:5432/carril
      JWT_SECRET: ${JWT_SECRET:?}
      CORS_ORIGINS: https://carril.example.com
      FORWARDED_ALLOW_IPS: 172.30.0.0/24
    # sin "ports": solo Caddy la alcanza
    networks: [carril]
  # db: como en desarrollo, sin publicar 5432

networks:
  carril:
    ipam:
      config: [{subnet: 172.30.0.0/24}]

volumes:
  caddy_data:
  caddy_config:
```

(Todos los servicios, incluidos `caddy` y `db`, deben estar en la red `carril`.)

Pasos:

1. `cd frontend && npm ci && npm run build` (genera `frontend/dist/frontend/browser`).
2. Define `JWT_SECRET` y `POSTGRES_PASSWORD` en `.env`.
3. `docker compose -f docker-compose.prod.yml up -d --build`.

El esquema lo aplica el contenedor `db` en el primer arranque (volumen vacío). En producción no cargues el seed de demo.

## Comprobaciones tras el despliegue

```bash
H=https://carril.example.com

curl -s $H/api/v1/health                                   # {"status":"ok","database":"ok"}
curl -sI $H/ | grep -i -E '^HTTP|cache-control'            # 200, no-cache
curl -sI $H/boards/algo | head -1                           # 200 (fallback a index.html, no 404)
curl -sI http://carril.example.com/ | head -3              # 308 a https

# GZip: en un tablero grande (token de un usuario real)
curl -s -o /dev/null -D - -H "Authorization: Bearer $TOKEN" -H 'Accept-Encoding: gzip' \
  $H/api/v1/boards/<id> | grep -i content-encoding         # content-encoding: gzip

# X-Forwarded-*: en los logs de la API debe verse la IP real del cliente, no la del proxy
docker compose -f docker-compose.prod.yml logs api | tail
```

En el navegador: la PWA se puede instalar (DevTools > Application > Manifest y Service Workers sin errores) y las peticiones
a `/api/` no salen del service worker.
