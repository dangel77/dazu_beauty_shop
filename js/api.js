/* =====================================================================
   api.js  –  Dazu Beauty Shop
   Admin panel client for the Cloudflare Worker (worker/src/index.js).
   The Worker holds the GitHub token; the browser only keeps a session.
   ===================================================================== */

'use strict';

var SESSION_KEY = 'dazu_session';

function apiSession() {
  try {
    var session = JSON.parse(localStorage.getItem(SESSION_KEY));
    return session && session.token && session.expires > Date.now() ? session : null;
  } catch (_) {
    return null;
  }
}

function apiHasSession() {
  return apiSession() !== null;
}

function apiLogout() {
  localStorage.removeItem(SESSION_KEY);
}

// Rejects with an Error that carries the HTTP `status` (0 when the Worker could not be reached)
function apiRequest(method, path, options) {
  options = options || {};
  var headers = {};
  var session = apiSession();
  if (session) headers.Authorization = 'Bearer ' + session.token;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(DAZU_CONFIG.WORKER_URL + path, {
    method: method,
    headers: headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.text
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (res.ok) return data;
      if (res.status === 401 && path !== '/login') apiLogout();
      var err = new Error(data.error || 'El servidor respondió con un error (' + res.status + ').');
      err.status = res.status;
      throw err;
    });
  }, function () {
    var err = new Error('No se pudo conectar. Revisá tu conexión a internet.');
    err.status = 0;
    throw err;
  });
}

function apiLogin(password) {
  return apiRequest('POST', '/login', { json: { password: password } }).then(function (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  });
}

// -> { sha, data }  (`sha` identifies the version of products.json that was read)
function apiLoadData() {
  return apiRequest('GET', '/data');
}

// Uploads one image and resolves with its blob sha, to be named later in apiSave's `add`
function apiUploadImage(blob) {
  return blobToBase64Raw(blob)
    .then(function (base64) { return apiRequest('POST', '/image', { text: base64 }); })
    .then(function (result) { return result.sha; });
}

// payload: { data, baseSha, add: [{ path, sha }], remove: [path], message }  ->  { sha, commit }
function apiSave(payload) {
  return apiRequest('POST', '/save', { json: payload });
}
