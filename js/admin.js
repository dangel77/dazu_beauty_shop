/* =====================================================================
   admin.js  –  Dazu Beauty Shop
   Admin panel using GitHub API for product CRUD.
   Products stored in data/products.json, images in data/images/
   ===================================================================== */

'use strict';

// ===== GITHUB CONFIG (stored in admin's localStorage) =====
var GH_OWNER = 'dangel77';
var GH_REPO  = 'dazu_beauty_shop';
var GH_TOKEN_KEY = 'dazu_gh_token';

function getGhToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || '';
}

function saveGhToken(token) {
  localStorage.setItem(GH_TOKEN_KEY, token);
}

// ===== STATE =====
var products = [];
var settings = { wa_number: '', categories: [] };
var jsonSha = '';            // SHA of products.json (needed for GitHub API updates)
var editingId = null;
var pendingDeleteId = null;
var pendingImages = [];      // [{file, src, name, isNew}] — images pending in the form
var editingCategory = null;  // original name of the category being edited
var _savedScrollY = 0;       // scroll position saved when a modal is opened (iOS fix)
var reorderMode = false;     // whether reorder mode is active
var originalOrder = [];      // copy of products array before reorder, to allow cancel
var _dragSrcCard = null;     // currently dragged card element

var DEFAULT_CATEGORIES = [
  'Shampoo', 'Crema', 'Jabon', 'Acondicionador', 'Aceite',
  'Mascarilla', 'Perfume', 'Maquillaje', 'Cuidado facial', 'Cuidado corporal'
];

// ===== SCROLL LOCK (iOS Safari compatible) =====
function _preventBgScroll(e) {
  // Allow scrolling inside modal body, block everything else
  // Also allow when touch target is a form input (lets browser scroll input into view on keyboard open)
  var target = e.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    return;
  }
  var modalBody = target ? target.closest('.admin-modal-body') : null;
  if (!modalBody) {
    e.preventDefault();
    return;
  }
  // If modal body is at scroll boundary, prevent overscroll from leaking
  var atTop = modalBody.scrollTop <= 0;
  var atBottom = modalBody.scrollTop + modalBody.clientHeight >= modalBody.scrollHeight - 1;
  if (e.touches && e.touches[0]) {
    var dy = e.touches[0].clientY - (modalBody._lastTouchY || e.touches[0].clientY);
    if ((atTop && dy > 0) || (atBottom && dy < 0)) {
      e.preventDefault();
    }
  }
}

function _trackTouchStart(e) {
  var modalBody = e.target.closest('.admin-modal-body');
  if (modalBody && e.touches && e.touches[0]) {
    modalBody._lastTouchY = e.touches[0].clientY;
  }
}

function lockBodyScroll() {
  _savedScrollY = window.scrollY;
  document.body.style.top = '-' + _savedScrollY + 'px';
  document.body.classList.add('modal-open');
  document.addEventListener('touchstart', _trackTouchStart, { passive: true });
  document.addEventListener('touchmove', _preventBgScroll, { passive: false });
}

function unlockBodyScroll() {
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, _savedScrollY);
  document.removeEventListener('touchstart', _trackTouchStart);
  document.removeEventListener('touchmove', _preventBgScroll);
}

// Force modal body max-height via JS so footer is always visible
function fixModalBodyHeight(modalEl) {
  if (window.innerWidth > 600) return; // only on mobile
  var header = modalEl.querySelector('.admin-modal-header');
  var footer = modalEl.querySelector('.admin-modal-footer');
  var body   = modalEl.querySelector('.admin-modal-body');
  if (!header || !footer || !body) return;

  // Capture innerHeight once at modal-open time (keyboard is not yet open at this point).
  // Using innerHeight rather than screen.height or visualViewport.height ensures we get
  // the real available viewport (accounting for browser chrome/nav bars) while remaining
  // stable – the keyboard has not appeared yet so it has not shrunk the viewport.
  var vh = window.innerHeight;
  var modalMaxH = vh * 0.90;
  var headerH = header.offsetHeight;
  var footerH = footer.offsetHeight;
  var bodyMaxH = modalMaxH - headerH - footerH;
  if (bodyMaxH > 60) {
    body.style.maxHeight = Math.floor(bodyMaxH) + 'px';
  }
  // Do NOT attach a visualViewport resize listener – the keyboard should overlay
  // the modal without resizing it, avoiding the visual jump when typing.
}

function clearModalBodyHeight(modalEl) {
  var body = modalEl.querySelector('.admin-modal-body');
  if (body) body.style.maxHeight = '';
}

// ===== DOM REFS =====
var setupScreen       = document.getElementById('setupScreen');
var adminPanel        = document.getElementById('adminPanel');
var setupToken        = document.getElementById('setupToken');
var setupBtn          = document.getElementById('setupBtn');
var setupError        = document.getElementById('setupError');
var adminProductGrid  = document.getElementById('adminProductGrid');
var btnAddProduct     = document.getElementById('btnAddProduct');
var btnLogout         = document.getElementById('btnLogout');

