/* =====================================================================
   Dazu Beauty Shop – admin Worker (Cloudflare Workers)

   The admin panel talks to this Worker instead of talking to GitHub.
   The Worker keeps the GitHub token as a secret, checks the admin
   password, and writes every save as ONE commit that can only touch
   data/products.json and the product photos.

   Secrets (npx wrangler secret put <NAME>):
     GH_TOKEN        fine-grained token: this repo only, Contents read/write
     ADMIN_PASSWORD  what the shop owner types to log in
     SESSION_SECRET  long random text that signs the sessions

   Variables (wrangler.toml): GH_OWNER, GH_REPO, GH_BRANCH, ALLOWED_ORIGINS
   ===================================================================== */

const SESSION_DAYS = 30;
const LOGIN_DELAY_MS = 1000;            // wait after a wrong password, slows down guessing
const MAX_JSON_BYTES = 1024 * 1024;     // products.json
const MAX_IMAGE_BASE64 = 1400 * 1024;   // about 1 MB of image, as base64 text
const MAX_ADDED_FILES = 80;
const MAX_REMOVED_FILES = 300;
const SAVE_ATTEMPTS = 3;

const DATA_PATH = 'data/products.json';
const IMAGE_PATH = /^data\/(images|thumbs)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      return await route(request, env, cors);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
      console.error(err);
      return json({ error: 'Error interno del servidor.' }, 500, cors);
    }
  }
};

async function route(request, env, cors) {
  const action = request.method + ' ' + new URL(request.url).pathname;

  if (action === 'GET /') return json({ ok: true }, 200, cors);

  for (const name of ['GH_TOKEN', 'ADMIN_PASSWORD', 'SESSION_SECRET']) {
    if (!env[name]) throw new HttpError(500, 'Falta configurar ' + name + ' en el Worker.');
  }

  if (action === 'POST /login') return json(await login(request, env), 200, cors);

  await requireSession(request, env);

  if (action === 'GET /data')   return json(await loadData(env), 200, cors);
  if (action === 'POST /image') return json(await uploadImage(request, env), 200, cors);
  if (action === 'POST /save')  return json(await save(request, env), 200, cors);

  throw new HttpError(404, 'Ruta no encontrada.');
}

// ===== RESPONSES & CORS =====
function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

// Browsers may only call the Worker from the catalog's own address.
// This is a courtesy check: what actually protects the data is the session token.
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isLocal = env.ALLOW_LOCALHOST === 'true' &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  const headers = { Vary: 'Origin' };
  if (allowed.includes(origin) || isLocal) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

async function readJson(request, maxLength) {
  const text = await request.text();
  if (text.length > maxLength) throw new HttpError(413, 'Los datos enviados son demasiado grandes.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Los datos enviados no son válidos.');
  }
}

