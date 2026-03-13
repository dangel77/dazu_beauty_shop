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
var selectedImageFile = null;
var currentImageName = '';   // current image filename in data/images/
var editingCategory = null;  // original name of the category being edited
var _savedScrollY = 0;       // scroll position saved when a modal is opened (iOS fix)

var DEFAULT_CATEGORIES = [
  'Shampoo', 'Crema', 'Jabon', 'Acondicionador', 'Aceite',
  'Mascarilla', 'Perfume', 'Maquillaje', 'Cuidado facial', 'Cuidado corporal'
];

// ===== SCROLL LOCK (iOS Safari compatible) =====
function _preventBgScroll(e) {
  // Allow scrolling inside modal body, block everything else
  var modalBody = e.target.closest('.admin-modal-body');
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
var _visualViewportResizeHandler = null;

function fixModalBodyHeight(modalEl) {
  if (window.innerWidth > 600) return; // only on mobile
  var header = modalEl.querySelector('.admin-modal-header');
  var footer = modalEl.querySelector('.admin-modal-footer');
  var body   = modalEl.querySelector('.admin-modal-body');
  if (!header || !footer || !body) return;

  function compute() {
    // visualViewport.height is accurate on mobile: excludes on-screen keyboard, browser chrome
    var vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    var modalMaxH = vh * 0.90;
    var headerH = header.offsetHeight;
    var footerH = footer.offsetHeight;
    var bodyMaxH = modalMaxH - headerH - footerH;
    // Ensure minimum viable modal body height before applying
    if (bodyMaxH > 60) {
      body.style.maxHeight = Math.floor(bodyMaxH) + 'px';
    }
  }

  // 100ms delay: enough for layout to settle after CSS transitions begin (transition is 0.35s,
  // but header/footer dimensions are stable well before the animation completes)
  setTimeout(compute, 100);

  // Re-compute whenever the viewport changes (e.g. keyboard shows/hides)
  if (window.visualViewport) {
    if (_visualViewportResizeHandler) {
      window.visualViewport.removeEventListener('resize', _visualViewportResizeHandler);
    }
    _visualViewportResizeHandler = compute;
    window.visualViewport.addEventListener('resize', _visualViewportResizeHandler);
  }
}

function clearModalBodyHeight(modalEl) {
  var body = modalEl.querySelector('.admin-modal-body');
  if (body) body.style.maxHeight = '';
  if (_visualViewportResizeHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _visualViewportResizeHandler);
    _visualViewportResizeHandler = null;
  }
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
var imgPreviewWrap    = document.getElementById('imgPreviewWrap');
var imgPreview        = document.getElementById('imgPreview');
var btnRemoveImg      = document.getElementById('btnRemoveImg');
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

// ===== HELPERS =====
function getProductCategories(product) {
  if (Array.isArray(product.categories)) return product.categories;
  if (product.category) return [product.category];
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
  products.forEach(function (product) {
    adminProductGrid.appendChild(buildAdminCard(product));
  });
}

function buildAdminCard(product) {
  var card = document.createElement('article');
  card.className = 'product-card fade-in';
  card.dataset.id = product.id;

  var imgSrc = product.image ? 'data/images/' + encodeURIComponent(product.image) : '';
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

  var descHtml = product.description
    ? '<p class="product-desc">' + escapeHtml(product.description) + '</p>'
    : '';

  card.innerHTML =
    '<div class="product-img-wrap">' +
      imgContent + badgeHtml +
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
  selectedImageFile = null;
  currentImageName = '';
  resetImageUpload();

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
    if (product.image) {
      currentImageName = product.image;
      showImagePreview('data/images/' + encodeURIComponent(product.image));
    }
  } else {
    productFormTitle.textContent = 'Agregar producto';
    productName.value        = '';
    renderCategoryCheckboxes([]);
    productPrice.value       = '';
    productDesc.value        = '';
    productAvailable.checked = true;
    availableLabel.textContent = 'Disponible';
  }

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
  selectedImageFile = null;
  currentImageName = '';
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

  var imageName = currentImageName;
  var id = editingId || generateId();

  // Determine if we need to upload an image
  var imagePromise;
  if (selectedImageFile) {
    imageName = id + '.jpg';
    imagePromise = compressImage(selectedImageFile)
      .then(function (blob) { return blobToBase64Raw(blob); })
      .then(function (base64) { return uploadImageToGitHub(base64, imageName); });
  } else {
    imagePromise = Promise.resolve();
  }

  imagePromise
    .then(function () {
      // If editing and image was removed (no selectedFile + no currentImageName)
      if (editingId && !selectedImageFile && !currentImageName) {
        var oldProduct = products.find(function (p) { return p.id === editingId; });
        if (oldProduct && oldProduct.image) {
          return deleteImageFromGitHub(oldProduct.image);
        }
      }
    })
    .then(function () {
      var productData = {
        id: id,
        name: name,
        categories: getSelectedCategories(),
        price: price,
        description: productDesc.value.trim(),
        available: productAvailable.checked,
        image: imageName,
        created_at: editingId
          ? (products.find(function (p) { return p.id === editingId; }) || {}).created_at || new Date().toISOString()
          : new Date().toISOString()
      };

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
    showToast('La imagen es muy grande. Maximo 5 MB.', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('El archivo debe ser una imagen.', 'error');
    return;
  }

  selectedImageFile = file;
  var reader = new FileReader();
  reader.onload = function (e) { showImagePreview(e.target.result); };
  reader.readAsDataURL(file);
}

function showImagePreview(src) {
  imgPreview.src = src;
  imgPlaceholder.style.display  = 'none';
  imgPreviewWrap.style.display  = 'block';
  btnRemoveImg.style.display    = 'block';
}

function resetImageUpload() {
  imgPreview.src                = '';
  imgPlaceholder.style.display  = 'block';
  imgPreviewWrap.style.display  = 'none';
  btnRemoveImg.style.display    = 'none';
  imgFileInput.value            = '';
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
  var imageDeletePromise = (product && product.image)
    ? deleteImageFromGitHub(product.image)
    : Promise.resolve();

  imageDeletePromise
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

// Image upload
imgFileInput.addEventListener('change', function (e) {
  handleImageFile(e.target.files[0]);
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
  if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
});

btnRemoveImg.addEventListener('click', function () {
  selectedImageFile = null;
  currentImageName = '';
  resetImageUpload();
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