// Product form modal
var productFormModal  = document.getElementById('productFormModal');
var productFormTitle  = document.getElementById('productFormTitle');
var productFormClose  = document.getElementById('productFormClose');
var productFormCancel = document.getElementById('productFormCancel');
var productFormSave   = document.getElementById('productFormSave');
var imgFileInput      = document.getElementById('imgFileInput');
var imgPlaceholder    = document.getElementById('imgPlaceholder');
var imgPreviewGrid    = document.getElementById('imgPreviewGrid');
var productName               = document.getElementById('productName');
var productCategoriesSelect   = document.getElementById('productCategoriesSelect');
var productPrice              = document.getElementById('productPrice');
var productDesc       = document.getElementById('productDesc');
var productAvailable  = document.getElementById('productAvailable');
var availableLabel    = document.getElementById('availableLabel');

// Delete modal
var deleteModal       = document.getElementById('deleteModal');
var deleteModalClose  = document.getElementById('deleteModalClose');
var deleteProductName = document.getElementById('deleteProductName');
var deleteCancelBtn   = document.getElementById('deleteCancelBtn');
var deleteConfirmBtn  = document.getElementById('deleteConfirmBtn');

// Settings
var waNumberInput     = document.getElementById('waNumberInput');
var btnSaveWaNumber   = document.getElementById('btnSaveWaNumber');

// Categories
var categoriesList    = document.getElementById('categoriesList');
var newCategoryInput  = document.getElementById('newCategoryInput');
var btnAddCategory    = document.getElementById('btnAddCategory');
var editCategoryModal = document.getElementById('editCategoryModal');
var editCatModalClose = document.getElementById('editCatModalClose');
var editCategoryInput = document.getElementById('editCategoryInput');
var editCatCancelBtn  = document.getElementById('editCatCancelBtn');
var editCatConfirmBtn = document.getElementById('editCatConfirmBtn');

// Variants
var variantsListAdmin  = document.getElementById('variantsListAdmin');
var btnAddVariant      = document.getElementById('btnAddVariant');
var variantsEmptyHint  = document.getElementById('variantsEmptyHint');

// Reorder
var btnReorderProducts = document.getElementById('btnReorderProducts');
var reorderActions     = document.getElementById('reorderActions');
var btnSaveOrder       = document.getElementById('btnSaveOrder');
var btnCancelOrder     = document.getElementById('btnCancelOrder');

// ===== HELPERS =====
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

function renderCategoryCheckboxes(selectedCats) {
  if (!productCategoriesSelect) return;
  productCategoriesSelect.innerHTML = '';
  var cats = settings.categories || [];
  if (cats.length === 0) {
    productCategoriesSelect.innerHTML = '<p style="font-size:0.82rem;color:var(--text-light);">No hay categorías. Agrega categorías en Configuración.</p>';
    return;
  }
  cats.forEach(function (cat) {
    var checked = selectedCats && selectedCats.indexOf(cat) !== -1;
    var label = document.createElement('label');
    label.className = 'cat-checkbox-label';
    label.innerHTML =
      '<input type="checkbox" value="' + escapeAttr(cat) + '"' + (checked ? ' checked' : '') + ' />' +
      '<span>' + escapeHtml(cat) + '</span>';
    productCategoriesSelect.appendChild(label);
  });
}

function getSelectedCategories() {
  if (!productCategoriesSelect) return [];
  var boxes = productCategoriesSelect.querySelectorAll('input[type="checkbox"]:checked');
  var result = [];
  boxes.forEach(function (b) { result.push(b.value); });
  return result;
}

// ===== VARIANTS FORM =====
function updateVariantsEmptyHint() {
  var rows = variantsListAdmin.querySelectorAll('.variant-row');
  if (variantsEmptyHint) {
    variantsEmptyHint.style.display = rows.length === 0 ? 'block' : 'none';
  }
}

function addVariantRow(name, available) {
  if (variantsEmptyHint) variantsEmptyHint.style.display = 'none';

  var row = document.createElement('div');
  row.className = 'variant-row';

  var isAvail = (available === undefined) ? true : !!available;

  row.innerHTML =
    '<input type="text" class="variant-row-input" placeholder="Ej: Rosa Clásico" maxlength="60" value="' + escapeAttr(name || '') + '" />' +
    '<label class="variant-row-available">' +
      '<input type="checkbox" ' + (isAvail ? 'checked' : '') + ' />' +
      'Disp.' +
    '</label>' +
    '<button type="button" class="btn-remove-variant" title="Eliminar variante">✕</button>';

  row.querySelector('.btn-remove-variant').addEventListener('click', function () {
    row.remove();
    updateVariantsEmptyHint();
  });

  variantsListAdmin.appendChild(row);
}

function getVariantsFromForm() {
  var rows = variantsListAdmin.querySelectorAll('.variant-row');
  var variants = [];
  rows.forEach(function (row) {
    var nameInput = row.querySelector('.variant-row-input');
    var availCheck = row.querySelector('input[type="checkbox"]');
    var name = nameInput ? nameInput.value.trim() : '';
    if (name) {
      variants.push({ name: name, available: availCheck ? availCheck.checked : true });
    }
  });
  return variants;
}

function clearVariantsForm() {
  variantsListAdmin.querySelectorAll('.variant-row').forEach(function (r) { r.remove(); });
  updateVariantsEmptyHint();
}

function renderVariantsForm(variants) {
  clearVariantsForm();
  if (variants && variants.length > 0) {
    variants.forEach(function (v) {
      addVariantRow(v.name, v.available);
    });
  }
  updateVariantsEmptyHint();
}

