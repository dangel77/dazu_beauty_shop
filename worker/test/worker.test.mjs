// Pruebas del Worker contra un GitHub de mentira. Correr con:  npm test  (dentro de worker/)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFakeGitHub, gitBlobSha } from './fake-github.mjs';

const ORIGIN = 'https://dangel77.github.io';
const PASSWORD = 'clave-correcta';
const INITIAL = { settings: { wa_number: '50600000000' }, products: [{ id: 'a1', name: 'Shampoo' }] };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

const env = {
  GH_API: 'https://github.test',
  GH_OWNER: 'dueno',
  GH_REPO: 'repo',
  GH_BRANCH: 'main',
  GH_TOKEN: 'test-token',
  ADMIN_PASSWORD: PASSWORD,
  SESSION_SECRET: 'secreto-de-prueba',
  ALLOWED_ORIGINS: ORIGIN
};

let github;

beforeEach(() => {
  github = createFakeGitHub({
    'data/products.json': JSON.stringify(INITIAL, null, 2) + '\n',
    'data/images/a1_viejo.jpg': JPEG,
    'index.html': '<html></html>'
  });
  globalThis.fetch = (url, init) => github.fetch(new Request(url, init));
});

async function call(method, path, { token, body, text, origin = ORIGIN, workerEnv = env } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await worker.fetch(new Request('https://worker.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : text
  }), workerEnv);

  return { status: res.status, headers: res.headers, data: res.status === 204 ? null : await res.json() };
}

async function login() {
  const res = await call('POST', '/login', { body: { password: PASSWORD } });
  assert.equal(res.status, 200);
  return res.data.token;
}

async function upload(token, buffer) {
  const res = await call('POST', '/image', { token, text: buffer.toString('base64') });
  assert.equal(res.status, 200);
  return res.data.sha;
}

function currentData() {
  return JSON.parse(github.files().get('data/products.json').toString());
}

test('una contraseña incorrecta no da sesión', async () => {
  const res = await call('POST', '/login', { body: { password: 'otra' } });
  assert.equal(res.status, 401);
  assert.equal(res.data.token, undefined);
});

test('sin sesión no se puede leer ni guardar', async () => {
  assert.equal((await call('GET', '/data')).status, 401);
  assert.equal((await call('POST', '/save', { body: { data: INITIAL } })).status, 401);
  assert.equal(github.commitCount(), 0);
});

test('una sesión alterada o vencida se rechaza', async () => {
  const token = await login();
  const [expires, signature] = token.split('.');

  const later = (Number(expires) + 1000) + '.' + signature;        // fecha cambiada, firma vieja
  assert.equal((await call('GET', '/data', { token: later })).status, 401);
  assert.equal((await call('GET', '/data', { token: expires + '.firma-falsa' })).status, 401);
  assert.equal((await call('GET', '/data', { token: 'basura' })).status, 401);

  // Firmada con otro secreto (por ejemplo, después de rotar SESSION_SECRET)
  const other = await call('POST', '/login', {
    body: { password: PASSWORD }, workerEnv: { ...env, SESSION_SECRET: 'otro-secreto' }
  });
  assert.equal((await call('GET', '/data', { token: other.data.token })).status, 401);
});

test('con sesión se leen los datos y su versión', async () => {
  const res = await call('GET', '/data', { token: await login() });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.data, INITIAL);
  assert.equal(res.data.sha, gitBlobSha(github.files().get('data/products.json')));
});

test('guardar un producto con dos fotos crea un solo commit', async () => {
  const token = await login();
  const { sha: baseSha } = (await call('GET', '/data', { token })).data;

  const photo = await upload(token, JPEG);
  const thumb = await upload(token, WEBP);
  assert.equal(github.commitCount(), 0, 'subir fotos todavía no crea commits');

  const data = { ...INITIAL, products: [...INITIAL.products, { id: 'b2', name: 'Labial', images: ['b2_x.jpg'] }] };
  const res = await call('POST', '/save', {
    token,
    body: {
      data,
      baseSha,
      message: 'Agregar producto: Labial',
      add: [{ path: 'data/images/b2_x.jpg', sha: photo }, { path: 'data/thumbs/b2_x.webp', sha: thumb }]
    }
  });

  assert.equal(res.status, 200);
  assert.equal(github.commitCount(), 1);
  assert.equal(github.lastCommit().message, 'Agregar producto: Labial');
  assert.deepEqual(currentData(), data);
  assert.deepEqual(github.files().get('data/images/b2_x.jpg'), JPEG);
  assert.deepEqual(github.files().get('data/thumbs/b2_x.webp'), WEBP);
  assert.ok(github.files().has('index.html'), 'el resto del repositorio queda intacto');

  // La versión devuelta sirve como base del siguiente guardado
  assert.equal(res.data.sha, (await call('GET', '/data', { token })).data.sha);
});

