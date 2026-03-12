/* =====================================================================
   admin.js  –  Dazu Beauty Shop
   Handles: authentication, product CRUD, image upload, settings
   ===================================================================== */

'use strict';

// ===== CONSTANTS =====
const STORAGE_KEY_PRODUCTS  = 'dazu_products';
const STORAGE_KEY_WA        = 'dazu_wa_number';
const STORAGE_KEY_PASSWORD  = 'dazu_admin_password';
const DEFAULT_PASSWORD      = 'dazu2024';  // Default password – change via settings panel

// ===== LOAD / SAVE =====
function loadProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
    if (raw) return JSON.parse(raw);
    // On first load, save the sample products so catalog also shows them
    const samples = getSampleProducts();
    saveProducts(samples);
    return samples;
  } catch {
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
}

function getSampleProducts() {
  return [
    {
      id: generateId(),
      name: 'Shampoo Argan Premium',
      category: 'Shampoo',
      price: 3200,
      description: 'Shampoo nutritivo con aceite de argán. Ideal para cabello seco y dañado. 400ml.',
      available: true,
      image: ''
    },
    {
      id: generateId(),
      name: 'Crema Hidratante Corporal',
      category: 'Crema',
      price: 2800,
      description: 'Crema de uso diario con manteca de karité. Piel suave y nutrida todo el día.',
      available: true,
      image: ''
    },
    {
      id: generateId(),
      name: 'Jabón Artesanal Lavanda',
      category: 'Jabón',
      price: 1500,
      description: 'Jabón artesanal con esencia de lavanda y aceites naturales. 100g.',
      available: true,
      image: ''
    },
    {
      id: generateId(),
      name: 'Acondicionador Reparador',
      category: 'Acondicionador',
      price: 2900,
      description: 'Acondicionador con proteínas de seda para cabello maltratado. 350ml.',
      available: false,
      image: ''
    },
    {
      id: generateId(),
      name: 'Aceite Capilar Coconut',
      category: 'Aceite',
      price: 1800,
      description: 'Aceite de coco para brillo y nutrición del cabello. Uso en puntas.',
      available: true,
      image: ''
    },
    {
      id: generateId(),
      name: 'Mascarilla Capilar Intensiva',
      category: 'Mascarilla',
      price: 3500,
      description: 'Tratamiento intensivo semanal para cabello seco. Con keratina y vitamina E.',
      available: true,
      image: ''
    }
  ];
}

function getPassword() {
  return localStorage.getItem(STORAGE_KEY_PASSWORD) || DEFAULT_PASSWORD;
}

function savePassword(pwd) {
  localStorage.setItem(STORAGE_KEY_PASSWORD, pwd);
}

function getWaNumber() {
  return localStorage.getItem(STORAGE_KEY_WA) || '';
}

function saveWaNumber(num) {
  localStorage.setItem(STORAGE_KEY_WA, num);
}

// ===== ID GENERATION =====
function generateId() {
  return 'prod_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
}

// ===== FORMAT PRICE =====
const formatPrice = (n) =>
  '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ===== ESCAPE =====
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

// ===== STATE =====
let products = [];
let editingId = null;
let pendingDeleteId = null;
let currentImageBase64 = '';

// ===== DOM =====
const passwordScreen     = document.getElementById('passwordScreen');
const adminPanel         = document.getElementById('adminPanel');
const passwordInput      = document.getElementById('passwordInput');
const passwordBtn        = document.getElementById('passwordBtn');
const passwordError      = document.getElementById('passwordError');
const btnLogout          = document.getElementById('btnLogout');
const adminProductGrid   = document.getElementById('adminProductGrid');
const btnAddProduct      = document.getElementById('btnAddProduct');

// Product form modal
const productFormModal   = document.getElementById('productFormModal');
const productFormTitle   = document.getElementById('productFormTitle');
const productFormClose   = document.getElementById('productFormClose');
const productFormCancel  = document.getElementById('productFormCancel');
const productFormSave    = document.getElementById('productFormSave');
const imgFileInput       = document.getElementById('imgFileInput');
const imgPlaceholder     = document.getElementById('imgPlaceholder');
const imgPreviewWrap     = document.getElementById('imgPreviewWrap');
const imgPreview         = document.getElementById('imgPreview');
const btnRemoveImg       = document.getElementById('btnRemoveImg');
const productName        = document.getElementById('productName');
const productCategory    = document.getElementById('productCategory');
const productPrice       = document.getElementById('productPrice');
const productDesc        = document.getElementById('productDesc');
const productAvailable   = document.getElementById('productAvailable');
const availableLabel     = document.getElementById('availableLabel');