// ===== GITHUB API HELPERS =====
function ghApi(path, options) {
  var token = getGhToken();
  if (!token) throw new Error('No configurado');

  var url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + path;
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  var opts = Object.assign({}, options || {}, { headers: headers });
  return fetch(url, opts).then(function (res) {
    if (res.status === 404) return null;
    if (!res.ok) {
      return res.json().then(function (body) {
        throw new Error(body.message || 'GitHub API error ' + res.status);
      });
    }
    return res.status === 204 ? null : res.json();
  });
}

// Load products.json from GitHub API (always fresh, returns latest SHA)
function loadJsonFromGitHub() {
  return ghApi('data/products.json').then(function (data) {
    if (!data) {
      // File doesn't exist yet — should not happen if setup was correct
      jsonSha = '';
      return { settings: { wa_number: '' }, products: [] };
    }
    jsonSha = data.sha;
    var decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return JSON.parse(decoded);
  });
}

// Save products.json to GitHub  (creates a commit)
function saveJsonToGitHub(jsonData) {
  var content = btoa(unescape(encodeURIComponent(JSON.stringify(jsonData, null, 2))));
  var body = {
    message: 'Actualizar productos',
    content: content
  };
  if (jsonSha) body.sha = jsonSha;

  return ghApi('data/products.json', {
    method: 'PUT',
    body: JSON.stringify(body)
  }).then(function (res) {
    if (res && res.content) jsonSha = res.content.sha;
    return res;
  });
}

