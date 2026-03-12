/* =====================================================================
   catalogo.js  –  Dazu Beauty Shop
   Handles: product rendering, category filters, cart, WhatsApp checkout
   ===================================================================== */

'use strict';

// ===== CONSTANTS =====
const STORAGE_KEY_PRODUCTS = 'dazu_products';
const STORAGE_KEY_WA       = 'dazu_wa_number';
const STORAGE_KEY_CART     = 'dazu_cart';
const DEFAULT_WA           = ''; // Set from admin panel

// ===== CURRENCY FORMAT =====
const formatPrice = (n) =>
  '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ===== LOAD DATA =====
function loadProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
    return raw ? JSON.parse(raw) : getSampleProducts();
  } catch {
    return getSampleProducts();
  }
}

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CART);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
}

function getWaNumber() {
  return localStorage.getItem(STORAGE_KEY_WA) || DEFAULT_WA;
}

// ===== SAMPLE PRODUCTS (shown when no admin data yet) =====
function getSampleProducts() {
  return [
    {
      id: 'sample-1',
      name: 'Shampoo Argan Premium',
      category: 'Shampoo',
      price: 3200,
      description: 'Shampoo nutritivo con aceite de argán. Ideal para cabello seco y dañado. 400ml.',
      available: true,
      image: ''
    },
    {
      id: 'sample-2',
      name: 'Crema Hidratante Corporal',
      category: 'Crema',
      price: 2800,
      description: 'Crema de uso diario con manteca de karité. Piel suave y nutrida todo el día.',
      available: true,
      image: ''
    },
    {
      id: 'sample-3',
      name: 'Jabón Artesanal Lavanda',
      category: 'Jabón',
      price: 1500,
      description: 'Jabón artesanal con esencia de lavanda y aceites naturales. 100g.',
      available: true,
      image: ''
    },
    {
      id: 'sample-4',
      name: 'Acondicionador Reparador',
      category: 'Acondicionador',
      price: 2900,
      description: 'Acondicionador con proteínas de seda para cabello maltratado. 350ml.',
      available: false,
      image: ''
    },
    {
      id: 'sample-5',
      name: 'Aceite Capilar Coconut',
      category: 'Aceite',
      price: 1800,
      description: 'Aceite de coco para brillo y nutrición del cabello. Uso en puntas.',
      available: true,
      image: ''
    },
    {
      id: 'sample-6',
      name: 'Mascarilla Capilar Intensiva',
      category: 'Mascarilla',
      price: 3500,
      description: 'Tratamiento intensivo semanal para cabello seco. Con keratina y vitamina E.',
      available: true,
      image: ''
    }
  ];
}

// ===== STATE =====
let allProducts = loadProducts();
let cart        = loadCart();
let activeFilter = 'all';

// ===== DOM ELEMENTS =====
const productGrid      = document.getElementById('productGrid');
const filtersContainer = document.getElementById('filtersContainer');
const cartOverlay      = document.getElementById('cartOverlay');
const cartSidebar      = document.getElementById('cartSidebar');
const cartCloseBtn     = document.getElementById('cartCloseBtn');
const cartToggleBtn    = document.getElementById('cartToggleBtn');
const cartCount        = document.getElementById('cartCount');
const cartItems        = document.getElementById('cartItems');
const cartTotal        = document.getElementById('cartTotal');
const btnWhatsapp      = document.getElementById('btnWhatsapp');
const checkoutModal    = document.getElementById('checkoutModal');
const checkoutClose    = document.getElementById('checkoutClose');
const checkoutCancel   = document.getElementById('checkoutCancel');
const btnSendWhatsapp  = document.getElementById('btnSendWhatsapp');
const buyerNameInput   = document.getElementById('buyerName');
const paymentTypeInput = document.getElementById('paymentType');
const toastContainer   = document.getElementById('toastContainer');

// ===== CATEGORIES =====
function getCategories(products) {
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  return cats;
}

function renderFilters(products) {
  // Remove old dynamic buttons (keep "Todos")
  const existing = filtersContainer.querySelectorAll('[data-category]:not([data-category="all"])');
  existing.forEach(el => el.remove());

  const cats = getCategories(products);
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat;
    btn.textContent = cat;
    filtersContainer.appendChild(btn);
  });
}

