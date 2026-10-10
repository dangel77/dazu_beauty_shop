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

function escapeAttr(str) {
  return escapeHtml(str);
}

function getCategoryEmoji(category) {
  const map = {
    'shampoo': '🧴',
    'crema': '🧴',
    'jabón': '🧼',
    'jabon': '🧼',
    'acondicionador': '💆',
    'aceite': '🫙',
    'mascarilla': '💆',
    'perfume': '🌹',
    'maquillaje': '💄',
    'cuidado facial': '✨',
    'cuidado corporal': '🌿'
  };
  const key = (category || '').toLowerCase();
  return map[key] || '✨';
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

function imageUrl(name) {
  return 'data/images/' + encodeURIComponent(name);
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

// ===== TOAST =====
// Only one toast at a time: a new message replaces the previous one.
var _toastTimer = null;

function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  clearTimeout(_toastTimer);
  container.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  _toastTimer = setTimeout(() => toast.remove(), 2600);
}

// ===== IMAGE COMPRESSION (client-side) =====
// Resizes large images before uploading to keep repo lean
function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 800;
  quality = quality || 0.82;

  return new Promise(function (resolve) {
    // If file is small enough and a JPEG, skip compression
    if (file.size < 150000 && file.type === 'image/jpeg') {
      resolve(file);
      return;
    }

    var img = new Image();
    var reader = new FileReader();

    reader.onload = function (e) {
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;

        if (w > maxWidth) {
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        canvas.toBlob(function (blob) {
          resolve(blob || file);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Convert blob/file to pure base64 string (no data URL prefix)
function blobToBase64Raw(blob) {
  return new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ===== DARK MODE =====
var DARK_MODE_KEY = 'dazu_dark_mode';

// `html.dark` drives the catalog theme; `body.dark-mode` is what the admin stylesheet expects.
function _applyDarkMode(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark-mode', isDark);
  _updateDarkModeIcons(isDark);
}

function initDarkMode() {
  var stored = localStorage.getItem(DARK_MODE_KEY);
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  _applyDarkMode(stored !== null ? stored === 'true' : prefersDark);
}

function toggleDarkMode() {
  var isDark = !document.documentElement.classList.contains('dark');
  localStorage.setItem(DARK_MODE_KEY, isDark ? 'true' : 'false');
  _applyDarkMode(isDark);
}

function _updateDarkModeIcons(isDark) {
  var icon = isDark ? '☀️' : '🌙';
  var btns = document.querySelectorAll('.dark-mode-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].textContent = icon;
  }
}

// Init dark mode immediately so there's no flash
initDarkMode();

// Attach toggle listeners once DOM is ready
(function () {
  function _attachDarkModeListeners() {
    var btns = document.querySelectorAll('.dark-mode-btn, [data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', toggleDarkMode);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _attachDarkModeListeners);
  } else {
    _attachDarkModeListeners();
  }
}());
