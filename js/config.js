/* =====================================================================
   config.js  –  Dazu Beauty Shop
   Site-wide configuration shared by the catalog and the admin panel.
   ===================================================================== */

'use strict';

var DAZU_CONFIG = {
  // Public address of the catalog, always ending in "/".
  // Derived from the page so it works on GitHub Pages and on localhost.
  SITE_URL: new URL('.', window.location.href).href,

  // Address of the Cloudflare Worker that the admin panel talks to.
  // Leave empty until the Worker is deployed (see SETUP.md).
  WORKER_URL: ''
};
