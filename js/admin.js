/* =====================================================================
   admin.js  –  Dazu Beauty Shop
   Admin panel. Reads and saves through the Cloudflare Worker (js/api.js),
   which stores everything in data/products.json and the photo folders.
   ===================================================================== */

'use strict';

// ===== STATE =====
// `products` and `settings` always hold what the admin wants the catalog to
// be. A change is applied here first and then sent to the server; if the save
// fails, both are reloaded from the server so the screen never lies.
var products = [];
var settings = {};
var dataSha  = null;          // version of products.json this state is based on

var activeTab     = 'products';
var adminQuery    = '';
var reorderDraft  = null;     // copy of `products` being rearranged, or null
var sessionImages = {};       // file name -> preview URL of photos uploaded in this visit

// Product form
var editingId     = null;     // id of the product being edited, or null for a new one
var formProductId = '';       // id the product is saved with
var formPhotos    = [];       // [{ key, name, src, isNew, ready, shas }]
var formVariants  = [];       // [{ key, name, available, photoKey }]
var formNewCats   = [];       // categories typed in the form; they reach settings on save
var selectedPhoto = null;     // key of the photo the action buttons apply to
var pickingFor    = null;     // key of the option whose photo is being chosen
var formDirty     = false;
var formBusy      = false;

var MAX_PHOTOS     = 20;
var MAX_PHOTO_SIZE = 25 * 1024 * 1024;   // phone originals; they are shrunk before uploading

// ===== DOM =====
var loginScreen   = document.getElementById('loginScreen');
var loginForm     = document.getElementById('loginForm');
var loginHint     = document.getElementById('loginHint');
var loginPassword = document.getElementById('loginPassword');
var loginReveal   = document.getElementById('loginReveal');
var loginError    = document.getElementById('loginError');
var loginBtn      = document.getElementById('loginBtn');

var adminPanel    = document.getElementById('adminPanel');
var logoutBtn     = document.getElementById('logoutBtn');
var publishStatus = document.getElementById('publishStatus');
var overlay       = document.getElementById('overlay');

// Products tab
var listTools     = document.getElementById('listTools');
var adminSearch   = document.getElementById('adminSearch');
var reorderBtn    = document.getElementById('reorderBtn');
var addProductBtn = document.getElementById('addProductBtn');
var reorderBar    = document.getElementById('reorderBar');
var reorderCancel = document.getElementById('reorderCancel');
var reorderSave   = document.getElementById('reorderSave');
var listCount     = document.getElementById('listCount');
var productList   = document.getElementById('productList');

// Categories tab
var categoryList  = document.getElementById('categoryList');
var categoryForm  = document.getElementById('categoryForm');
var categoryInput = document.getElementById('categoryInput');

// Settings tab
var settingsForm   = document.getElementById('settingsForm');
var setWhatsapp    = document.getElementById('setWhatsapp');
var setBanner      = document.getElementById('setBanner');
var setPayments    = document.getElementById('setPayments');
var setAddPayment  = document.getElementById('setAddPayment');
var setDeliveries  = document.getElementById('setDeliveries');
var setAddDelivery = document.getElementById('setAddDelivery');
var setNotice      = document.getElementById('setNotice');
var setError       = document.getElementById('setError');
var setSave        = document.getElementById('setSave');

// Product form
var productSheet    = document.getElementById('productSheet');
var productForm     = document.getElementById('productForm');
var pfTitle         = document.getElementById('pfTitle');
var pfClose         = document.getElementById('pfClose');
var pfPhotos        = document.getElementById('pfPhotos');
var pfFile          = document.getElementById('pfFile');
var pfPhotoActions  = document.getElementById('pfPhotoActions');
var pfName          = document.getElementById('pfName');
var pfPrice         = document.getElementById('pfPrice');
var pfDesc          = document.getElementById('pfDesc');
var pfCategories    = document.getElementById('pfCategories');
var pfNewCategory   = document.getElementById('pfNewCategory');
var pfAddCategory   = document.getElementById('pfAddCategory');
var pfVariants      = document.getElementById('pfVariants');
var pfAddVariant    = document.getElementById('pfAddVariant');
var pfAvailable     = document.getElementById('pfAvailable');
var pfAvailableHint = document.getElementById('pfAvailableHint');
var pfError         = document.getElementById('pfError');
var pfExtra         = document.getElementById('pfExtra');
var pfDuplicate     = document.getElementById('pfDuplicate');
var pfDelete        = document.getElementById('pfDelete');
var pfCancel        = document.getElementById('pfCancel');
var pfSave          = document.getElementById('pfSave');

// Confirm dialog
var dialogSheet = document.getElementById('dialogSheet');
var dlgTitle    = document.getElementById('dlgTitle');
var dlgText     = document.getElementById('dlgText');
var dlgInput    = document.getElementById('dlgInput');
var dlgCancel   = document.getElementById('dlgCancel');
var dlgOk       = document.getElementById('dlgOk');

// ===== HELPERS =====
function findProduct(id) {
  return products.find(function (p) { return p.id === id; });
}

function unique(list) {
  return list.filter(function (item, i) { return list.indexOf(item) === i; });
}

// Shows a server error. A lost session sends the admin back to the login screen.
function reportError(err) {
  if (err && err.status === 401) {
    showLogin('Tu sesión venció. Ingresá de nuevo.');
    return;
  }
  showToast(err && err.message ? err.message : 'Ocurrió un error. Intentá de nuevo.', 'error');
}