test('si otro dispositivo guardó antes, responde 409 y no pisa nada', async () => {
  const token = await login();
  const { sha: baseSha } = (await call('GET', '/data', { token })).data;

  const fromOtherDevice = { ...INITIAL, products: [] };
  github.pushFile('data/products.json', JSON.stringify(fromOtherDevice));

  const res = await call('POST', '/save', { token, body: { data: INITIAL, baseSha } });
  assert.equal(res.status, 409);
  assert.deepEqual(currentData(), fromOtherDevice);
  assert.equal(github.commitCount(), 1, 'solo existe el commit del otro dispositivo');
});

test('un cambio ajeno al catálogo no bloquea el guardado: reintenta sobre la rama nueva', async () => {
  const token = await login();
  const { sha: baseSha } = (await call('GET', '/data', { token })).data;

  // Justo antes de mover la rama, alguien sube un cambio de código
  github.hooks.beforeRefUpdate = () => github.pushFile('index.html', '<html>nuevo</html>');

  const data = { ...INITIAL, products: [] };
  const res = await call('POST', '/save', { token, body: { data, baseSha } });

  assert.equal(res.status, 200);
  assert.deepEqual(currentData(), data);
  assert.equal(github.files().get('index.html').toString(), '<html>nuevo</html>', 'no se pierde el cambio ajeno');
  assert.equal(github.commitCount(), 2);
});

test('borra las fotos que existen e ignora las que ya no están', async () => {
  const token = await login();
  const { sha: baseSha } = (await call('GET', '/data', { token })).data;

  const res = await call('POST', '/save', {
    token,
    body: {
      data: { ...INITIAL, products: [] },
      baseSha,
      remove: ['data/images/a1_viejo.jpg', 'data/thumbs/a1_viejo.jpg']
    }
  });

  assert.equal(res.status, 200);
  assert.equal(github.files().has('data/images/a1_viejo.jpg'), false);
  assert.equal(github.commitCount(), 1);
});

test('guardar sin cambios no crea un commit vacío', async () => {
  const token = await login();
  const { sha: baseSha } = (await call('GET', '/data', { token })).data;

  const res = await call('POST', '/save', { token, body: { data: INITIAL, baseSha } });
  assert.equal(res.status, 200);
  assert.equal(res.data.commit, null);
  assert.equal(github.commitCount(), 0);
});

test('solo puede escribir en el catálogo y en las carpetas de fotos', async () => {
  const token = await login();
  const { sha: baseSha } = (await call('GET', '/data', { token })).data;
  const photo = await upload(token, JPEG);

  for (const path of ['index.html', 'js/admin.js', 'data/products.json', 'data/images/../../index.html', 'data/images/x.svg']) {
    const added = await call('POST', '/save', { token, body: { data: INITIAL, baseSha, add: [{ path, sha: photo }] } });
    assert.equal(added.status, 400, 'agregar ' + path);
    const removed = await call('POST', '/save', { token, body: { data: INITIAL, baseSha, remove: [path] } });
    assert.equal(removed.status, 400, 'borrar ' + path);
  }

  assert.equal((await call('POST', '/save', { token, body: { data: { products: 'no' }, baseSha } })).status, 400);
  assert.equal(github.commitCount(), 0);
});

test('rechaza archivos que no son imágenes', async () => {
  const token = await login();
  const script = Buffer.from('<script>alert(1)</script>').toString('base64');

  assert.equal((await call('POST', '/image', { token, text: script })).status, 400);
  assert.equal((await call('POST', '/image', { token, text: '","encoding":"utf-8' })).status, 400);
  assert.equal((await call('POST', '/image', { token, text: '' })).status, 400);
});

test('CORS: solo responde al origen del catálogo', async () => {
  const allowed = await call('GET', '/', {});
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const other = await call('GET', '/', { origin: 'https://otro-sitio.com' });
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);

  const local = await call('GET', '/', { origin: 'http://localhost:5173' });
  assert.equal(local.headers.get('Access-Control-Allow-Origin'), null, 'localhost solo con ALLOW_LOCALHOST');

  const dev = await call('GET', '/', { origin: 'http://localhost:5173', workerEnv: { ...env, ALLOW_LOCALHOST: 'true' } });
  assert.equal(dev.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');

  const preflight = await call('OPTIONS', '/save', {});
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('avisa con claridad si falta un secreto o GitHub rechaza el token', async () => {
  const missing = await call('POST', '/login', { body: { password: PASSWORD }, workerEnv: { ...env, GH_TOKEN: '' } });
  assert.equal(missing.status, 500);
  assert.match(missing.data.error, /GH_TOKEN/);

  const badTokenEnv = { ...env, GH_TOKEN: 'vencido' };
  const session = await call('POST', '/login', { body: { password: PASSWORD }, workerEnv: badTokenEnv });
  const res = await call('GET', '/data', { token: session.data.token, workerEnv: badTokenEnv });
  assert.equal(res.status, 502);
  assert.match(res.data.error, /token/);
});
