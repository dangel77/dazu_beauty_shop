/* =====================================================================
   config.js  –  Dazu Beauty Shop
   Site-wide configuration shared by the catalog and the admin panel.
   ===================================================================== */

'use strict';

var DAZU_CONFIG = {
  // Public address of the catalog, always ending in "/".
  // Derived from the page so it works on GitHub Pages and on localhost.
  SITE_URL: new URL('.', window.location.href).href,

  // Address of the Cloudflare Worker that the admin panel talks to, without
  // a trailing "/". Leave empty until the Worker is deployed (see SETUP.md).
  WORKER_URL: '',

  IS_LOCAL: /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
};

// A local copy talks to the test Worker started with: node tools/dev-worker.mjs
if (DAZU_CONFIG.IS_LOCAL) {
  DAZU_CONFIG.WORKER_URL = 'http://localhost:8787';
}
