/* =====================================================================
   shared.js  –  Dazu Beauty Shop
   Shared utility functions used by both catalogo.js and admin.js
   ===================================================================== */

'use strict';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function icon(name) {
  return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

function formatPrice(n) {
  return '₡' + Number(n).toLocaleString('es-CR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// Lowercase and strip accents so "jabon" matches "Jabón"
function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function cleanName(name) {
  return String(name).replace(/\s+/g, ' ').trim();
}

// ===== PRODUCT HELPERS =====
// Older products stored a single `category` / `image`; newer ones use arrays.
function getProductCategories(product) {
  if (Array.isArray(product.categories)) return product.categories;
  if (product.category) return [product.category];
  return [];
}

function getProductImages(product) {
  if (Array.isArray(product.images) && product.images.length > 0) return product.images;
  if (product.image) return [product.image];
  return [];
}

function hasVariants(product) {
  return Array.isArray(product.variants) && product.variants.length > 0;
}

// Every photo has a full-size file and a small copy with the same name for lists
var IMAGE_DIR = 'data/images/';
var THUMB_DIR = 'data/thumbs/';

function imageUrl(name) {
  return IMAGE_DIR + encodeURIComponent(name);
}

function thumbUrl(name) {
  return THUMB_DIR + encodeURIComponent(name);
}

// <img> that shows the small copy and falls back to the full photo when the
// small one does not exist (see the `error` listener at the end of this file).
function thumbImg(name, className, alt, loading) {
  return '<img class="' + className + '" src="' + escapeHtml(thumbUrl(name)) + '"' +
    ' data-full="' + escapeHtml(imageUrl(name)) + '" alt="' + escapeHtml(alt || '') + '"' +
    ' loading="' + (loading || 'lazy') + '" decoding="async" />';
}

// ===== STORE SETTINGS =====
// Used whenever data/products.json does not define the setting yet.
var DEFAULT_SETTINGS = {
  payment_methods: ['SINPE Móvil', 'Transferencia bancaria', 'Efectivo', 'Otro'],
  delivery_options: [
    { label: 'Envío', address: true },
    { label: 'Retiro / entrega personal', address: false }
  ],
  payment_notice: 'El pago se realiza antes de recibir los productos. Al confirmar tu pedido te enviamos los datos para pagar.',
  banner_text: 'Envío a todo el país · Pedí fácil y rápido por WhatsApp'
};

function getSetting(settings, key) {
  var value = settings ? settings[key] : undefined;
  var fallback = DEFAULT_SETTINGS[key];
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.length > 0 ? value : fallback;
  }
  return typeof value === 'string' ? value : fallback;
}

// Options may come as plain text; an option asks for an address when it is a delivery
function getDeliveryOptions(settings) {
  return getSetting(settings, 'delivery_options').map(function (option) {
    if (typeof option === 'string') {
      return { label: option, address: /env[ií]o|domicilio|correo|encomienda/i.test(option) };
    }
    return { label: String(option.label || '').trim(), address: !!option.address };
  }).filter(function (option) { return option.label; });
}

// ===== TOAST =====
// Only one toast at a time: a new message replaces the previous one.
var _toastTimer = null;

function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  clearTimeout(_toastTimer);
  container.innerHTML = '';
  var toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  _toastTimer = setTimeout(function () { toast.remove(); }, type === 'error' ? 4500 : 2600);
}

// ===== IMAGE PREPARATION (client-side) =====
// Phone photos weigh several MB. Before uploading, each one is scaled down and
// re-encoded, and a small copy is made for the catalog grid.
var IMAGE_MAX_SIDE = 1200;
var THUMB_MAX_SIDE = 480;

function _decodeImage(file) {
  function withImgElement() {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }
  if (!window.createImageBitmap) return withImgElement();
  // 'from-image' applies the rotation that phone cameras store as metadata
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(withImgElement);
}

function _renderImage(source, maxSide, type, quality) {
  var width  = source.naturalWidth || source.width;
  var height = source.naturalHeight || source.height;
  var scale  = Math.min(1, maxSide / Math.max(width, height));

  var canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';   // transparent PNGs would otherwise turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
}

// Resolves with { main: Blob, thumb: Blob, ext: 'webp' | 'jpg' }
function prepareImage(file) {
  return _decodeImage(file).then(function (source) {
    return _renderImage(source, IMAGE_MAX_SIDE, 'image/webp', 0.82).then(function (main) {
      // WebP is smaller, but a browser that cannot write it hands back a PNG instead
      var webp = !!main && main.type === 'image/webp';
      var type = webp ? 'image/webp' : 'image/jpeg';

      return Promise.all([
        webp ? main : _renderImage(source, IMAGE_MAX_SIDE, 'image/jpeg', 0.85),
        _renderImage(source, THUMB_MAX_SIDE, type, 0.8)
      ]).then(function (blobs) {
        if (source.close) source.close();
        if (!blobs[0] || !blobs[1]) throw new Error('No se pudo procesar la imagen');
        return { main: blobs[0], thumb: blobs[1], ext: webp ? 'webp' : 'jpg' };
      });
    });
  });
}

// Convert blob/file to pure base64 string (no data URL prefix)
function blobToBase64Raw(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result.split(',')[1]); };
    reader.onerror = function () { reject(new Error('No se pudo leer la imagen')); };
    reader.readAsDataURL(blob);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===== DARK MODE =====
// The `dark` class on <html> swaps the color tokens (see css/styles.css)
var DARK_MODE_KEY = 'dazu_dark_mode';

function initDarkMode() {
  var stored = localStorage.getItem(DARK_MODE_KEY);
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', stored !== null ? stored === 'true' : prefersDark);
}

function toggleDarkMode() {
  var isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(DARK_MODE_KEY, isDark ? 'true' : 'false');
}

initDarkMode();

document.addEventListener('click', function (e) {
  if (e.target.closest('[data-theme-toggle]')) toggleDarkMode();
});

// ===== IMAGE FALLBACKS =====
// `error` does not bubble, hence the capture. A missing thumbnail is replaced
// by the full photo. A missing photo marks its frame so CSS shows a placeholder,
// and becomes a transparent pixel so the browser's broken-image icon never shows.
var BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

document.addEventListener('error', function (e) {
  var img = e.target;
  if (!img || img.tagName !== 'IMG') return;

  if (img.dataset.full) {
    var full = img.dataset.full;
    delete img.dataset.full;
    img.src = full;
    return;
  }

  var frame = img.closest('.card-media, .slide, .photo');
  if (frame) frame.classList.add('no-img');
  if (img.getAttribute('src') !== BLANK_IMAGE) img.src = BLANK_IMAGE;
}, true);
