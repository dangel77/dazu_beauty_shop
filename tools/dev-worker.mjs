// Corre el Worker del admin en local contra un GitHub de mentira, cargado con
// los productos y fotos de esta carpeta. Sirve para probar el panel sin token
// y sin riesgo: los cambios quedan en memoria y se pierden al cerrar.
//
// Uso: node tools/dev-worker.mjs   →  http://localhost:8787   (contraseña: dazu)
// El admin abierto en localhost usa esta dirección automáticamente (ver js/config.js).
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';
import { createFakeGitHub } from '../worker/test/fake-github.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.WORKER_PORT) || 8787;
const GH_API = 'https://github.local';

const files = { 'data/products.json': await readFile(join(ROOT, 'data/products.json')) };
for (const dir of ['data/images', 'data/thumbs']) {
  for (const name of await readdir(join(ROOT, dir)).catch(() => [])) {
    if (/\.(jpe?g|png|webp)$/i.test(name)) files[`${dir}/${name}`] = await readFile(join(ROOT, dir, name));
  }
}

const github = createFakeGitHub(files, { token: 'dev-token' });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  String(url).startsWith(GH_API) ? github.fetch(new Request(url, init)) : realFetch(url, init);

const env = {
  GH_API,
  GH_OWNER: 'local',
  GH_REPO: 'local',
  GH_BRANCH: 'main',
  GH_TOKEN: 'dev-token',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'dazu',
  SESSION_SECRET: 'solo-para-desarrollo',
  ALLOWED_ORIGINS: '',
  ALLOW_LOCALHOST: 'true'
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const response = await worker.fetch(new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
  }), env);

  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));

  if (req.method === 'POST' && req.url === '/save' && response.ok) {
    console.log(`guardado → commit ${github.commitCount()}: ${github.lastCommit().message}`);
  }
}).listen(PORT, () => {
  console.log(`Worker de prueba en http://localhost:${PORT}  (contraseña: ${env.ADMIN_PASSWORD})`);
  console.log('Los cambios quedan en memoria; nada se escribe en disco ni en GitHub.');
});