// ===== PRODUCT RENDERING =====
function buildProductCard(product) {
  const inCart = cart.filter(item => item.id === product.id).length;

  const card = document.createElement('article');
  card.className = 'product-card fade-in';
  card.dataset.id = product.id;

  const imgContent = product.image
    ? `<img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" loading="lazy" />`
    : `<div class="product-placeholder">${getCategoryEmoji(product.category)}</div>`;

  const badgeHtml = product.available
    ? `<span class="badge-available">Disponible</span>`
    : `<span class="badge-unavailable">Sin stock</span>`;

  const descHtml = product.description
    ? `<p class="product-desc">${escapeHtml(product.description)}</p>`
    : '';

  const catHtml = product.category
    ? `<p class="product-category">${escapeHtml(product.category)}</p>`
    : '';

  const addBtn = product.available
    ? `<button class="btn-add" data-id="${escapeAttr(product.id)}">
         <span>🛒</span> Agregar al carrito
       </button>`
    : `<button class="btn-add" disabled>Sin stock</button>`;

  card.innerHTML = `
    <div class="product-img-wrap">
      ${imgContent}
      ${badgeHtml}
    </div>
    <div class="product-body">
      ${catHtml}
      <h3 class="product-name">${escapeHtml(product.name)}</h3>
      ${descHtml}
      <p class="product-price">${formatPrice(product.price)}</p>
      ${addBtn}
    </div>
  `;

  return card;
}

function renderProducts(filter = 'all') {
  const filtered = filter === 'all'
    ? allProducts
    : allProducts.filter(p => p.category === filter);

  productGrid.innerHTML = '';

  if (filtered.length === 0) {
    productGrid.innerHTML = `
      <div class="empty-catalog">
        <span>🛍️</span>
        <p>No hay productos en esta categoría todavía.</p>
      </div>`;
    return;
  }

  filtered.forEach(product => {
    productGrid.appendChild(buildProductCard(product));
  });
}

// ===== CART LOGIC =====
function getCartTotal() {
  return cart.reduce((sum, item) => {
    const product = allProducts.find(p => p.id === item.id);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
}

function getTotalItems() {
  return cart.reduce((s, i) => s + i.qty, 0);
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || !product.available) return;

  const existing = cart.find(i => i.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: productId, qty: 1 });
  }
  saveCart(cart);
  updateCartUI();
  showToast(`${product.name} agregado al carrito 🛒`, 'success');

  // Bump animation
  cartCount.classList.remove('bump');
  void cartCount.offsetWidth; // reflow
  cartCount.classList.add('bump');
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
  saveCart(cart);
  updateCartUI();
  renderCartItems();
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(cart);
  updateCartUI();
  renderCartItems();
}

function updateCartUI() {
  const total = getTotalItems();
  if (total > 0) {
    cartCount.textContent = total;
    cartCount.style.display = 'flex';
  } else {
    cartCount.style.display = 'none';
  }
  cartTotal.textContent = formatPrice(getCartTotal());
  btnWhatsapp.disabled = cart.length === 0;
}

function renderCartItems() {
  if (cart.length === 0) {
    cartItems.innerHTML = `
      <div class="cart-empty">
        <span>🛍️</span>
        <p>Tu carrito está vacío</p>
      </div>`;
    return;
  }

  cartItems.innerHTML = '';
  cart.forEach(item => {
    const product = allProducts.find(p => p.id === item.id);
    if (!product) return;

    const li = document.createElement('div');
    li.className = 'cart-item';

    const imgContent = product.image
      ? `<img src="${escapeAttr(product.image)}" alt="${escapeAttr(product.name)}" />`
      : getCategoryEmoji(product.category);

    li.innerHTML = `
      <div class="cart-item-img">${imgContent}</div>
      <div class="cart-item-info">
        <div class="cart-item-name" title="${escapeAttr(product.name)}">${escapeHtml(product.name)}</div>
        <div class="cart-item-price">${formatPrice(product.price * item.qty)}</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec" data-id="${escapeAttr(item.id)}" aria-label="Disminuir cantidad">−</button>
        <span class="qty-val">${item.qty}</span>
        <button class="qty-btn" data-action="inc" data-id="${escapeAttr(item.id)}" aria-label="Aumentar cantidad">+</button>
      </div>
      <button class="cart-item-remove" data-id="${escapeAttr(item.id)}" aria-label="Eliminar del carrito">🗑</button>
    `;

    cartItems.appendChild(li);
  });
}