// Photos uploaded in this visit are not on the public site yet (it takes about
// a minute to publish), so they are shown from the copy kept in memory.
function photoHtml(name, className) {
  if (!name) return '<span class="' + className + '"></span>';
  if (sessionImages[name]) {
    return '<img class="' + className + '" src="' + escapeHtml(sessionImages[name]) + '" alt="" />';
  }
  return thumbImg(name, className, '');
}

// ===== SHEETS =====
var openSheets = [];

function syncSheets() {
  [productSheet, dialogSheet].forEach(function (sheet) {
    var isOpen = openSheets.indexOf(sheet) !== -1;
    sheet.classList.toggle('open', isOpen);
    sheet.toggleAttribute('inert', !isOpen);
  });
  overlay.classList.toggle('open', openSheets.length > 0);
  document.documentElement.classList.toggle('locked', openSheets.length > 0);
}

function openSheet(sheet) {
  if (openSheets.indexOf(sheet) === -1) openSheets.push(sheet);
  syncSheets();
  sheet.focus({ preventScroll: true });
}

function closeSheet(sheet) {
  openSheets = openSheets.filter(function (s) { return s !== sheet; });
  syncSheets();
}

// ===== CONFIRM / PROMPT DIALOG =====
// Resolves with true/false, or with the typed text (null if cancelled) when `input` is given.
var dialogResolve = null;

function askDialog(options) {
  dlgTitle.textContent = options.title;
  dlgText.textContent = options.text || '';
  dlgOk.textContent = options.okLabel || 'Aceptar';
  dlgOk.classList.toggle('btn-danger', !!options.danger);
  dlgOk.classList.toggle('btn-primary', !options.danger);
  dlgInput.hidden = options.input === undefined;
  dlgInput.value = options.input || '';

  openSheet(dialogSheet);
  if (!dlgInput.hidden) {
    dlgInput.focus();
    dlgInput.select();
  }
  return new Promise(function (resolve) { dialogResolve = resolve; });
}

function closeDialog(confirmed) {
  var resolve = dialogResolve;
  var wantsText = !dlgInput.hidden;
  dialogResolve = null;
  closeSheet(dialogSheet);
  if (!resolve) return;
  if (wantsText) resolve(confirmed ? dlgInput.value.trim() : null);
  else resolve(confirmed);
}

// ===== LOGIN =====
function showLogin(message) {
  closeProductForm();
  adminPanel.hidden = true;
  loginScreen.hidden = false;
  loginPassword.value = '';
  loginError.textContent = message || '';
  loginError.hidden = !message;

  if (!DAZU_CONFIG.WORKER_URL) {
    loginHint.textContent = 'El panel todavía no está conectado al servidor. Falta desplegar el Worker y poner su dirección en js/config.js (ver SETUP.md).';
    loginPassword.disabled = true;
    loginBtn.disabled = true;
    return;
  }
  loginPassword.focus();
}

