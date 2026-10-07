# Vista previa en tus dispositivos (Tailscale)

Para probar la PWA desde el celular sin desplegar en la nube. La Mac sirve el build de producción y Tailscale lo publica con HTTPS **solo dentro de tu tailnet**, es decir, para los dispositivos con tu cuenta. No se usa Funnel, así que no hay acceso público.

```
celular ──Tailscale (WireGuard, HTTPS)──> tailscale serve :443 ──> 127.0.0.1:8088 (Caddy, servicio `web`)
                                                                      ├── /api/* ──> api:8000
                                                                      └── resto  ──> frontend/dist/frontend/browser
```

## Puesta en marcha (una vez)

1. `brew install tailscale`
2. `tailscaled` en modo usuario (sin `sudo`) como LaunchAgent: `~/Library/LaunchAgents/com.tailscale.tailscaled-user.plist`, con `--tun=userspace-networking`, `--statedir` y `--socket` en `~/.local/share/tailscale/`.
3. `tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock up --hostname=carril-mac` y abrir el link de login.
4. Activar HTTPS en la tailnet: el primer `tailscale serve` da el link. **No** activar Funnel.
5. Instalar Tailscale en el celular con la misma cuenta.
6. **Shields up** en la Mac: `tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock set --shields-up=true`.
   En modo usuario, Tailscale reenvía a la Mac **cualquier** puerto abierto (5432 de Postgres, 8000 de la API y los de otros proyectos). Shields up los bloquea y deja pasar solo lo publicado con `tailscale serve`.
   Comprobación desde el celular: `http://<IP tailscale de la Mac>:8000/api/v1/health` no debe cargar, y la URL `https://…ts.net` sí.

## Uso

```bash
alias ts='tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock'

cd frontend && npm run build && cd ..                 # tras cambiar el frontend
docker compose --profile preview up -d                # db + api + web (127.0.0.1:8088)
ts serve --bg --https=443 http://127.0.0.1:8088       # https://carril-mac.<tailnet>.ts.net
ts serve status                                       # debe decir "(tailnet only)"
```

Tras un `npm run build`, la PWA instalada muestra el aviso "Hay una versión nueva de Carril." con el botón para actualizar (puede tardar hasta 30 min, o al reabrirla).

En el celular: abre la URL, entra y, en Android, Chrome → menú → "Instalar app"; en iPhone, Safari → Compartir → "Agregar a inicio".

## Apagar o deshacer

```bash
ts serve reset                                         # deja de publicar
docker compose --profile preview stop web
launchctl bootout gui/$(id -u)/com.tailscale.tailscaled-user   # apaga Tailscale en la Mac
```

## Notas

- La Mac debe estar encendida y con Docker corriendo.
- Si algún día añades otras personas a la tailnet, restringe además el acceso con la política de Tailscale (por ejemplo, un grant de `autogroup:member` a `autogroup:self` solo con `tcp:443`).
- Es una vista previa de prueba: existe el usuario demo (`demo@carril.dev` / `demo1234`) y el registro está abierto. No lo publiques con `funnel`; para producción, ver `backend/docs/DEPLOYMENT.md`.
- El puerto 8088 es el valor por defecto de `WEB_PORT`; se cambia en `.env`.