// Upload image to data/images/{filename}
function uploadImageToGitHub(base64Content, filename) {
  // First check if file already exists to get its SHA
  return ghApi('data/images/' + filename).then(function (existing) {
    var body = {
      message: 'Agregar imagen: ' + filename,
      content: base64Content
    };
    if (existing && existing.sha) body.sha = existing.sha;

    return ghApi('data/images/' + filename, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  });
}

// Delete image from data/images/{filename}
function deleteImageFromGitHub(filename) {
  if (!filename) return Promise.resolve();

  return ghApi('data/images/' + filename).then(function (data) {
    if (!data) return; // File doesn't exist, nothing to delete
    return ghApi('data/images/' + filename, {
      method: 'DELETE',
      body: JSON.stringify({
        message: 'Eliminar imagen: ' + filename,
        sha: data.sha
      })
    });
  });
}

// ===== SETUP / LOGIN =====
function handleSetup() {
  var token = setupToken.value.trim();

  if (!token) {
    setupError.textContent = 'Ingresa el token de acceso.';
    setupError.classList.add('show');
    return;
  }

  setupBtn.disabled = true;
  setupBtn.textContent = 'Verificando...';
  setupError.classList.remove('show');

  saveGhToken(token);

  // Test the connection by trying to read products.json
  loadJsonFromGitHub()
    .then(function () {
      showAdminPanel();
    })
    .catch(function (err) {
      setupError.textContent = 'Token invalido o sin permisos.';
      setupError.classList.add('show');
      localStorage.removeItem(GH_TOKEN_KEY);
    })
    .finally(function () {
      setupBtn.disabled = false;
      setupBtn.textContent = 'Entrar';
    });
}

function showAdminPanel() {
  setupScreen.style.display = 'none';
  adminPanel.style.display  = 'block';
  loadAdminData();
}

function handleLogout() {
  localStorage.removeItem(GH_TOKEN_KEY);
  adminPanel.style.display  = 'none';
  setupScreen.style.display = 'flex';
  setupToken.value = '';
  setupError.classList.remove('show');
}

function checkExistingConfig() {
  var token = getGhToken();
  if (token) {
    // Try to verify the token still works
    loadJsonFromGitHub()
      .then(function (data) {
        products = data.products || [];
        settings = data.settings || { wa_number: '', categories: [] };
        if (!Array.isArray(settings.categories) || settings.categories.length === 0) {
          settings.categories = DEFAULT_CATEGORIES.slice();
        }
        showAdminPanel();
      })
      .catch(function () {
        // Token invalid — show setup screen
        localStorage.removeItem(GH_TOKEN_KEY);
      });
  }
}

// ===== LOAD DATA =====
function loadAdminData() {
  loadJsonFromGitHub()
    .then(function (data) {
      products = data.products || [];
      settings = data.settings || { wa_number: '', categories: [] };
      if (!Array.isArray(settings.categories) || settings.categories.length === 0) {
        settings.categories = DEFAULT_CATEGORIES.slice();
      }
      var displayNum = (settings.wa_number || '').replace(/^506/, '');
      waNumberInput.value = displayNum;
      renderAdminGrid();
      renderCategoriesList();
      updateCategoryDatalist();
    })
    .catch(function (err) {
      showToast('Error cargando datos: ' + err.message, 'error');
    });
}

// ===== CATEGORIES =====

function renderCategoriesList() {
  var cats = settings.categories || [];
  if (cats.length === 0) {
    categoriesList.innerHTML = '<p style="font-size:0.82rem;color:var(--text-light);">No hay categorías aun. Agregá la primera.</p>';
    return;
  }

  categoriesList.innerHTML = '';
  cats.forEach(function (cat) {
    var item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML =
      '<span class="category-item-name" title="' + escapeAttr(cat) + '">' + escapeHtml(cat) + '</span>' +
      '<span class="category-item-btns">' +
        '<button class="btn-cat-edit" data-cat="' + escapeAttr(cat) + '" title="Editar">✏️</button>' +
        '<button class="btn-cat-delete" data-cat="' + escapeAttr(cat) + '" title="Eliminar">🗑</button>' +
      '</span>';
    categoriesList.appendChild(item);
  });
}

function updateCategoryDatalist() {
  // Update the product form checkboxes with current categories
  // (re-render preserving current selection if form is open)
  if (productFormModal && productFormModal.classList.contains('open')) {
    var selected = getSelectedCategories();
    renderCategoryCheckboxes(selected);
  }
}

function addCategory() {
  var name = newCategoryInput.value.trim();
  if (!name) {
    showToast('Escribí el nombre de la categoría.', 'error');
    newCategoryInput.focus();
    return;
  }

  var cats = settings.categories || [];
  var exists = cats.some(function (c) { return c.toLowerCase() === name.toLowerCase(); });
  if (exists) {
    showToast('Esa categoría ya existe.', 'error');
    return;
  }

  cats.push(name);
  settings.categories = cats;
  newCategoryInput.value = '';

  btnAddCategory.disabled = true;
  btnAddCategory.textContent = 'Guardando...';

  saveJsonToGitHub({ settings: settings, products: products })
    .then(function () {
      showToast('Categoría "' + name + '" agregada', 'success');
      renderCategoriesList();
      updateCategoryDatalist();
    })
    .catch(function (err) {
      showToast('Error: ' + err.message, 'error');
      // Revert
      settings.categories = cats.filter(function (c) { return c !== name; });
    })
    .finally(function () {
      btnAddCategory.disabled = false;
      btnAddCategory.textContent = '＋ Agregar';
    });
}

function openEditCategory(catName) {
  editingCategory = catName;
  editCategoryInput.value = catName;
  editCategoryModal.classList.add('open');
  lockBodyScroll();
  fixModalBodyHeight(editCategoryModal.querySelector('.admin-modal'));
  editCategoryInput.focus();
}

function closeEditCategory() {
  editCategoryModal.classList.remove('open');
  clearModalBodyHeight(editCategoryModal.querySelector('.admin-modal'));
  unlockBodyScroll();
  editingCategory = null;
}

function saveEditCategory() {
  var oldName = editingCategory;
  var newName = editCategoryInput.value.trim();

  if (!newName) {
    showToast('El nombre no puede estar vacío.', 'error');
    editCategoryInput.focus();
    return;
  }

  if (newName === oldName) {
    closeEditCategory();
    return;
  }

  var cats = settings.categories || [];
  var exists = cats.some(function (c) { return c !== oldName && c.toLowerCase() === newName.toLowerCase(); });
  if (exists) {
    showToast('Ya existe una categoría con ese nombre.', 'error');
    return;
  }

  // Rename in categories list
  var idx = cats.indexOf(oldName);
  if (idx !== -1) cats[idx] = newName;

  // Update all products with the old category name
  products.forEach(function (p) {
    var cats = getProductCategories(p);
    var idx2 = cats.indexOf(oldName);
    if (idx2 !== -1) {
      cats[idx2] = newName;
      p.categories = cats;
      delete p.category;
    }
  });

  editCatConfirmBtn.disabled = true;
  editCatConfirmBtn.textContent = 'Guardando...';

  saveJsonToGitHub({ settings: settings, products: products })
    .then(function () {
      showToast('Categoría renombrada a "' + newName + '"', 'success');
      closeEditCategory();
      renderCategoriesList();
      updateCategoryDatalist();
      renderAdminGrid();
    })
    .catch(function (err) {
      showToast('Error: ' + err.message, 'error');
      // Revert
      if (idx !== -1) cats[idx] = oldName;
      products.forEach(function (p) {
        var pCats = getProductCategories(p);
        var idx2 = pCats.indexOf(newName);
        if (idx2 !== -1) {
          pCats[idx2] = oldName;
          p.categories = pCats;
          delete p.category;
        }
      });
      loadAdminData();
    })
    .finally(function () {
      editCatConfirmBtn.disabled = false;
      editCatConfirmBtn.textContent = '💾 Guardar';
    });
}

function deleteCategory(catName) {
  var cats = settings.categories || [];
  settings.categories = cats.filter(function (c) { return c !== catName; });

  saveJsonToGitHub({ settings: settings, products: products })
    .then(function () {
      showToast('Categoría "' + catName + '" eliminada', 'success');
      renderCategoriesList();
      updateCategoryDatalist();
    })
    .catch(function (err) {
      showToast('Error: ' + err.message, 'error');
      settings.categories = cats;
      renderCategoriesList();
    });
}

// ===== RENDER ADMIN PRODUCT GRID =====
function renderAdminGrid() {
  if (products.length === 0) {
    adminProductGrid.innerHTML =
      '<div class="empty-catalog">' +
        '<span>📦</span>' +
        '<p>No hay productos aun. Agrega el primero!</p>' +
      '</div>';
    return;
  }

  adminProductGrid.innerHTML = '';
  if (reorderMode) {
    products.forEach(function (product, index) {
      adminProductGrid.appendChild(buildAdminCardReorder(product, index));
    });
  } else {
    products.forEach(function (product) {
      adminProductGrid.appendChild(buildAdminCard(product));
    });
  }
}

function buildAdminCard(product) {
  var card = document.createElement('article');
  card.className = 'product-card fade-in';
  card.dataset.id = product.id;

  var imgs = getProductImages(product);
  var imgSrc = imgs.length > 0 ? 'data/images/' + encodeURIComponent(imgs[0]) : '';
  var firstCat = getProductCategories(product)[0] || '';
  var imgContent = imgSrc
    ? '<img src="' + escapeAttr(imgSrc) + '" alt="' + escapeAttr(product.name) + '" loading="lazy" />'
    : '<div class="product-placeholder">' + getCategoryEmoji(firstCat) + '</div>';

  var imgCountBadge = imgs.length > 1
    ? '<span class="badge-img-count">📷 ' + imgs.length + '</span>'
    : '';

  var badgeHtml = product.available
    ? '<span class="badge-available">Disponible</span>'
    : '<span class="badge-unavailable">Sin stock</span>';

  var productCats = getProductCategories(product);
  var catHtml = productCats.length > 0
    ? '<p class="product-category">' + productCats.map(escapeHtml).join(' · ') + '</p>'
    : '';

  var descHtml = product.description
    ? '<p class="product-desc">' + escapeHtml(product.description) + '</p>'
    : '';

  card.innerHTML =
    '<div class="product-img-wrap">' +
      imgContent + badgeHtml + imgCountBadge +
    '</div>' +
    '<div class="product-body">' +
      catHtml +
      '<h3 class="product-name">' + escapeHtml(product.name) + '</h3>' +
      descHtml +
      '<p class="product-price">' + formatPrice(product.price) + '</p>' +
      '<div class="admin-card-btns">' +
        '<button class="btn-edit-card" data-id="' + escapeAttr(product.id) + '">✏️ Editar</button>' +
        '<button class="btn-delete-card" data-id="' + escapeAttr(product.id) + '" data-name="' + escapeAttr(product.name) + '">🗑️ Eliminar</button>' +
      '</div>' +
    '</div>';

  return card;
}

// ===== PRODUCT FORM MODAL =====
function openProductForm(id) {
  editingId = id || null;
  pendingImages = [];

  if (editingId) {
    var product = products.find(function (p) { return p.id === editingId; });
    if (!product) return;
    productFormTitle.textContent = 'Editar producto';
    productName.value        = product.name;
    renderCategoryCheckboxes(getProductCategories(product));
    productPrice.value       = product.price;
    productDesc.value        = product.description || '';
    productAvailable.checked = product.available;
    availableLabel.textContent = product.available ? 'Disponible' : 'Sin stock';
    renderVariantsForm(product.variants || []);
    getProductImages(product).forEach(function (name) {
      pendingImages.push({ file: null, src: 'data/images/' + encodeURIComponent(name), name: name, isNew: false });
    });
  } else {
    productFormTitle.textContent = 'Agregar producto';
    productName.value        = '';
    renderCategoryCheckboxes([]);
    productPrice.value       = '';
    productDesc.value        = '';
    productAvailable.checked = true;
    availableLabel.textContent = 'Disponible';
    clearVariantsForm();
  }

  renderImagesAdmin();
  productFormModal.classList.add('open');
  lockBodyScroll();
  fixModalBodyHeight(productFormModal.querySelector('.admin-modal'));
  productName.focus();
}

function closeProductForm() {
  productFormModal.classList.remove('open');
  clearModalBodyHeight(productFormModal.querySelector('.admin-modal'));
  unlockBodyScroll();
  editingId = null;
  pendingImages = [];
}

// ===== SAVE PRODUCT =====
function saveProduct() {
  var name  = productName.value.trim();
  var price = parseFloat(productPrice.value);

  if (!name) {
    showToast('El nombre es obligatorio.', 'error');
    productName.focus();
    return;
  }
  if (isNaN(price) || price < 0) {
    showToast('Ingresa un precio valido.', 'error');
    productPrice.focus();
    return;
  }

  productFormSave.disabled = true;
  productFormSave.textContent = 'Guardando...';

  var id = editingId || generateId();
  var oldProduct = editingId ? products.find(function (p) { return p.id === editingId; }) : null;
  var oldImages = oldProduct ? getProductImages(oldProduct) : [];

  // Assign filenames to new images before uploading
  var newImgCounter = 0;
  pendingImages.forEach(function (img) {
    if (img.isNew) {
      img.name = id + '_' + Date.now() + '_' + (newImgCounter++) + '.jpg';
    }
  });

  // Images to upload (newly added)
  var imagesToUpload = pendingImages.filter(function (img) { return img.isNew; });

  // Images to delete (were in old product but removed from pendingImages)
  var keptNames = pendingImages.filter(function (img) { return !img.isNew; }).map(function (img) { return img.name; });
  var imagesToDelete = oldImages.filter(function (n) { return keptNames.indexOf(n) === -1; });

  // Upload new images sequentially
  var uploadChain = imagesToUpload.reduce(function (chain, img) {
    return chain.then(function () {
      return compressImage(img.file)
        .then(function (blob) { return blobToBase64Raw(blob); })
        .then(function (base64) { return uploadImageToGitHub(base64, img.name); });
    });
  }, Promise.resolve());

  // Then delete removed images
  uploadChain
    .then(function () {
      return imagesToDelete.reduce(function (chain, n) {
        return chain.then(function () { return deleteImageFromGitHub(n); });
      }, Promise.resolve());
    })
    .then(function () {
      var finalImages = pendingImages.map(function (img) { return img.name; }).filter(Boolean);

      var productData = {
        id: id,
        name: name,
        categories: getSelectedCategories(),
        price: price,
        description: productDesc.value.trim(),
        available: productAvailable.checked,
        images: finalImages,
        created_at: editingId
          ? (products.find(function (p) { return p.id === editingId; }) || {}).created_at || new Date().toISOString()
          : new Date().toISOString()
      };

      var variants = getVariantsFromForm();
      if (variants.length > 0) {
        productData.variants = variants;
      }

      if (editingId) {
        var idx = products.findIndex(function (p) { return p.id === editingId; });
        if (idx !== -1) products[idx] = productData;
      } else {
        products.unshift(productData);
      }

      return saveJsonToGitHub({ settings: settings, products: products });
    })
    .then(function () {
      showToast(editingId ? 'Producto actualizado' : 'Producto agregado', 'success');
      closeProductForm();
      renderAdminGrid();
    })
    .catch(function (err) {
      showToast('Error: ' + err.message, 'error');
      // Reload to get fresh state after partial failure
      loadAdminData();
    })
    .finally(function () {
      productFormSave.disabled = false;
      productFormSave.textContent = '💾 Guardar';
    });
}

// ===== IMAGE HANDLING =====
function handleImageFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('La imagen es muy grande. Máximo 5 MB.', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('El archivo debe ser una imagen.', 'error');
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    pendingImages.push({ file: file, src: e.target.result, name: '', isNew: true });
    renderImagesAdmin();
  };
  reader.readAsDataURL(file);
}