async function handleLogin(e) {
  e.preventDefault();
  var password = loginPassword.value;
  if (!password) {
    loginError.textContent = 'Escribí tu contraseña.';
    loginError.hidden = false;
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando…';
  loginError.hidden = true;

  try {
    await apiLogin(password);
    await showPanel();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
    loginPassword.select();
  }

  loginBtn.disabled = false;
  loginBtn.textContent = 'Entrar';
}

async function showPanel() {
  await loadData();
  loginScreen.hidden = true;
  adminPanel.hidden = false;
}

function handleLogout() {
  apiLogout();
  showLogin();
}

// ===== LOAD =====
async function loadData() {
  var result = await apiLoadData();
  products = result.data.products || [];
  settings = result.data.settings || {};
  dataSha  = result.sha;
  if (!Array.isArray(settings.categories)) settings.categories = [];

  setReordering(false);
  renderProducts();
  renderCategories();
  // Leave the settings form alone while the admin is filling it in
  if (activeTab !== 'settings') renderSettings();
}

// ===== SAVE =====
// Saves run one at a time. Changes made while one is in flight are merged into
// a single follow-up save, so toggling several products quickly makes few commits.
var saving = false;
var pendingSave = null;   // { messages, add, remove, waiters }

function saveCatalog(message, files) {
  files = files || {};
  if (!pendingSave) pendingSave = { messages: [], add: [], remove: [], waiters: [] };
  var job = pendingSave;

  job.messages.push(message);
  job.add = job.add.concat(files.add || []);
  job.remove = job.remove.concat(files.remove || []);

  var done = new Promise(function (resolve, reject) {
    job.waiters.push({ resolve: resolve, reject: reject });
  });
  runSaves();
  return done;
}

async function runSaves() {
  if (saving || !pendingSave) return;
  saving = true;

  var job = pendingSave;
  pendingSave = null;
  var version = Date.now();

  try {
    var result = await apiSave({
      data: { version: version, settings: settings, products: products },
      baseSha: dataSha,
      add: job.add,
      remove: job.remove,
      message: job.messages.length === 1 ? job.messages[0] : 'Actualizar catálogo (' + job.messages.length + ' cambios)'
    });
    dataSha = result.sha;
    if (result.commit) watchPublish(version);
    job.waiters.forEach(function (w) { w.resolve(); });
  } catch (err) {
    if (err.status === 409) {
      err.message = 'El catálogo cambió desde otro dispositivo. Ya cargamos la versión nueva: revisá y guardá otra vez.';
    }
    // Whatever was queued behind was built on changes the server just refused
    var failed = job.waiters.concat(pendingSave ? pendingSave.waiters : []);
    pendingSave = null;
    if (err.status !== 401) await loadData().catch(function () {});
    failed.forEach(function (w) { w.reject(err); });
  }

  saving = false;
  runSaves();
}

window.addEventListener('beforeunload', function (e) {
  if (saving || pendingSave || formBusy) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ===== PUBLISH STATUS =====
// A save is a commit; GitHub Pages needs about a minute to publish it. The saved
// data carries a `version` number, so the panel can tell when the public file caught up.
var publishWatch = 0;
var publishTimer = null;

function setPublish(text, state) {
  publishStatus.textContent = text;
  publishStatus.className = 'publish' + (state ? ' is-' + state : '');
  publishStatus.hidden = !text;
}

function watchPublish(version) {
  var watch = ++publishWatch;
  clearTimeout(publishTimer);

  if (DAZU_CONFIG.IS_LOCAL) {
    setPublish('Guardado en el servidor de prueba (no se publica).', 'note');
    publishTimer = setTimeout(function () { setPublish(''); }, 4000);
    return;
  }

  setPublish('Guardado. Publicando en el catálogo…');
  var deadline = Date.now() + 5 * 60 * 1000;

  (function check() {
    fetch('data/products.json?v=' + Date.now(), { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (live) { return (live.version || 0) >= version; }, function () { return false; })
      .then(function (isLive) {
        if (watch !== publishWatch) return;   // a newer save took over
        if (isLive) {
          setPublish('Listo: los clientes ya ven los cambios.', 'done');
          publishTimer = setTimeout(function () { setPublish(''); }, 6000);
        } else if (Date.now() > deadline) {
          setPublish('Guardado. Puede tardar unos minutos más en verse en el catálogo.', 'note');
        } else {
          publishTimer = setTimeout(check, 6000);
        }
      });
  }());
}

// ===== TABS =====
function showTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.setAttribute('aria-selected', tab.dataset.tab === name ? 'true' : 'false');
  });
  ['products', 'categories', 'settings'].forEach(function (tab) {
    document.getElementById('tab-' + tab).hidden = tab !== name;
  });
  if (name === 'settings') renderSettings();
}

// ===== PRODUCT LIST =====
function productMeta(product) {
  var parts = [formatPrice(product.price)];
  var photos = getProductImages(product).length;
  if (photos === 0) parts.push('sin foto');
  else if (photos > 1) parts.push(photos + ' fotos');
  if (hasVariants(product)) {
    parts.push(product.variants.length + (product.variants.length === 1 ? ' opción' : ' opciones'));
  }
  return parts.join(' · ');
}

function productRowHtml(product, index, total) {
  var name = cleanName(product.name);
  var side;

  if (reorderDraft) {
    side = '<div class="row-moves">' +
      '<button class="icon-btn" type="button" data-move="top" aria-label="Mover al inicio"' + (index === 0 ? ' disabled' : '') + '>' + icon('top') + '</button>' +
      '<button class="icon-btn" type="button" data-move="up" aria-label="Subir"' + (index === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
      '<button class="icon-btn" type="button" data-move="down" aria-label="Bajar"' + (index === total - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
    '</div>';
  } else {
    side = '<label class="row-switch">' +
      '<span class="switch">' +
        '<input type="checkbox" data-action="toggle"' + (product.available ? ' checked' : '') +
          ' aria-label="Disponible: ' + escapeHtml(name) + '" /><span></span>' +
      '</span>' +
      (product.available ? 'Disponible' : 'Agotado') +
    '</label>';
  }

  return '<li class="row row-product' + (product.available ? '' : ' is-out') + '" data-id="' + escapeHtml(product.id) + '">' +
    photoHtml(getProductImages(product)[0], 'row-thumb') +
    '<div class="row-info">' +
      '<p class="row-name">' + escapeHtml(name) + '</p>' +
      '<p class="row-meta">' + productMeta(product) + '</p>' +
    '</div>' +
    side +
  '</li>';
}

function renderProducts() {
  var visible = reorderDraft || products;
  var query = normalizeText(adminQuery);

  if (!reorderDraft && query) {
    visible = products.filter(function (p) {
      return normalizeText(p.name + ' ' + getProductCategories(p).join(' ')).indexOf(query) !== -1;
    });
  }

  if (reorderDraft) {
    listCount.textContent = '';
  } else if (query) {
    listCount.textContent = visible.length + ' de ' + products.length + ' productos';
  } else {
    var out = products.filter(function (p) { return !p.available; }).length;
    listCount.textContent = products.length + (products.length === 1 ? ' producto' : ' productos') +
      (out > 0 ? ' · ' + out + (out === 1 ? ' agotado' : ' agotados') : '');
  }

  productList.classList.toggle('is-reordering', !!reorderDraft);

  if (visible.length === 0) {
    productList.innerHTML = '<li class="rows-empty">' +
      (query ? 'Ningún producto coincide con la búsqueda.' : 'Todavía no hay productos. Tocá “Agregar” para crear el primero.') +
    '</li>';
    return;
  }

  productList.innerHTML = visible.map(function (product, i) {
    return productRowHtml(product, i, visible.length);
  }).join('');
}

async function toggleAvailable(id, available) {
  var product = findProduct(id);
  if (!product) return;
  product.available = available;
  renderProducts();

  try {
    await saveCatalog((available ? 'Marcar disponible: ' : 'Marcar agotado: ') + cleanName(product.name));
  } catch (err) {
    reportError(err);
  }
}

// ===== REORDER =====
function setReordering(active) {
  reorderDraft = active ? products.slice() : null;
  listTools.hidden = active;
  reorderBar.hidden = !active;
}

function moveProduct(id, where) {
  var from = reorderDraft.findIndex(function (p) { return p.id === id; });
  if (from === -1) return;
  var to = where === 'top' ? 0 : where === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= reorderDraft.length) return;

  reorderDraft.splice(to, 0, reorderDraft.splice(from, 1)[0]);
  renderProducts();
}

async function saveOrder() {
  products = reorderDraft;
  setReordering(false);
  renderProducts();

  try {
    await saveCatalog('Reordenar productos');
    showToast('Orden guardado', 'success');
  } catch (err) {
    reportError(err);
  }
}

// ===== CATEGORIES =====
// Includes categories that only live on products (e.g. one deleted from the list but still in use)
function allCategories() {
  var list = settings.categories.slice();
  products.forEach(function (p) {
    getProductCategories(p).forEach(function (cat) {
      if (cat && list.indexOf(cat) === -1) list.push(cat);
    });
  });
  return list;
}

function findCategory(name) {
  var wanted = normalizeText(name);
  return allCategories().find(function (cat) { return normalizeText(cat) === wanted; });
}

function categoryCount(name) {
  return products.filter(function (p) { return getProductCategories(p).indexOf(name) !== -1; }).length;
}

// Renames `from` to `to` everywhere, or removes it when `to` is null
function replaceCategory(from, to) {
  function swap(list) {
    return unique(list.map(function (cat) { return cat === from ? to : cat; }).filter(Boolean));
  }
  settings.categories = swap(allCategories());
  products.forEach(function (p) {
    var cats = getProductCategories(p);
    if (cats.indexOf(from) === -1) return;
    p.categories = swap(cats);
    delete p.category;   // single-value field of very old products
  });
}

function renderCategories() {
  var cats = allCategories();
  if (cats.length === 0) {
    categoryList.innerHTML = '<li class="rows-empty">Todavía no hay categorías.</li>';
    return;
  }

  categoryList.innerHTML = cats.map(function (cat) {
    var count = categoryCount(cat);
    return '<li class="row" data-category="' + escapeHtml(cat) + '">' +
      '<div class="row-info">' +
        '<p class="row-name">' + escapeHtml(cat) + '</p>' +
        '<p class="row-meta">' + (count === 0 ? 'Sin productos' : count + (count === 1 ? ' producto' : ' productos')) + '</p>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button class="icon-btn" type="button" data-action="rename" aria-label="Cambiar el nombre de ' + escapeHtml(cat) + '">' + icon('pencil') + '</button>' +
        '<button class="icon-btn" type="button" data-action="delete" aria-label="Eliminar ' + escapeHtml(cat) + '">' + icon('trash') + '</button>' +
      '</div>' +
    '</li>';
  }).join('');
}

async function saveCategories(message, toast) {
  renderCategories();
  try {
    await saveCatalog(message);
    showToast(toast, 'success');
  } catch (err) {
    reportError(err);
  }
}

async function addCategory(e) {
  e.preventDefault();
  var name = cleanName(categoryInput.value);
  if (!name) return;
  if (findCategory(name)) {
    showToast('Esa categoría ya existe.', 'error');
    return;
  }

  settings.categories = allCategories().concat(name);
  categoryInput.value = '';
  await saveCategories('Agregar categoría: ' + name, 'Categoría agregada');
}

async function renameCategory(oldName) {
  var typed = await askDialog({
    title: 'Cambiar nombre',
    text: 'Los productos de esta categoría se actualizan solos.',
    input: oldName,
    okLabel: 'Guardar'
  });
  var newName = cleanName(typed || '');
  if (!newName || newName === oldName) return;

  // Same name as another category: offer to merge the two
  var existing = allCategories().find(function (cat) {
    return cat !== oldName && normalizeText(cat) === normalizeText(newName);
  });
  if (existing) {
    var merge = await askDialog({
      title: 'Ya existe “' + existing + '”',
      text: '¿Querés unir las dos? Los productos de “' + oldName + '” pasan a “' + existing + '”.',
      okLabel: 'Unir'
    });
    if (!merge) return;
    newName = existing;
  }

  replaceCategory(oldName, newName);
  renderProducts();
  await saveCategories('Renombrar categoría: ' + oldName + ' → ' + newName,
    existing ? 'Categorías unidas' : 'Categoría actualizada');
}

async function deleteCategory(name) {
  var count = categoryCount(name);
  var ok = await askDialog({
    title: 'Eliminar “' + name + '”',
    text: count === 0
      ? 'Ningún producto la usa.'
      : 'Se quita de ' + count + (count === 1 ? ' producto' : ' productos') + '. Los productos no se borran.',
    okLabel: 'Eliminar',
    danger: true
  });
  if (!ok) return;

  replaceCategory(name, null);
  renderProducts();
  await saveCategories('Eliminar categoría: ' + name, 'Categoría eliminada');
}

// ===== SETTINGS =====
function optionRowHtml(label, asksAddress) {
  var isDelivery = asksAddress !== undefined;
  return '<div class="option-row' + (isDelivery ? ' option-row-delivery' : '') + '">' +
    '<input type="text" value="' + escapeHtml(label) + '" maxlength="40" aria-label="' + (isDelivery ? 'Forma de entrega' : 'Forma de pago') + '" />' +
    (isDelivery
      ? '<label class="option-check"><input type="checkbox"' + (asksAddress ? ' checked' : '') + ' /> Pide dirección</label>'
      : '') +
    '<button class="icon-btn" type="button" data-action="remove-option" aria-label="Quitar">' + icon('close') + '</button>' +
  '</div>';
}

function renderSettings() {
  setWhatsapp.value = String(settings.wa_number || '').replace(/^506/, '');
  setBanner.value = getSetting(settings, 'banner_text');
  setNotice.value = getSetting(settings, 'payment_notice');

  setPayments.innerHTML = getSetting(settings, 'payment_methods').map(function (label) {
    return optionRowHtml(label);
  }).join('');
  setDeliveries.innerHTML = getDeliveryOptions(settings).map(function (option) {
    return optionRowHtml(option.label, option.address);
  }).join('');

  setError.hidden = true;
}

function addOptionRow(list, html) {
  list.insertAdjacentHTML('beforeend', html);
  list.lastElementChild.querySelector('input').focus();
}

async function saveSettings(e) {
  e.preventDefault();
  setError.hidden = true;

  function fail(message) {
    setError.textContent = message;
    setError.hidden = false;
    setError.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Accepts the number typed with or without the country code
  var digits = setWhatsapp.value.replace(/\D/g, '');
  if (digits.length > 8 && digits.indexOf('506') === 0) digits = digits.slice(3);
  if (digits.length !== 8) return fail('El número de WhatsApp debe tener 8 dígitos.');

  var payments = [];
  setPayments.querySelectorAll('.option-row').forEach(function (row) {
    var label = cleanName(row.querySelector('input').value);
    if (label && payments.indexOf(label) === -1) payments.push(label);
  });
  if (payments.length === 0) return fail('Agregá al menos una forma de pago.');

  var deliveries = [];
  setDeliveries.querySelectorAll('.option-row').forEach(function (row) {
    var label = cleanName(row.querySelector('input[type="text"]').value);
    var exists = deliveries.some(function (option) { return option.label === label; });
    if (label && !exists) {
      deliveries.push({ label: label, address: row.querySelector('input[type="checkbox"]').checked });
    }
  });
  if (deliveries.length === 0) return fail('Agregá al menos una forma de entrega.');

  settings = Object.assign({}, settings, {
    wa_number: '506' + digits,
    banner_text: setBanner.value.trim(),
    payment_methods: payments,
    delivery_options: deliveries,
    payment_notice: setNotice.value.trim()
  });

  setSave.disabled = true;
  setSave.textContent = 'Guardando…';
  try {
    await saveCatalog('Actualizar ajustes de la tienda');
    renderSettings();
    showToast('Ajustes guardados', 'success');
  } catch (err) {
    if (err.status === 401) reportError(err);
    else fail(err.message);
  }
  setSave.disabled = false;
  setSave.textContent = 'Guardar ajustes';
}

// ===== PRODUCT FORM =====
function clearFormError() {
  pfError.hidden = true;
  productForm.querySelectorAll('.field.invalid').forEach(function (field) {
    field.classList.remove('invalid');
  });
}

// Shows the message under the field that needs attention (or at the end of the form)
function failForm(target, message) {
  var field = target ? target.closest('.field') : null;
  if (field) {
    field.classList.add('invalid');
    field.appendChild(pfError);
    if (target.matches('input, textarea')) target.focus({ preventScroll: true });
  } else {
    productForm.insertBefore(pfError, pfExtra);
  }
  pfError.textContent = message;
  pfError.hidden = false;
  pfError.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function setFormBusy(busy, label) {
  formBusy = busy;
  pfSave.disabled = busy;
  pfSave.textContent = busy ? label : 'Guardar';
  pfCancel.disabled = busy;
  pfClose.disabled = busy;
}

function syncAvailableHint() {
  pfAvailableHint.textContent = pfAvailable.checked
    ? 'Los clientes pueden pedirlo.'
    : 'Se muestra como “Agotado” y no se puede pedir.';
}

function renderFormCategories(selected) {
  var cats = unique(allCategories().concat(formNewCats));
  pfCategories.innerHTML = cats.map(function (cat) {
    return '<label class="pill">' +
      '<input type="checkbox" value="' + escapeHtml(cat) + '"' + (selected.indexOf(cat) !== -1 ? ' checked' : '') + ' />' +
      '<span>' + escapeHtml(cat) + '</span>' +
    '</label>';
  }).join('');
}

function selectedFormCategories() {
  var selected = [];
  pfCategories.querySelectorAll('input:checked').forEach(function (input) { selected.push(input.value); });
  return selected;
}

function addFormCategory() {
  var name = cleanName(pfNewCategory.value);
  if (!name) return;

  var existing = unique(allCategories().concat(formNewCats)).find(function (cat) {
    return normalizeText(cat) === normalizeText(name);
  });
  if (!existing) formNewCats.push(name);

  renderFormCategories(selectedFormCategories().concat(existing || name));
  pfNewCategory.value = '';
  formDirty = true;
}

// ----- Photos -----
function findFormPhoto(key) {
  return formPhotos.find(function (photo) { return photo.key === key; });
}

function formPhotoHtml(photo) {
  if (photo.src) return '<img src="' + escapeHtml(photo.src) + '" alt="" />';
  return photoHtml(photo.name, '');
}

function renderPhotos() {
  pfPhotos.innerHTML = formPhotos.map(function (photo, i) {
    return '<button class="photo" type="button" data-key="' + photo.key + '"' +
      ' aria-pressed="' + (photo.key === selectedPhoto) + '" aria-label="Foto ' + (i + 1) + '">' +
      formPhotoHtml(photo) +
      (i === 0 ? '<span class="photo-tag">Principal</span>' : '') +
    '</button>';
  }).join('') +
  '<button class="photo-add" type="button" data-action="add-photo">' + icon('camera') + 'Agregar</button>';

  var index = formPhotos.findIndex(function (photo) { return photo.key === selectedPhoto; });
  pfPhotoActions.hidden = index === -1;
  if (index !== -1) {
    pfPhotoActions.querySelector('[data-photo="main"]').disabled = index === 0;
    pfPhotoActions.querySelector('[data-photo="left"]').disabled = index === 0;
    pfPhotoActions.querySelector('[data-photo="right"]').disabled = index === formPhotos.length - 1;
  }
}

function removeFormPhoto(key) {
  formPhotos = formPhotos.filter(function (photo) { return photo.key !== key; });
  formVariants.forEach(function (variant) {
    if (variant.photoKey === key) variant.photoKey = null;
  });
  if (selectedPhoto === key) selectedPhoto = null;
  renderPhotos();
  renderVariants();
}

function addPhotoFiles(files) {
  Array.prototype.forEach.call(files, function (file) {
    if (formPhotos.length >= MAX_PHOTOS) {
      showToast('Un producto puede tener hasta ' + MAX_PHOTOS + ' fotos.', 'error');
      return;
    }
    if (file.type.indexOf('image/') !== 0) {
      showToast('“' + file.name + '” no es una imagen.', 'error');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      showToast('“' + file.name + '” es demasiado grande.', 'error');
      return;
    }

    var photo = {
      key: generateId(),
      name: null,                        // assigned when it is uploaded
      src: URL.createObjectURL(file),
      isNew: true,
      ready: prepareImage(file),         // shrinks it in the background while the form is filled in
      shas: null
    };
    photo.ready.catch(function () {
      removeFormPhoto(photo.key);
      showToast('No se pudo leer “' + file.name + '”. Probá con otra foto.', 'error');
    });
    formPhotos.push(photo);
  });

  formDirty = true;
  renderPhotos();
  renderVariants();
}

function handlePhotoAction(action) {
  var index = formPhotos.findIndex(function (photo) { return photo.key === selectedPhoto; });
  if (index === -1) return;

  if (action === 'remove') {
    removeFormPhoto(selectedPhoto);
  } else {
    var to = action === 'main' ? 0 : action === 'left' ? index - 1 : index + 1;
    if (to < 0 || to >= formPhotos.length) return;
    formPhotos.splice(to, 0, formPhotos.splice(index, 1)[0]);
    renderPhotos();
  }
  formDirty = true;
}

// ----- Options (variants) -----
function findFormVariant(key) {
  return formVariants.find(function (variant) { return variant.key === key; });
}

function variantPickerHtml(variant) {
  if (formPhotos.length === 0) {
    return '<div class="variant-picker">Primero agregá las fotos del producto.</div>';
  }
  return '<div class="variant-picker" data-key="' + variant.key + '">' +
    '<button class="picker-none" type="button" data-pick="" aria-pressed="' + !variant.photoKey + '">Sin foto</button>' +
    formPhotos.map(function (photo, i) {
      return '<button type="button" data-pick="' + photo.key + '" aria-pressed="' + (photo.key === variant.photoKey) + '"' +
        ' aria-label="Usar la foto ' + (i + 1) + '">' + formPhotoHtml(photo) + '</button>';
    }).join('') +
  '</div>';
}

function renderVariants() {
  pfVariants.innerHTML = formVariants.map(function (variant) {
    var photo = variant.photoKey ? findFormPhoto(variant.photoKey) : null;
    var picking = pickingFor === variant.key;

    return '<div class="variant-row" data-key="' + variant.key + '">' +
      '<button class="variant-photo" type="button" data-action="pick" aria-expanded="' + picking + '"' +
        ' aria-label="Elegir la foto de esta opción">' + (photo ? formPhotoHtml(photo) : icon('camera')) + '</button>' +
      '<input class="variant-name" type="text" value="' + escapeHtml(variant.name) + '" maxlength="60"' +
        ' placeholder="Ej: Rosa clásico" aria-label="Nombre de la opción" />' +
      '<span class="switch" title="Disponible">' +
        '<input type="checkbox"' + (variant.available ? ' checked' : '') + ' aria-label="Opción disponible" /><span></span>' +
      '</span>' +
      '<button class="icon-btn" type="button" data-action="remove" aria-label="Quitar opción">' + icon('close') + '</button>' +
    '</div>' +
    (picking ? variantPickerHtml(variant) : '');
  }).join('');
}

function addFormVariant() {
  var variant = { key: generateId(), name: '', available: true, photoKey: null };
  formVariants.push(variant);
  formDirty = true;
  renderVariants();
  pfVariants.querySelector('.variant-row[data-key="' + variant.key + '"] .variant-name').focus();
}

// ----- Open / close -----
// `template` prefills a new product (used by "Duplicar")
function openProductForm(id, template) {
  var product = id ? findProduct(id) : null;
  var source = product || template || {};

  editingId     = product ? product.id : null;
  formProductId = product ? product.id : generateId();
  formNewCats   = [];
  selectedPhoto = null;
  pickingFor    = null;
  formDirty     = !!template;

  pfTitle.textContent = product ? 'Editar producto' : 'Agregar producto';
  pfName.value  = source.name ? cleanName(source.name) : '';
  pfPrice.value = source.price !== undefined ? String(source.price) : '';
  pfDesc.value  = source.description || '';
  pfAvailable.checked = source.available !== false;
  pfNewCategory.value = '';
  pfExtra.hidden = !product;

  // Photos belong to one product's files, so a duplicate starts without them
  formPhotos = (product ? getProductImages(product) : []).map(function (name) {
    return { key: generateId(), name: name, src: null, isNew: false, ready: null, shas: null };
  });
  formVariants = (source.variants || []).map(function (v) {
    var linked = formPhotos.find(function (photo) { return photo.name === v.image; });
    return { key: generateId(), name: v.name, available: v.available !== false, photoKey: linked ? linked.key : null };
  });

  renderFormCategories(getProductCategories(source));
  renderPhotos();
  renderVariants();
  syncAvailableHint();
  clearFormError();
  setFormBusy(false);

  openSheet(productSheet);
  productForm.scrollTop = 0;
}

function closeProductForm() {
  closeSheet(productSheet);
  editingId = null;
  formPhotos = [];
  formVariants = [];
  formDirty = false;
  formBusy = false;
}

async function requestCloseForm() {
  if (formBusy) return;
  if (formDirty) {
    var discard = await askDialog({
      title: '¿Descartar los cambios?',
      text: 'Lo que cambiaste en este producto no se va a guardar.',
      okLabel: 'Descartar',
      danger: true
    });
    if (!discard) return;
  }
  closeProductForm();
}

// ----- Save -----
async function saveProduct(e) {
  e.preventDefault();
  if (formBusy) return;
  clearFormError();

  var name  = cleanName(pfName.value);
  var price = Number(pfPrice.value.replace(/\D/g, ''));
  if (!name) return failForm(pfName, 'Escribí el nombre del producto.');
  if (!/\d/.test(pfPrice.value)) return failForm(pfPrice, 'Escribí el precio, solo con números.');

  var optionNames = formVariants.map(function (v) { return normalizeText(cleanName(v.name)); }).filter(Boolean);
  if (unique(optionNames).length !== optionNames.length) {
    return failForm(pfVariants, 'Hay dos opciones con el mismo nombre.');
  }

  setFormBusy(true, 'Guardando…');
  var old = editingId ? findProduct(editingId) : null;

  try {
    // 1. Upload the new photos. Nothing is visible in the catalog until step 3:
    //    if something fails here, the next attempt reuses what was already uploaded.
    var newPhotos = formPhotos.filter(function (photo) { return photo.isNew; });
    var add = [];
    for (var i = 0; i < newPhotos.length; i++) {
      var photo = newPhotos[i];
      if (!photo.shas) {
        pfSave.textContent = 'Subiendo foto ' + (i + 1) + ' de ' + newPhotos.length + '…';
        var prepared = await photo.ready;
        photo.name = formProductId + '_' + generateId() + '.' + prepared.ext;
        photo.shas = {
          main: await apiUploadImage(prepared.main),
          thumb: await apiUploadImage(prepared.thumb)
        };
      }
      add.push({ path: IMAGE_DIR + photo.name, sha: photo.shas.main });
      add.push({ path: THUMB_DIR + photo.name, sha: photo.shas.thumb });
      sessionImages[photo.name] = photo.src;
    }
    pfSave.textContent = 'Guardando…';

    // 2. Build the product, keeping any field this form does not know about
    var images = formPhotos.map(function (p) { return p.name; });
    var variants = formVariants
      .filter(function (v) { return cleanName(v.name); })
      .map(function (v) {
        var variant = { name: cleanName(v.name), available: v.available };
        var linked = v.photoKey ? findFormPhoto(v.photoKey) : null;
        if (linked) variant.image = linked.name;
        return variant;
      });

    var product = Object.assign({}, old || {}, {
      id: formProductId,
      name: name,
      categories: selectedFormCategories(),
      price: price,
      description: pfDesc.value.trim(),
      available: pfAvailable.checked,
      images: images,
      created_at: (old && old.created_at) || new Date().toISOString()
    });
    delete product.category;   // single-value fields of very old products
    delete product.image;
    if (variants.length > 0) product.variants = variants;
    else delete product.variants;

    var remove = [];
    (old ? getProductImages(old) : []).forEach(function (image) {
      if (images.indexOf(image) === -1) remove.push(IMAGE_DIR + image, THUMB_DIR + image);
    });

    // 3. One save: the product, its new photos and the removed ones in a single commit
    settings.categories = unique(allCategories().concat(formNewCats));
    if (old) products[products.indexOf(old)] = product;
    else products.unshift(product);

    await saveCatalog((old ? 'Editar producto: ' : 'Agregar producto: ') + name, { add: add, remove: remove });

    closeProductForm();
    renderProducts();
    renderCategories();
    showToast(old ? 'Producto actualizado' : 'Producto agregado', 'success');
  } catch (err) {
    setFormBusy(false);
    if (err.status === 401) reportError(err);
    else failForm(null, err.message);
  }
}

async function deleteProduct() {
  var product = findProduct(editingId);
  if (!product || formBusy) return;

  var name = cleanName(product.name);
  var ok = await askDialog({
    title: 'Eliminar producto',
    text: '“' + name + '” se borra del catálogo junto con sus fotos.',
    okLabel: 'Eliminar',
    danger: true
  });
  if (!ok) return;

  var remove = [];
  getProductImages(product).forEach(function (image) {
    remove.push(IMAGE_DIR + image, THUMB_DIR + image);
  });

  products = products.filter(function (p) { return p !== product; });
  closeProductForm();
  renderProducts();
  renderCategories();

  try {
    await saveCatalog('Eliminar producto: ' + name, { remove: remove });
    showToast('Producto eliminado', 'success');
  } catch (err) {
    reportError(err);
  }
}

async function duplicateProduct() {
  var product = findProduct(editingId);
  if (!product || formBusy) return;

  if (formDirty) {
    var discard = await askDialog({
      title: '¿Duplicar sin guardar?',
      text: 'Los cambios que hiciste en este producto no se van a guardar.',
      okLabel: 'Duplicar',
      danger: true
    });
    if (!discard) return;
  }

  var copy = Object.assign({}, product, { name: cleanName(product.name) + ' (copia)' });
  closeProductForm();
  openProductForm(null, copy);
  showToast('Copia lista: agregale fotos y guardá.');
}

// ===== EVENT LISTENERS =====

// Login
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

loginReveal.addEventListener('click', function () {
  var show = loginPassword.type === 'password';
  loginPassword.type = show ? 'text' : 'password';
  loginReveal.setAttribute('aria-pressed', show ? 'true' : 'false');
});

// Tabs
document.querySelector('.tabs').addEventListener('click', function (e) {
  var tab = e.target.closest('.tab');
  if (tab) showTab(tab.dataset.tab);
});

// Product list
adminSearch.addEventListener('input', function () {
  adminQuery = adminSearch.value.trim();
  renderProducts();
});

addProductBtn.addEventListener('click', function () { openProductForm(); });
reorderBtn.addEventListener('click', function () {
  adminQuery = '';
  adminSearch.value = '';
  setReordering(true);
  renderProducts();
});
reorderCancel.addEventListener('click', function () {
  setReordering(false);
  renderProducts();
});
reorderSave.addEventListener('click', saveOrder);

productList.addEventListener('click', function (e) {
  var row = e.target.closest('.row-product');
  if (!row) return;

  var move = e.target.closest('[data-move]');
  if (move) { moveProduct(row.dataset.id, move.dataset.move); return; }

  // The switch has its own `change` handler; any other tap opens the product
  if (reorderDraft || e.target.closest('.row-switch')) return;
  openProductForm(row.dataset.id);
});

productList.addEventListener('change', function (e) {
  if (e.target.dataset.action !== 'toggle') return;
  toggleAvailable(e.target.closest('.row-product').dataset.id, e.target.checked);
});

// Categories
categoryForm.addEventListener('submit', addCategory);

categoryList.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var name = btn.closest('.row').dataset.category;
  if (btn.dataset.action === 'rename') renameCategory(name);
  else deleteCategory(name);
});

// Settings
settingsForm.addEventListener('submit', saveSettings);
setAddPayment.addEventListener('click', function () { addOptionRow(setPayments, optionRowHtml('')); });
setAddDelivery.addEventListener('click', function () { addOptionRow(setDeliveries, optionRowHtml('', false)); });

settingsForm.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-action="remove-option"]');
  if (btn) btn.closest('.option-row').remove();
});

