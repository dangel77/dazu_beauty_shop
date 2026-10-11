# Puesta en marcha

Guía para quien mantiene el sitio. La dueña de la tienda no necesita nada de esto: su guía es [GUIA.md](GUIA.md).

## 1. Token de GitHub

El Worker necesita un token que solo pueda escribir en este repositorio.

1. Entrar a https://github.com/settings/personal-access-tokens y crear un token **fine-grained**.
2. En *Repository access* elegir **Only select repositories** y marcar solo `dazu_beauty_shop`.
3. En *Repository permissions* poner **Contents: Read and write**. Nada más.
4. Elegir el vencimiento y anotar la fecha: cuando venza, el panel deja de guardar hasta renovarlo (ver "Mantenimiento").
5. Copiar el token; se usa en el paso 2.

Después de esto, **revocar el token clásico** que usaba el panel anterior (`dazu admin`, en https://github.com/settings/tokens). Ese token daba acceso a todos los repositorios de la cuenta.

## 2. Desplegar el Worker

Hace falta una cuenta gratuita de Cloudflare (no pide tarjeta) y Node.js.

En PowerShell de Windows, si `npx` responde que "la ejecución de scripts está deshabilitada", escribí `npx.cmd` en lugar de `npx` en todos los comandos de esta guía.

```bash
cd worker
```

```bash
npx wrangler login
```

```bash
npx wrangler deploy
```

El despliegue muestra la dirección del Worker, parecida a `https://dazu-admin.<tu-subdominio>.workers.dev`. Luego cargar los tres secretos; cada comando pide el valor y no lo muestra en pantalla:

```bash
npx wrangler secret put GH_TOKEN
```

```bash
npx wrangler secret put ADMIN_PASSWORD
```

```bash
npx wrangler secret put SESSION_SECRET
```

- `GH_TOKEN`: el token del paso 1.
- `ADMIN_PASSWORD`: la contraseña con la que ella va a entrar. Que sea larga (por ejemplo, tres o cuatro palabras), porque es lo único que protege el panel.
- `SESSION_SECRET`: cualquier texto largo al azar. Se puede generar con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Para comprobar que quedó arriba, abrir la dirección del Worker en el navegador: debe responder `{"ok":true}`.

## 3. Conectar el panel

En `js/config.js`, poner la dirección del Worker en `WORKER_URL`, sin `/` al final:

```js
WORKER_URL: 'https://dazu-admin.<tu-subdominio>.workers.dev',
```

Si el sitio se sirve desde otra dirección que no sea `https://dangel77.github.io` (por ejemplo, un dominio propio), agregarla a `ALLOWED_ORIGINS` en `worker/wrangler.toml` y volver a desplegar.

## 4. Publicar

1. Si se agregaron productos con el panel anterior después de crear la rama `v2`, traer `main` a `v2` y crear las miniaturas que falten:

```bash
powershell -File tools\make-thumbs.ps1
```

2. Unir `v2` en `main` y subir. GitHub Pages publica en un par de minutos.
3. Probar en el sitio real, desde un celular:
   - El catálogo carga, se puede armar un pedido y el mensaje de WhatsApp sale completo.
   - En `admin.html` se entra con la contraseña, y marcar un producto como agotado muestra "Listo: los clientes ya ven los cambios" al rato.
   - Al pegar el link del catálogo en un chat de WhatsApp aparece la vista previa con el logo.

## Mantenimiento

| Situación | Qué hacer |
|---|---|
| Olvidó la contraseña, o hay que cambiarla | `npx wrangler secret put ADMIN_PASSWORD` desde `worker/` |
| Cerrar la sesión en todos los dispositivos | Cambiar `SESSION_SECRET` con `npx wrangler secret put SESSION_SECRET` |
| El panel dice que GitHub rechazó el token | El token venció: crear otro (paso 1) y `npx wrangler secret put GH_TOKEN` |
| Se borró un producto por error | Revertir ese commit desde GitHub Desktop (clic derecho en el commit, *Revert*) y subir |
| Cambié código del Worker | `npm test` y luego `npx wrangler deploy`, ambos desde `worker/` |
| Probar cambios sin tocar el sitio real | Ver "Probar en local" en el [README](README.md) |

Las sesiones duran 30 días. El panel confirma el guardado en cuanto el commit existe; el minuto de espera es lo que tarda GitHub Pages en publicarlo.

Para probar el Worker contra GitHub real sin arriesgar `main`, copiar `worker/.dev.vars.example` como `worker/.dev.vars`, crear una rama `prueba` en GitHub y correr `npx wrangler dev` desde `worker/`.