function renderImagesAdmin() {
  imgPreviewGrid.innerHTML = '';
  if (pendingImages.length === 0) {
    imgPlaceholder.style.display = 'block';
    return;
  }
  imgPlaceholder.style.display = 'none';
  pendingImages.forEach(function (img, idx) {
    var item = document.createElement('div');
    item.className = 'img-preview-item' + (idx === 0 ? ' img-preview-main' : '');
    item.innerHTML =
      '<img src="' + escapeAttr(img.src) + '" alt="Imagen ' + (idx + 1) + '" />' +
      (idx === 0 ? '<span class="img-preview-main-badge">Principal</span>' : '') +
      '<button type="button" class="btn-remove-single-img" data-idx="' + idx + '" title="Eliminar imagen">✕</button>';
    imgPreviewGrid.appendChild(item);
  });
}

function resetImageUpload() {
  pendingImages = [];
  imgFileInput.value = '';
  renderImagesAdmin();
}

// ===== DELETE PRODUCT =====
function openDeleteModal(id, name) {
  pendingDeleteId = id;
  deleteProductName.textContent = name;
  deleteModal.classList.add('open');
  lockBodyScroll();
  fixModalBodyHeight(deleteModal.querySelector('.admin-modal'));
}

function closeDeleteModal() {
  deleteModal.classList.remove('open');
  clearModalBodyHeight(deleteModal.querySelector('.admin-modal'));
  unlockBodyScroll();
  pendingDeleteId = null;
}