// Product form
productForm.addEventListener('submit', saveProduct);
productForm.addEventListener('input', function () { formDirty = true; });
productForm.addEventListener('change', function () { formDirty = true; });

pfClose.addEventListener('click', requestCloseForm);
pfCancel.addEventListener('click', requestCloseForm);
pfDelete.addEventListener('click', deleteProduct);
pfDuplicate.addEventListener('click', duplicateProduct);
pfAvailable.addEventListener('change', syncAvailableHint);

pfAddCategory.addEventListener('click', addFormCategory);
pfNewCategory.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();   // Enter adds the category instead of submitting the whole form
  addFormCategory();
});

pfPhotos.addEventListener('click', function (e) {
  if (e.target.closest('[data-action="add-photo"]')) { pfFile.click(); return; }
  var photo = e.target.closest('.photo');
  if (!photo) return;
  selectedPhoto = selectedPhoto === photo.dataset.key ? null : photo.dataset.key;
  renderPhotos();
});

pfFile.addEventListener('change', function () {
  addPhotoFiles(pfFile.files);
  pfFile.value = '';   // lets the same file be picked again
});

pfPhotoActions.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-photo]');
  if (btn) handlePhotoAction(btn.dataset.photo);
});

pfAddVariant.addEventListener('click', addFormVariant);

