# Dazu Beauty Shop - Guia de Configuracion

## Para vos (David, el desarrollador)

La duena de la tienda NO necesita hacer nada de esto. Vos configuras todo una sola vez.

---

### Paso 1: Crear el Token

1. Ve a [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click en **"Generate new token (classic)"**
3. Nombre: `dazu admin`
4. Expiration: **No expiration**
5. Scopes: marca **`repo`**
6. Click en **Generate token** y copia el token

---

### Paso 2: Subir el repo y activar Pages

1. Hace push de todos los archivos a GitHub
2. Ve al repo > **Settings** > **Pages**
3. Source: **Deploy from a branch** > `main` / `/ (root)`
4. Guarda y espera unos minutos

El sitio estara en: `https://dangel77.github.io/dazu_beauty_shop/`

---

### Paso 3: Configurar el admin en el dispositivo de ella

1. Abri `https://dangel77.github.io/dazu_beauty_shop/admin.html` en su celular o compu
2. Pega el token en el campo "Clave de acceso"
3. Toca "Entrar"
4. Listo — el token se guarda en su navegador, no lo tiene que poner nunca mas

---

### Para ella (la duena)

Ella solo necesita:
1. Abrir la pagina de admin
2. Agregar/editar/borrar productos con los botones
3. Subir fotos tocando el area de imagen
4. Los clientes ven los cambios en unos minutos

No necesita saber nada de GitHub, tokens, ni programacion.

---

### Notas tecnicas

- Los productos se guardan en `data/products.json` via GitHub API
- Las imagenes se guardan en `data/images/` (comprimidas automaticamente a ~100-200 KB)
- El token se guarda en localStorage del navegador de ella. Si borra datos del navegador, vas a tener que pegar el token de nuevo
- El numero de WhatsApp (61000133) esta pre-configurado en `data/products.json`
- GitHub Pages cachea ~5-10 min, asi que los cambios no son instantaneos para los clientes
- 100% gratis: GitHub Pages + GitHub API, sin servicios externos
