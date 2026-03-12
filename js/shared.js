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
  return String(str).replace(/"/g, '&quot;');
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

function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
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