pfVariants.addEventListener('click', function (e) {
  var pick = e.target.closest('[data-pick]');
  if (pick) {
    findFormVariant(pick.closest('.variant-picker').dataset.key).photoKey = pick.dataset.pick || null;
    pickingFor = null;
    formDirty = true;
    renderVariants();
    return;
  }

  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var key = btn.closest('.variant-row').dataset.key;

  if (btn.dataset.action === 'pick') {
    pickingFor = pickingFor === key ? null : key;
  } else {
    formVariants = formVariants.filter(function (variant) { return variant.key !== key; });
    formDirty = true;
  }
  renderVariants();
});

// Typing keeps the state in step, so re-rendering the rows never loses text
pfVariants.addEventListener('input', function (e) {
  var row = e.target.closest('.variant-row');
  if (!row) return;
  var variant = findFormVariant(row.dataset.key);
  if (e.target.type === 'checkbox') variant.available = e.target.checked;
  else variant.name = e.target.value;
});

// Dialog
dlgOk.addEventListener('click', function () { closeDialog(true); });
dlgCancel.addEventListener('click', function () { closeDialog(false); });
dlgInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') closeDialog(true);
});

// Tapping outside or pressing Escape closes whatever is on top
function dismissTop() {
  if (openSheets.indexOf(dialogSheet) !== -1) closeDialog(false);
  else if (openSheets.indexOf(productSheet) !== -1) requestCloseForm();
}

overlay.addEventListener('click', dismissTop);
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') dismissTop();
});

// ===== INIT =====
localStorage.removeItem('dazu_gh_token');   // GitHub token left in the browser by the previous version of this panel

if (apiHasSession()) {
  showPanel().catch(function (err) {
    if (err.status === 401) showLogin('Tu sesión venció. Ingresá de nuevo.');
    else showLogin(err.message);
  });
} else {
  showLogin();
}