function confirmDelete() {
  if (!pendingDeleteId) return;

  deleteConfirmBtn.disabled = true;
  deleteConfirmBtn.textContent = 'Eliminando...';

  var product = products.find(function (p) { return p.id === pendingDeleteId; });
  var imagesToDelete = product ? getProductImages(product) : [];

  var deleteImagesChain = imagesToDelete.reduce(function (chain, name) {
    return chain.then(function () { return deleteImageFromGitHub(name); });
  }, Promise.resolve());

  deleteImagesChain
    .then(function () {
      products = products.filter(function (p) { return p.id !== pendingDeleteId; });
      return saveJsonToGitHub({ settings: settings, products: products });
    })
    .then(function () {
      showToast('Producto eliminado.', 'error');
      closeDeleteModal();
      renderAdminGrid();
    })
    .catch(function (err) {
      showToast('Error eliminando: ' + err.message, 'error');
      loadAdminData();
    })
    .finally(function () {
      deleteConfirmBtn.disabled = false;
      deleteConfirmBtn.textContent = '🗑 Eliminar';
    });
}

// ===== REORDER MODE =====
function enterReorderMode() {
  reorderMode = true;
  originalOrder = products.slice(); // save copy for cancel

  reorderActions.classList.add('visible');
  btnReorderProducts.style.display = 'none';
  btnAddProduct.style.display = 'none';

  // Rebuild the grid in reorder mode
  renderAdminGrid();
}

function exitReorderMode(revert) {
  reorderMode = false;
  if (revert) {
    products = originalOrder.slice();
  }
  originalOrder = [];
  _dragSrcCard = null;

  reorderActions.classList.remove('visible');
  btnReorderProducts.style.display = '';
  btnAddProduct.style.display = '';

  renderAdminGrid();
}