// ===== LOGIN & SESSIONS =====
// A session is "<expiry in ms>.<HMAC of the expiry>". Nothing is stored:
// the signature proves the Worker issued it. Changing SESSION_SECRET logs everyone out.
function toBase64Url(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sessionKey(env) {
  return crypto.subtle.importKey(
    'raw', encoder.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

// Compares hashes byte by byte without stopping early, so timing reveals nothing
async function samePassword(given, expected) {
  const [a, b] = await Promise.all(
    [given, expected].map((text) => crypto.subtle.digest('SHA-256', encoder.encode(text)))
  );
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function login(request, env) {
  const body = await readJson(request, 2048);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!password || !(await samePassword(password, env.ADMIN_PASSWORD))) {
    await new Promise((resolve) => setTimeout(resolve, LOGIN_DELAY_MS));
    throw new HttpError(401, 'Contraseña incorrecta.');
  }

  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const signature = await crypto.subtle.sign('HMAC', await sessionKey(env), encoder.encode(String(expires)));
  return { token: expires + '.' + toBase64Url(signature), expires };
}

async function requireSession(request, env) {
  const header = request.headers.get('Authorization') || '';
  const [expires, signature] = (header.startsWith('Bearer ') ? header.slice(7) : '').split('.');

  let valid = false;
  if (signature && /^\d+$/.test(expires)) {
    try {
      valid = await crypto.subtle.verify(
        'HMAC', await sessionKey(env), fromBase64Url(signature), encoder.encode(expires)
      );
    } catch {
      valid = false;   // the signature was not even valid base64
    }
  }

  if (!valid || Number(expires) < Date.now()) {
    throw new HttpError(401, 'La sesión venció. Ingresá de nuevo.');
  }
}

// ===== GITHUB API =====
// Returns { status, data }. Any status that is not OK and not listed in `allow` is an error.
async function github(env, method, path, body, allow = []) {
  const base = env.GH_API || 'https://api.github.com';
  const res = await fetch(`${base}/repos/${env.GH_OWNER}/${env.GH_REPO}/${path}`, {
    method,
    headers: {
      Authorization: 'Bearer ' + env.GH_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dazu-admin-worker',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });

  const data = await res.json().catch(() => null);

  if (!res.ok && !allow.includes(res.status)) {
    if (res.status === 401) {
      throw new HttpError(502, 'GitHub rechazó el token del Worker: hay que crear uno nuevo (ver SETUP.md).');
    }
    const detail = data && data.message ? ': ' + data.message : '';
    throw new HttpError(502, 'GitHub respondió ' + res.status + detail);
  }

  return { status: res.status, data };
}

function branchRef(env) {
  return 'heads/' + env.GH_BRANCH;
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

// ===== GET /data =====
// `sha` identifies this version of products.json; the admin sends it back
// when saving so the Worker can tell whether someone else saved in between.
async function loadData(env) {
  const file = await github(
    env, 'GET', `contents/${DATA_PATH}?ref=${encodeURIComponent(env.GH_BRANCH)}`, undefined, [404]
  );
  if (file.status === 404) return { sha: null, data: { settings: {}, products: [] } };

  return { sha: file.data.sha, data: JSON.parse(decodeBase64Utf8(file.data.content)) };
}

// ===== POST /image =====
// Body: the image as base64 text. It is stored in the repository as a loose
// blob; it only becomes a file when a later /save names it in `add`.
function looksLikeImage(base64) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;

  const head = atob(base64.slice(0, 16));
  const isJpeg = head.startsWith('\xFF\xD8\xFF');
  const isPng  = head.startsWith('\x89PNG');
  const isWebp = head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp;
}

async function uploadImage(request, env) {
  const base64 = await request.text();
  if (base64.length > MAX_IMAGE_BASE64) throw new HttpError(413, 'La imagen es demasiado grande.');
  if (!looksLikeImage(base64)) throw new HttpError(400, 'El archivo no es una imagen válida.');

  // The base64 was checked above, so it is safe to place inside the JSON text as is
  const blob = await github(env, 'POST', 'git/blobs', '{"encoding":"base64","content":"' + base64 + '"}');
  return { sha: blob.data.sha };
}

// ===== POST /save =====
// Body: { data, baseSha, add: [{ path, sha }], remove: [path], message }
function validateSave(body) {
  const data = body.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.products) ||
      !data.settings || typeof data.settings !== 'object') {
    throw new HttpError(400, 'Los datos del catálogo no tienen el formato esperado.');
  }

  const add = Array.isArray(body.add) ? body.add : [];
  const remove = Array.isArray(body.remove) ? body.remove : [];
  if (add.length > MAX_ADDED_FILES || remove.length > MAX_REMOVED_FILES) {
    throw new HttpError(400, 'Demasiadas imágenes en un solo guardado.');
  }

  for (const file of add) {
    if (!file || !IMAGE_PATH.test(file.path) || !GIT_SHA.test(file.sha)) {
      throw new HttpError(400, 'Hay una imagen con un nombre no permitido.');
    }
  }
  const added = new Set(add.map((file) => file.path));
  for (const path of remove) {
    if (typeof path !== 'string' || !IMAGE_PATH.test(path) || added.has(path)) {
      throw new HttpError(400, 'Hay una imagen con un nombre no permitido.');
    }
  }

  const content = JSON.stringify(data, null, 2) + '\n';
  if (content.length > MAX_JSON_BYTES) throw new HttpError(413, 'El catálogo es demasiado grande.');

  const message = String(body.message || '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Actualizar productos';
  const baseSha = typeof body.baseSha === 'string' ? body.baseSha : null;

  return { content, add, remove, message, baseSha };
}

async function save(request, env) {
  const { content, add, remove, message, baseSha } =
    validateSave(await readJson(request, MAX_JSON_BYTES + 64 * 1024));

  const dataBlob = (await github(env, 'POST', 'git/blobs', { content, encoding: 'utf-8' })).data.sha;

  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    const head = (await github(env, 'GET', 'git/ref/' + branchRef(env))).data.object.sha;

    const current = await github(env, 'GET', `contents/${DATA_PATH}?ref=${head}`, undefined, [404]);
    const currentSha = current.status === 404 ? null : current.data.sha;
    if (currentSha !== baseSha) {
      throw new HttpError(409, 'El catálogo cambió desde otro dispositivo.');
    }

    if (currentSha === dataBlob && add.length === 0 && remove.length === 0) {
      return { sha: dataBlob, commit: null };   // nothing changed: no empty commit
    }

    const baseTree = (await github(env, 'GET', 'git/commits/' + head)).data.tree.sha;

    const tree = [{ path: DATA_PATH, mode: '100644', type: 'blob', sha: dataBlob }];
    for (const file of add) {
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: file.sha });
    }
    if (remove.length > 0) {
      // GitHub rejects deleting a path that is not there, so only delete what exists
      const listing = (await github(env, 'GET', `git/trees/${baseTree}?recursive=1`)).data.tree;
      const existing = new Set(listing.map((entry) => entry.path));
      for (const path of remove) {
        if (existing.has(path)) tree.push({ path, mode: '100644', type: 'blob', sha: null });
      }
    }

    const newTree = (await github(env, 'POST', 'git/trees', { base_tree: baseTree, tree })).data.sha;
    const commit = (await github(env, 'POST', 'git/commits', { message, tree: newTree, parents: [head] })).data.sha;

    // Without `force`, GitHub answers 422 if the branch moved after we read it.
    // That only means another commit landed first, so start over from the new head.
    const moved = await github(env, 'PATCH', 'git/refs/' + branchRef(env), { sha: commit, force: false }, [422]);
    if (moved.status !== 422) return { sha: dataBlob, commit };
  }

  throw new HttpError(503, 'No se pudo guardar porque el repositorio está recibiendo otros cambios. Intentá de nuevo.');
}