// ===== CART OPEN/CLOSE =====
function openCart() {
  renderCartItems();
  cartSidebar.classList.add('open');
  cartOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  cartSidebar.classList.remove('open');
  cartOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ===== CHECKOUT MODAL =====
function openCheckoutModal() {
  closeCart();
  checkoutModal.classList.add('open');
  buyerNameInput.value = '';
  paymentTypeInput.value = '';
  buyerNameInput.focus();
}

function closeCheckoutModal() {
  checkoutModal.classList.remove('open');
}

function buildWhatsAppMessage(name, payment) {
  let msg = `Hola! 👋 Quisiera hacer un pedido:\n`;
  msg += `\n📦 *Mi pedido:*\n`;

  let grandTotal = 0;

  cart.forEach(item => {
    const product = allProducts.find(p => p.id === item.id);
    if (!product) return;
    const lineTotal = product.price * item.qty;
    grandTotal += lineTotal;
    const pricePerUnit = formatPrice(product.price);
    const lineTotalFmt = formatPrice(lineTotal);

    if (item.qty > 1) {
      msg += `• ${item.qty}x ${product.name} (${item.qty} × ${pricePerUnit}) = ${lineTotalFmt}\n`;
    } else {
      msg += `• 1x ${product.name} = ${pricePerUnit}\n`;
    }
  });

  msg += `\n💰 *Total: ${formatPrice(grandTotal)}*`;
  msg += `\n💳 *Forma de pago: ${payment}*`;
  msg += `\n👤 *Nombre: ${name}*`;
  msg += `\n\n⚠️ _Recordá que el pago se realiza ANTES de recibir los productos._`;

  return msg;
}

function sendWhatsApp() {
  const name    = buyerNameInput.value.trim();
  const payment = paymentTypeInput.value;

  if (!name) {
    buyerNameInput.focus();
    showToast('Por favor ingresá tu nombre.', 'error');
    return;
  }
  if (!payment) {
    paymentTypeInput.focus();
    showToast('Por favor elegí una forma de pago.', 'error');
    return;
  }

  const waNumber = getWaNumber();
  if (!waNumber) {
    showToast('⚠️ El número de WhatsApp aún no fue configurado. Contactate con la administradora.', 'error');
    return;
  }

  const message = buildWhatsAppMessage(name, payment);
  const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

  // Clear cart after sending
  cart = [];
  saveCart(cart);
  updateCartUI();
  closeCheckoutModal();
  showToast('¡Pedido enviado! Redirigiendo a WhatsApp... 📲', 'success');

  window.open(url, '_blank', 'noopener,noreferrer');
}

// ===== TOAST =====
function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ===== HELPERS =====
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

// ===== LISTEN TO STORAGE CHANGES (admin updates products) =====
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY_PRODUCTS) {
    allProducts = loadProducts();
    renderFilters(allProducts);
    renderProducts(activeFilter);
    updateCartUI();
  }
});

// ===== EVENT LISTENERS =====

// Filter buttons
filtersContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  activeFilter = btn.dataset.category;
  filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts(activeFilter);
});

// Add to cart
productGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-add');
  if (!btn || btn.disabled) return;
  addToCart(btn.dataset.id);
});

// Cart open
cartToggleBtn.addEventListener('click', openCart);
cartOverlay.addEventListener('click', closeCart);
cartCloseBtn.addEventListener('click', closeCart);

// Cart item controls
cartItems.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    const delta = btn.dataset.action === 'inc' ? 1 : -1;
    changeQty(btn.dataset.id, delta);
    return;
  }
  const rem = e.target.closest('.cart-item-remove');
  if (rem) {
    removeFromCart(rem.dataset.id);
  }
});

// WhatsApp button in cart
btnWhatsapp.addEventListener('click', openCheckoutModal);

// Checkout modal close
checkoutClose.addEventListener('click', closeCheckoutModal);
checkoutCancel.addEventListener('click', closeCheckoutModal);
checkoutModal.addEventListener('click', (e) => {
  if (e.target === checkoutModal) closeCheckoutModal();
});

// Send WhatsApp
btnSendWhatsapp.addEventListener('click', sendWhatsApp);

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCart();
    closeCheckoutModal();
  }
});

// ===== INIT =====
(function init() {
  allProducts = loadProducts();
  cart        = loadCart();
  renderFilters(allProducts);
  renderProducts('all');
  updateCartUI();
})();