function buildAdminCardReorder(product, index) {
  var card = document.createElement('article');
  card.className = 'product-card fade-in reorder-enabled';
  card.dataset.id = product.id;
  card.dataset.index = index;
  card.draggable = true;

  var imgs = getProductImages(product);
  var imgSrc = imgs.length > 0 ? 'data/images/' + encodeURIComponent(imgs[0]) : '';
  var firstCat = getProductCategories(product)[0] || '';
  var imgContent = imgSrc
    ? '<img src="' + escapeAttr(imgSrc) + '" alt="' + escapeAttr(product.name) + '" loading="lazy" />'
    : '<div class="product-placeholder">' + getCategoryEmoji(firstCat) + '</div>';

  var badgeHtml = product.available
    ? '<span class="badge-available">Disponible</span>'
    : '<span class="badge-unavailable">Sin stock</span>';

  var productCats = getProductCategories(product);
  var catHtml = productCats.length > 0
    ? '<p class="product-category">' + productCats.map(escapeHtml).join(' · ') + '</p>'
    : '';

  card.innerHTML =
    '<div class="drag-handle" aria-hidden="true">☰</div>' +
    '<div class="product-img-wrap">' + imgContent + badgeHtml + '</div>' +
    '<div class="product-body">' +
      catHtml +
      '<h3 class="product-name">' + escapeHtml(product.name) + '</h3>' +
      '<p class="product-price">' + formatPrice(product.price) + '</p>' +
      '<div class="reorder-move-btns">' +
        '<button class="btn-move-up" data-index="' + index + '" title="Subir">▲</button>' +
        '<button class="btn-move-down" data-index="' + index + '" title="Bajar">▼</button>' +
      '</div>' +
    '</div>';

  // Drag & drop events (desktop)
  card.addEventListener('dragstart', function (e) {
    _dragSrcCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  });

  card.addEventListener('dragend', function () {
    card.classList.remove('dragging');
    adminProductGrid.querySelectorAll('.product-card').forEach(function (c) {
      c.classList.remove('drag-over');
    });
    _dragSrcCard = null;
  });

  card.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (_dragSrcCard && _dragSrcCard !== card) {
      adminProductGrid.querySelectorAll('.product-card').forEach(function (c) {
        c.classList.remove('drag-over');
      });
      card.classList.add('drag-over');
    }
  });

  card.addEventListener('dragleave', function () {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', function (e) {
    e.preventDefault();
    card.classList.remove('drag-over');
    if (!_dragSrcCard || _dragSrcCard === card) return;

    var fromIdx = parseInt(_dragSrcCard.dataset.index, 10);
    var toIdx   = parseInt(card.dataset.index, 10);

    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;

    // Reorder products array
    var moved = products.splice(fromIdx, 1)[0];
    products.splice(toIdx, 0, moved);

    renderAdminGrid();
  });

  // Touch drag-and-drop (mobile)
  var dragHandle = card.querySelector('.drag-handle');
  if (dragHandle) {
    dragHandle.addEventListener('touchstart', function (e) {
      _dragSrcCard = card;
      card.classList.add('dragging');
      e.preventDefault();
    }, { passive: false });

    dragHandle.addEventListener('touchmove', function (e) {
      if (!_dragSrcCard) return;
      e.preventDefault();
      var touch = e.touches[0];
      // Temporarily hide the dragging card so elementFromPoint finds the card below
      card.style.visibility = 'hidden';
      var target = document.elementFromPoint(touch.clientX, touch.clientY);
      card.style.visibility = '';
      var overCard = target ? target.closest('.product-card.reorder-enabled') : null;
      adminProductGrid.querySelectorAll('.product-card').forEach(function (c) {
        c.classList.remove('drag-over');
      });
      if (overCard && overCard !== card) {
        overCard.classList.add('drag-over');
      }
    }, { passive: false });

    dragHandle.addEventListener('touchend', function () {
      if (!_dragSrcCard) return;
      card.classList.remove('dragging');
      var overCard = adminProductGrid.querySelector('.product-card.drag-over');
      adminProductGrid.querySelectorAll('.product-card').forEach(function (c) {
        c.classList.remove('drag-over');
      });
      if (overCard && overCard !== card) {
        var fromIdx = parseInt(card.dataset.index, 10);
        var toIdx   = parseInt(overCard.dataset.index, 10);
        if (!isNaN(fromIdx) && !isNaN(toIdx) && fromIdx !== toIdx) {
          var moved = products.splice(fromIdx, 1)[0];
          products.splice(toIdx, 0, moved);
          renderAdminGrid();
        }
      }
      _dragSrcCard = null;
    });
  }

  return card;
}

function saveReorderMode() {
  btnSaveOrder.disabled = true;
  btnSaveOrder.textContent = 'Guardando...';

  saveJsonToGitHub({ settings: settings, products: products })
    .then(function () {
      showToast('Orden guardado correctamente', 'success');
      exitReorderMode(false);
    })
    .catch(function (err) {
      showToast('Error guardando: ' + err.message, 'error');
      loadAdminData();
      exitReorderMode(true);
    })
    .finally(function () {
      btnSaveOrder.disabled = false;
      btnSaveOrder.textContent = '💾 Guardar orden';
    });
}

// ===== SETTINGS =====
function saveWaNumberSetting() {
  var num = waNumberInput.value.replace(/\D/g, '');
  if (!num) {
    showToast('Ingresa un numero valido.', 'error');
    return;
  }

  btnSaveWaNumber.disabled = true;
  btnSaveWaNumber.textContent = 'Guardando...';

  settings.wa_number = '506' + num;
  waNumberInput.value = num;

  saveJsonToGitHub({ settings: settings, products: products })
    .then(function () {
      showToast('Numero de WhatsApp guardado', 'success');
    })
    .catch(function (err) {
      showToast('Error: ' + err.message, 'error');
    })
    .finally(function () {
      btnSaveWaNumber.disabled = false;
      btnSaveWaNumber.textContent = 'Guardar';
    });
}