// Delete modal
const deleteModal        = document.getElementById('deleteModal');
const deleteModalClose   = document.getElementById('deleteModalClose');
const deleteProductName  = document.getElementById('deleteProductName');
const deleteCancelBtn    = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn   = document.getElementById('deleteConfirmBtn');

// Settings
const waNumberInput      = document.getElementById('waNumberInput');
const btnSaveWaNumber    = document.getElementById('btnSaveWaNumber');
const newPasswordInput   = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const btnSavePassword    = document.getElementById('btnSavePassword');

// Toast
const toastContainer     = document.getElementById('toastContainer');

// ===== AUTHENTICATION =====
function login() {
  const entered = passwordInput.value;
  if (entered === getPassword()) {
    passwordScreen.style.display = 'none';
    adminPanel.style.display = 'block';
    passwordError.classList.remove('show');
    loadAdminPanel();
  } else {
    passwordError.classList.add('show');
    passwordInput.value = '';
    passwordInput.focus();
  }
}

function logout() {
  adminPanel.style.display = 'none';
  passwordScreen.style.display = 'flex';
  passwordInput.value = '';
  passwordError.classList.remove('show');
}

// ===== LOAD ADMIN PANEL =====
function loadAdminPanel() {
  products = loadProducts();
  renderAdminGrid();
  waNumberInput.value = getWaNumber();
}

// ===== RENDER ADMIN PRODUCT GRID =====
function renderAdminGrid() {
  if (products.length === 0) {
    adminProductGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#aaa;">
        <div style="font-size:3rem;margin-bottom:0.8rem">📦</div>
        <p>No hay productos aún. ¡Agregá el primero!</p>
      </div>`;
    return;
  }

  adminProductGrid.innerHTML = '';
  products.forEach(product => {
    const card = buildAdminCard(product);
    adminProductGrid.appendChild(card);
  });
}

function buildAdminCard(product) {
  const card = document.createElement('article');
  card.className = 'admin-product-card fade-in';
  card.dataset.id = product.id;

  const imgContent = product.image
    ? `<img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" />`
    : getCategoryEmoji(product.category);

  const statusCls  = product.available ? 'status-available' : 'status-unavailable';
  const statusText = product.available ? '● Disponible' : '● Sin stock';

  card.innerHTML = `
    <div class="admin-card-img">${imgContent}</div>
    <div class="admin-card-info">
      <div class="admin-card-name">${escapeHtml(product.name)}</div>
      <div class="admin-card-price">${formatPrice(product.price)}</div>
      <span class="admin-card-status ${statusCls}">${statusText}</span>
    </div>
    <div class="admin-card-actions">
      <button class="btn-edit" data-id="${escapeAttr(product.id)}">✏️ Editar</button>
      <button class="btn-delete" data-id="${escapeAttr(product.id)}" data-name="${escapeAttr(product.name)}">🗑 Eliminar</button>
    </div>
  `;

  return card;
}

// ===== PRODUCT FORM MODAL =====
function openProductForm(id = null) {
  editingId = id;
  currentImageBase64 = '';
  resetImageUpload();

  if (id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    productFormTitle.textContent = 'Editar producto';
    productName.value        = product.name;
    productCategory.value    = product.category || '';
    productPrice.value       = product.price;
    productDesc.value        = product.description || '';
    productAvailable.checked = product.available;
    availableLabel.textContent = product.available ? 'Disponible' : 'Sin stock';
    if (product.image) {
      currentImageBase64 = product.image;
      showImagePreview(product.image);
    }
  } else {
    productFormTitle.textContent = 'Agregar producto';
    productName.value        = '';
    productCategory.value    = '';
    productPrice.value       = '';
    productDesc.value        = '';
    productAvailable.checked = true;
    availableLabel.textContent = 'Disponible';
  }

  productFormModal.classList.add('open');
  productName.focus();
}

function closeProductForm() {
  productFormModal.classList.remove('open');
  editingId = null;
  currentImageBase64 = '';
}

function saveProduct() {
  const name  = productName.value.trim();
  const price = parseFloat(productPrice.value);

  if (!name) {
    showToast('El nombre del producto es obligatorio.', 'error');
    productName.focus();
    return;
  }
  if (isNaN(price) || price < 0) {
    showToast('Ingresá un precio válido.', 'error');
    productPrice.focus();
    return;
  }

  const productData = {
    id:          editingId || generateId(),
    name,
    category:    productCategory.value.trim(),
    price,
    description: productDesc.value.trim(),
    available:   productAvailable.checked,
    image:       currentImageBase64
  };

  if (editingId) {
    const idx = products.findIndex(p => p.id === editingId);
    if (idx !== -1) products[idx] = productData;
    showToast('Producto actualizado ✅');
  } else {
    products.push(productData);
    showToast('Producto agregado ✅');
  }

  saveProducts(products);
  renderAdminGrid();
  closeProductForm();
}

// ===== IMAGE UPLOAD =====
function handleImageFile(file) {
  if (!file) return;

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE) {
    showToast('La imagen es muy grande. Máximo 5 MB.', 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('El archivo debe ser una imagen.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageBase64 = e.target.result;
    showImagePreview(currentImageBase64);
  };
  reader.readAsDataURL(file);
}

function showImagePreview(src) {
  imgPreview.src = src;
  imgPlaceholder.style.display = 'none';
  imgPreviewWrap.style.display = 'block';
  btnRemoveImg.style.display   = 'block';
}

function resetImageUpload() {
  imgPreview.src                 = '';
  imgPlaceholder.style.display   = 'block';
  imgPreviewWrap.style.display   = 'none';
  btnRemoveImg.style.display     = 'none';
  imgFileInput.value             = '';
}

// ===== DELETE =====
function openDeleteModal(id, name) {
  pendingDeleteId = id;
  deleteProductName.textContent = name;
  deleteModal.classList.add('open');
}

function closeDeleteModal() {
  deleteModal.classList.remove('open');
  pendingDeleteId = null;
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  products = products.filter(p => p.id !== pendingDeleteId);
  saveProducts(products);
  renderAdminGrid();
  closeDeleteModal();
  showToast('Producto eliminado.', 'error');
}

// ===== SETTINGS =====
function saveWaNumberSetting() {
  const num = waNumberInput.value.replace(/\D/g, '');
  if (!num) {
    showToast('Ingresá un número válido.', 'error');
    return;
  }
  saveWaNumber(num);
  waNumberInput.value = num;
  showToast('Número de WhatsApp guardado ✅');
}

function savePasswordSetting() {
  const newPwd  = newPasswordInput.value;
  const confirm = confirmPasswordInput.value;
  if (!newPwd || newPwd.length < 4) {
    showToast('La contraseña debe tener al menos 4 caracteres.', 'error');
    return;
  }
  if (newPwd !== confirm) {
    showToast('Las contraseñas no coinciden.', 'error');
    return;
  }
  savePassword(newPwd);
  newPasswordInput.value     = '';
  confirmPasswordInput.value = '';
  showToast('Contraseña actualizada ✅');
}

// ===== TOAST =====
function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ===== EVENT LISTENERS =====

// Auth
passwordBtn.addEventListener('click', login);
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});
btnLogout.addEventListener('click', logout);

