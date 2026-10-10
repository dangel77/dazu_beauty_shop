// GitHub de mentira, en memoria. Implementa solo las rutas de la API que usa
// el Worker, para poder probarlo (tests y tools/dev-worker.mjs) sin token ni red.
import { createHash, randomBytes } from 'node:crypto';

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Mismo cálculo que hace git, así los SHA coinciden con los de GitHub real
export function gitBlobSha(buffer) {
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

/**
 * @param {Record<string, string | Buffer>} files  contenido inicial de la rama, por ruta
 * @param {{ token?: string, branch?: string }} options
 */
export function createFakeGitHub(files = {}, { token = 'test-token', branch = 'main' } = {}) {
  const blobs = new Map();     // sha -> Buffer
  const trees = new Map();     // sha -> Map(ruta -> sha del blob)
  const commits = new Map();   // sha -> { tree, parents, message }
  const refs = new Map();      // 'heads/<rama>' -> sha del commit
  const hooks = { beforeRefUpdate: null };   // permite simular que la rama se movió

  const randomSha = () => randomBytes(20).toString('hex');

  function putBlob(buffer) {
    const sha = gitBlobSha(buffer);
    blobs.set(sha, buffer);
    return sha;
  }

  function putCommit(treeMap, parents, message) {
    const tree = randomSha();
    trees.set(tree, treeMap);
    const sha = randomSha();
    commits.set(sha, { tree, parents, message });
    return sha;
  }

  const initial = new Map();
  for (const [path, content] of Object.entries(files)) initial.set(path, putBlob(Buffer.from(content)));
  refs.set('heads/' + branch, putCommit(initial, [], 'inicial'));

  const head = () => refs.get('heads/' + branch);
  const treeOf = (commitSha) => trees.get(commits.get(commitSha).tree);

  // Acepta el nombre de una rama o el SHA de un commit
  function resolve(ref) {
    if (commits.has(ref)) return ref;
    return refs.get('heads/' + ref) || null;
  }

  async function handle(request) {
    if (request.headers.get('Authorization') !== 'Bearer ' + token) {
      return json(401, { message: 'Bad credentials' });
    }

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\//, ''));
    const method = request.method;
    const body = method === 'GET' ? null : await request.json();
    let match;

    if (method === 'GET' && (match = /^contents\/(.+)$/.exec(path))) {
      const commit = resolve(url.searchParams.get('ref') || branch);
      const sha = commit && treeOf(commit).get(match[1]);
      if (!sha) return json(404, { message: 'Not Found' });
      return json(200, {
        type: 'file', path: match[1], sha, encoding: 'base64', content: blobs.get(sha).toString('base64')
      });
    }

    if (method === 'GET' && (match = /^git\/ref\/(.+)$/.exec(path))) {
      const sha = refs.get(match[1]);
      if (!sha) return json(404, { message: 'Not Found' });
      return json(200, { ref: 'refs/' + match[1], object: { type: 'commit', sha } });
    }

    if (method === 'GET' && (match = /^git\/commits\/([0-9a-f]{40})$/.exec(path))) {
      const commit = commits.get(match[1]);
      if (!commit) return json(404, { message: 'Not Found' });
      return json(200, { sha: match[1], tree: { sha: commit.tree }, parents: commit.parents.map((sha) => ({ sha })) });
    }

    if (method === 'GET' && (match = /^git\/trees\/([0-9a-f]{40})$/.exec(path))) {
      const tree = trees.get(match[1]);
      if (!tree) return json(404, { message: 'Not Found' });
      return json(200, {
        sha: match[1],
        truncated: false,
        tree: [...tree].map(([filePath, sha]) => ({ path: filePath, mode: '100644', type: 'blob', sha }))
      });
    }

    if (method === 'POST' && path === 'git/blobs') {
      const buffer = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
      return json(201, { sha: putBlob(buffer) });
    }

    if (method === 'POST' && path === 'git/trees') {
      const base = trees.get(body.base_tree);
      if (!base) return json(422, { message: 'base_tree no existe' });
      const next = new Map(base);
      for (const entry of body.tree) {
        if (entry.sha === null) {
          if (!next.has(entry.path)) return json(422, { message: 'GitRPC::BadObjectState' });
          next.delete(entry.path);
        } else {
          if (!blobs.has(entry.sha)) return json(422, { message: 'tree.sha no es un blob válido' });
          next.set(entry.path, entry.sha);
        }
      }
      const sha = randomSha();
      trees.set(sha, next);
      return json(201, { sha });
    }

    if (method === 'POST' && path === 'git/commits') {
      if (!trees.has(body.tree)) return json(422, { message: 'tree no existe' });
      const sha = randomSha();
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return json(201, { sha });
    }

    if (method === 'PATCH' && (match = /^git\/refs\/(.+)$/.exec(path))) {
      if (hooks.beforeRefUpdate) {
        const hook = hooks.beforeRefUpdate;
        hooks.beforeRefUpdate = null;
        hook();
      }
      const commit = commits.get(body.sha);
      if (!commit) return json(422, { message: 'Object does not exist' });
      if (!body.force && commit.parents[0] !== refs.get(match[1])) {
        return json(422, { message: 'Update is not a fast forward' });
      }
      refs.set(match[1], body.sha);
      return json(200, { ref: 'refs/' + match[1], object: { sha: body.sha } });
    }

    return json(404, { message: 'Ruta no implementada en el GitHub de prueba: ' + method + ' ' + path });
  }

  return {
    fetch: handle,
    hooks,
    head,

    /** Archivos de la rama: Map(ruta -> Buffer) */
    files() {
      return new Map([...treeOf(head())].map(([path, sha]) => [path, blobs.get(sha)]));
    },

    /** Cantidad de commits desde el inicial hasta la punta de la rama */
    commitCount() {
      let count = 0;
      for (let sha = head(); commits.get(sha).parents.length > 0; sha = commits.get(sha).parents[0]) count++;
      return count;
    },

    lastCommit() {
      return commits.get(head());
    },

    /** Agrega un commit directo a la rama, como si alguien más hubiera hecho push */
    pushFile(path, content, message = 'cambio externo') {
      const next = new Map(treeOf(head()));
      next.set(path, putBlob(Buffer.from(content)));
      refs.set('heads/' + branch, putCommit(next, [head()], message));
    }
  };
}