// ===== EVENT LISTENERS =====

// Setup
setupBtn.addEventListener('click', handleSetup);
setupToken.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSetup(); });
btnLogout.addEventListener('click', handleLogout);

// Product grid actions (event delegation)
adminProductGrid.addEventListener('click', function (e) {
  // Ignore clicks when in reorder mode (only ▲/▼ buttons should work)
  if (reorderMode) {
    var upBtn = e.target.closest('.btn-move-up');
    if (upBtn) {
      var idx = parseInt(upBtn.dataset.index, 10);
      if (idx > 0) {
        var tmp = products[idx];
        products[idx] = products[idx - 1];
        products[idx - 1] = tmp;
        renderAdminGrid();
      }
      return;
    }
    var downBtn = e.target.closest('.btn-move-down');
    if (downBtn) {
      var dIdx = parseInt(downBtn.dataset.index, 10);
      if (dIdx < products.length - 1) {
        var dtmp = products[dIdx];
        products[dIdx] = products[dIdx + 1];
        products[dIdx + 1] = dtmp;
        renderAdminGrid();
      }
      return;
    }
    return; // block all other clicks in reorder mode
  }

  var editBtn = e.target.closest('.btn-edit-card');
  if (editBtn) {
    openProductForm(editBtn.dataset.id);
    return;
  }
  var delBtn = e.target.closest('.btn-delete-card');
  if (delBtn) {
    openDeleteModal(delBtn.dataset.id, delBtn.dataset.name);
  }
});

// Add product
btnAddProduct.addEventListener('click', function () { openProductForm(); });

// Reorder mode
btnReorderProducts.addEventListener('click', enterReorderMode);
btnSaveOrder.addEventListener('click', saveReorderMode);
btnCancelOrder.addEventListener('click', function () { exitReorderMode(true); });

// Product form
productFormClose.addEventListener('click', closeProductForm);
productFormCancel.addEventListener('click', closeProductForm);
productFormSave.addEventListener('click', saveProduct);
productFormModal.addEventListener('click', function (e) {
  if (e.target === productFormModal) closeProductForm();
});

// Availability toggle
productAvailable.addEventListener('change', function () {
  availableLabel.textContent = productAvailable.checked ? 'Disponible' : 'Sin stock';
});

// Variants
btnAddVariant.addEventListener('click', function () { addVariantRow('', true); });

// Image upload
imgFileInput.addEventListener('change', function (e) {
  var files = e.target.files;
  for (var i = 0; i < files.length; i++) {
    handleImageFile(files[i]);
  }
  imgFileInput.value = '';
});

var imgUploadArea = document.getElementById('imgUploadArea');
imgUploadArea.addEventListener('dragover', function (e) {
  e.preventDefault();
  imgUploadArea.style.borderColor = 'var(--primary)';
});
imgUploadArea.addEventListener('dragleave', function () {
  imgUploadArea.style.borderColor = '';
});
imgUploadArea.addEventListener('drop', function (e) {
  e.preventDefault();
  imgUploadArea.style.borderColor = '';
  var files = e.dataTransfer.files;
  for (var i = 0; i < files.length; i++) {
    handleImageFile(files[i]);
  }
});

// Remove individual image from preview grid (event delegation)
imgPreviewGrid.addEventListener('click', function (e) {
  var btn = e.target.closest('.btn-remove-single-img');
  if (!btn) return;
  var idx = parseInt(btn.dataset.idx, 10);
  if (!isNaN(idx) && idx >= 0 && idx < pendingImages.length) {
    pendingImages.splice(idx, 1);
    renderImagesAdmin();
  }
});

// Delete modal
deleteModalClose.addEventListener('click', closeDeleteModal);
deleteCancelBtn.addEventListener('click', closeDeleteModal);
deleteConfirmBtn.addEventListener('click', confirmDelete);
deleteModal.addEventListener('click', function (e) {
  if (e.target === deleteModal) closeDeleteModal();
});

// Settings
btnSaveWaNumber.addEventListener('click', saveWaNumberSetting);

// Categories
btnAddCategory.addEventListener('click', addCategory);
newCategoryInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') addCategory(); });

categoriesList.addEventListener('click', function (e) {
  var editBtn = e.target.closest('.btn-cat-edit');
  if (editBtn) {
    openEditCategory(editBtn.dataset.cat);
    return;
  }
  var delBtn = e.target.closest('.btn-cat-delete');
  if (delBtn) {
    deleteCategory(delBtn.dataset.cat);
  }
});

editCatModalClose.addEventListener('click', closeEditCategory);
editCatCancelBtn.addEventListener('click', closeEditCategory);
editCatConfirmBtn.addEventListener('click', saveEditCategory);
editCategoryModal.addEventListener('click', function (e) {
  if (e.target === editCategoryModal) closeEditCategory();
});
editCategoryInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveEditCategory(); });

// Escape closes modals
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeProductForm();
    closeDeleteModal();
    closeEditCategory();
  }
});

// ===== INIT =====
checkExistingConfig();