// Product grid actions (edit / delete)
adminProductGrid.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.btn-edit');
  if (editBtn) {
    openProductForm(editBtn.dataset.id);
    return;
  }
  const delBtn = e.target.closest('.btn-delete');
  if (delBtn) {
    openDeleteModal(delBtn.dataset.id, delBtn.dataset.name);
  }
});

// Add product
btnAddProduct.addEventListener('click', () => openProductForm());

// Product form
productFormClose.addEventListener('click', closeProductForm);
productFormCancel.addEventListener('click', closeProductForm);
productFormSave.addEventListener('click', saveProduct);

productFormModal.addEventListener('click', (e) => {
  if (e.target === productFormModal) closeProductForm();
});

// Availability toggle label
productAvailable.addEventListener('change', () => {
  availableLabel.textContent = productAvailable.checked ? 'Disponible' : 'Sin stock';
});

// Image upload
imgFileInput.addEventListener('change', (e) => {
  handleImageFile(e.target.files[0]);
});

// Drag & drop on upload area
const imgUploadArea = document.getElementById('imgUploadArea');
imgUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  imgUploadArea.style.borderColor = 'var(--primary)';
});
imgUploadArea.addEventListener('dragleave', () => {
  imgUploadArea.style.borderColor = '';
});
imgUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  imgUploadArea.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

btnRemoveImg.addEventListener('click', () => {
  currentImageBase64 = '';
  resetImageUpload();
});

// Delete modal
deleteModalClose.addEventListener('click', closeDeleteModal);
deleteCancelBtn.addEventListener('click', closeDeleteModal);
deleteConfirmBtn.addEventListener('click', confirmDelete);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

// Settings
btnSaveWaNumber.addEventListener('click', saveWaNumberSetting);
btnSavePassword.addEventListener('click', savePasswordSetting);

// Escape key closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeProductForm();
    closeDeleteModal();
  }
});

// ===== INIT =====
// Check if already "logged in" via session (simple flag; not security-critical)
// Admin panel starts hidden by default (password screen is shown)
