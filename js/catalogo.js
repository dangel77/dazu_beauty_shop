/* =====================================================================
   catalogo.js  –  Dazu Beauty Shop
   Reads products from data/products.json (served by GitHub Pages).
   Cart stays in localStorage (per-user, per-browser).
   ===================================================================== */

'use strict';

// ===== CART (localStorage) =====
var CART_KEY = 'dazu_cart';

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch (_) { return []; }
}
function saveCart(c) {
  localStorage.setItem(CART_KEY, JSON.stringify(c));
}

// ===== STATE =====
var allProducts  = [];
var cart          = loadCart();
var activeFilter  = 'all';
var waNumber      = '';

// ===== DOM =====
var productGrid      = document.getElementById('productGrid');
var filtersContainer = document.getElementById('filtersContainer');
var cartOverlay      = document.getElementById('cartOverlay');
var cartSidebar      = document.getElementById('cartSidebar');
var cartCloseBtn     = document.getElementById('cartCloseBtn');
var cartToggleBtn    = document.getElementById('cartToggleBtn');
var cartCount        = document.getElementById('cartCount');
var cartItems        = document.getElementById('cartItems');
var cartTotal        = document.getElementById('cartTotal');
var btnWhatsapp      = document.getElementById('btnWhatsapp');
var checkoutModal    = document.getElementById('checkoutModal');
var checkoutClose    = document.getElementById('checkoutClose');
var checkoutCancel   = document.getElementById('checkoutCancel');
var btnSendWhatsapp  = document.getElementById('btnSendWhatsapp');
var buyerNameInput   = document.getElementById('buyerName');
var paymentTypeInput = document.getElementById('paymentType');

// Product detail modal
var productDetailModal       = document.getElementById('productDetailModal');
var productDetailClose       = document.getElementById('productDetailClose');
var productDetailImg         = document.getElementById('productDetailImg');
var productDetailPlaceholder = document.getElementById('productDetailPlaceholder');
var productDetailCategory    = document.getElementById('productDetailCategory');
var productDetailName        = document.getElementById('productDetailName');
var productDetailDesc        = document.getElementById('productDetailDesc');
var productDetailPrice       = document.getElementById('productDetailPrice');
var productDetailBadges      = document.getElementById('productDetailBadges');
var productDetailAdd         = document.getElementById('productDetailAdd');
var currentDetailProductId   = null;

// ===== LOAD PRODUCTS FROM JSON =====
function loadProducts() {
  productGrid.innerHTML =
    '<div class="empty-catalog"><span>⏳</span><p>Cargando productos...</p></div>';

  return fetch('data/products.json?v=' + Date.now())
    .then(function (res) {
      if (!res.ok) throw new Error('No se pudo cargar');
      return res.json();
    })
    .then(function (data) {
      allProducts = data.products || [];
      waNumber    = (data.settings && data.settings.wa_number) || '';
      renderFilters();
      renderProducts(activeFilter);
      updateCartUI();
    })
    .catch(function () {
      productGrid.innerHTML =
        '<div class="empty-catalog"><span>⚠️</span><p>Error cargando productos. Intenta de nuevo.</p></div>';
    });
}

// ===== CATEGORIES =====
function getCategories() {
  var cats = [];
  allProducts.forEach(function (p) {
    if (p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
  });
  return cats.sort();
}

function renderFilters() {
  var existing = filtersContainer.querySelectorAll('[data-category]:not([data-category="all"])');
  existing.forEach(function (el) { el.remove(); });

  getCategories().forEach(function (cat) {
    var count = allProducts.filter(function (p) { return p.category === cat && p.available; }).length;
    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat;
    btn.textContent = cat + (count > 0 ? ' (' + count + ')' : '');
    filtersContainer.appendChild(btn);
  });

  // Update "Todos" button count too
  var allBtn = filtersContainer.querySelector('[data-category="all"]');
  if (allBtn) {
    var totalAvailable = allProducts.filter(function (p) { return p.available; }).length;
    allBtn.textContent = 'Todos' + (totalAvailable > 0 ? ' (' + totalAvailable + ')' : '');
  }
}

// ===== PRODUCT RENDERING =====
function buildProductCard(product) {
  var card = document.createElement('article');
  card.className = 'product-card fade-in';
  card.dataset.id = product.id;

  var imgSrc = product.image ? 'data/images/' + encodeURIComponent(product.image) : '';
  var imgContent = imgSrc
    ? '<img src="' + escapeAttr(imgSrc) + '" alt="' + escapeAttr(product.name) + '" loading="lazy" />'
    : '<div class="product-placeholder">' + getCategoryEmoji(product.category) + '</div>';

  var badgeHtml = product.available
    ? '<span class="badge-available">Disponible</span>'
    : '<span class="badge-unavailable">Sin stock</span>';

  var isNew = product.created_at && (Date.now() - new Date(product.created_at).getTime() < 14 * 24 * 60 * 60 * 1000);
  var newBadgeHtml = isNew ? '<span class="badge-new">✨ Nuevo</span>' : '';

  var catHtml = product.category
    ? '<p class="product-category">' + escapeHtml(product.category) + '</p>'
    : '';

  var descHtml = product.description
    ? '<p class="product-desc">' + escapeHtml(product.description) + '</p>'
    : '';

  var addBtn = product.available
    ? '<button class="btn-add" data-id="' + escapeAttr(product.id) + '"><span>🛒</span> Agregar al carrito</button>'
    : '<button class="btn-add" disabled>Sin stock</button>';

  card.innerHTML =
    '<div class="product-img-wrap">' + imgContent + badgeHtml + newBadgeHtml + '</div>' +
    '<div class="product-body">' +
      catHtml +
      '<h3 class="product-name">' + escapeHtml(product.name) + '</h3>' +
      descHtml +
      '<p class="product-price">' + formatPrice(product.price) + '</p>' +
      addBtn +
    '</div>';

  return card;
}

function renderProducts(filter) {
  var filtered = filter === 'all'
    ? allProducts
    : allProducts.filter(function (p) { return p.category === filter; });

  productGrid.innerHTML = '';

  if (filtered.length === 0) {
    productGrid.innerHTML =
      '<div class="empty-catalog"><span>🛍️</span><p>No hay productos en esta categoria todavia.</p></div>';
    return;
  }

  filtered.forEach(function (product, index) {
    var card = buildProductCard(product);
    card.style.animationDelay = (index * 0.08) + 's';
    productGrid.appendChild(card);
  });
}

// ===== CART =====
function getCartTotal() {
  return cart.reduce(function (sum, item) {
    var product = allProducts.find(function (p) { return p.id === item.id; });
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
}

function getTotalItems() {
  return cart.reduce(function (s, i) { return s + i.qty; }, 0);
}

function addToCart(productId) {
  var product = allProducts.find(function (p) { return p.id === productId; });
  if (!product || !product.available) return;

  var existing = cart.find(function (i) { return i.id === productId; });
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: productId, qty: 1 });
  }
  saveCart(cart);
  updateCartUI();
  showToast(product.name + ' agregado al carrito', 'success');

  cartCount.classList.remove('bump');
  void cartCount.offsetWidth;
  cartCount.classList.add('bump');
}

function removeFromCart(productId) {
  cart = cart.filter(function (i) { return i.id !== productId; });
  saveCart(cart);
  updateCartUI();
  renderCartItems();
}

function changeQty(productId, delta) {
  var item = cart.find(function (i) { return i.id === productId; });
  if (!item) return;
  var newQty = item.qty + delta;
  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }
  item.qty = newQty;
  saveCart(cart);
  updateCartUI();
  renderCartItems();
}

function updateCartUI() {
  var total = getTotalItems();
  cartCount.textContent = total;
  cartCount.style.display = total > 0 ? 'flex' : 'none';
  cartTotal.textContent = formatPrice(getCartTotal());
  btnWhatsapp.disabled = cart.length === 0;
}

function renderCartItems() {
  if (cart.length === 0) {
    cartItems.innerHTML = '<div class="cart-empty"><span>🛍️</span><p>Tu carrito esta vacio</p></div>';
    return;
  }

  cartItems.innerHTML = '';
  cart.forEach(function (item) {
    var product = allProducts.find(function (p) { return p.id === item.id; });
    if (!product) return;

    var li = document.createElement('div');
    li.className = 'cart-item';

    var imgSrc = product.image ? 'data/images/' + encodeURIComponent(product.image) : '';
    var imgContent = imgSrc
      ? '<img src="' + escapeAttr(imgSrc) + '" alt="' + escapeAttr(product.name) + '" />'
      : getCategoryEmoji(product.category);

    li.innerHTML =
      '<div class="cart-item-img">' + imgContent + '</div>' +
      '<div class="cart-item-info">' +
        '<div class="cart-item-name" title="' + escapeAttr(product.name) + '">' + escapeHtml(product.name) + '</div>' +
        '<div class="cart-item-price">' + formatPrice(product.price * item.qty) + '</div>' +
      '</div>' +
      '<div class="cart-item-controls">' +
        '<button class="qty-btn" data-action="dec" data-id="' + escapeAttr(item.id) + '">−</button>' +
        '<span class="qty-val">' + item.qty + '</span>' +
        '<button class="qty-btn" data-action="inc" data-id="' + escapeAttr(item.id) + '">+</button>' +
      '</div>' +
      '<button class="cart-item-remove" data-id="' + escapeAttr(item.id) + '">🗑</button>';

    cartItems.appendChild(li);
  });
}

// ===== CART SIDEBAR =====
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

// ===== CHECKOUT =====
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

// ===== PRODUCT DETAIL MODAL =====
function openProductDetail(product) {
  var imgSrc = product.image ? 'data/images/' + encodeURIComponent(product.image) : '';

  if (imgSrc) {
    productDetailImg.src = imgSrc;
    productDetailImg.alt = escapeAttr(product.name);
    productDetailImg.style.display = 'block';
    productDetailPlaceholder.style.display = 'none';
  } else {
    productDetailImg.style.display = 'none';
    productDetailPlaceholder.textContent = getCategoryEmoji(product.category);
    productDetailPlaceholder.style.display = 'flex';
  }

  productDetailCategory.textContent = product.category || '';
  productDetailName.textContent = product.name;
  productDetailDesc.textContent = product.description || '';
  productDetailPrice.textContent = formatPrice(product.price);

  var badgesHtml = product.available
    ? '<span class="badge-available">Disponible</span>'
    : '<span class="badge-unavailable">Sin stock</span>';
  var isNew = product.created_at && (Date.now() - new Date(product.created_at).getTime() < 14 * 24 * 60 * 60 * 1000);
  if (isNew) badgesHtml += '<span class="badge-new">✨ Nuevo</span>';
  productDetailBadges.innerHTML = badgesHtml;

  if (product.available) {
    productDetailAdd.disabled = false;
    productDetailAdd.innerHTML = '<span>🛒</span> Agregar al carrito';
  } else {
    productDetailAdd.disabled = true;
    productDetailAdd.textContent = 'Sin stock';
  }

  currentDetailProductId = product.id;
  productDetailModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductDetail() {
  productDetailModal.classList.remove('open');
  document.body.style.overflow = '';
  currentDetailProductId = null;
}

function buildWhatsAppMessage(name, payment) {
  var msg = 'Hola! Quisiera hacer un pedido:\n\n*Mi pedido:*\n';
  var grandTotal = 0;

  cart.forEach(function (item) {
    var product = allProducts.find(function (p) { return p.id === item.id; });
    if (!product) return;
    var lineTotal = product.price * item.qty;
    grandTotal += lineTotal;

    if (item.qty > 1) {
      msg += '• ' + item.qty + 'x ' + product.name + ' (' + item.qty + ' x ' + formatPrice(product.price) + ') = ' + formatPrice(lineTotal) + '\n';
    } else {
      msg += '• 1x ' + product.name + ' = ' + formatPrice(product.price) + '\n';
    }
  });

  msg += '\n*Total: ' + formatPrice(grandTotal) + '*';
  msg += '\n*Forma de pago: ' + payment + '*';
  msg += '\n*Nombre: ' + name + '*';
  msg += '\n\n_Recorda que el pago se realiza ANTES de recibir los productos._';
  return msg;
}

function sendWhatsApp() {
  var name    = buyerNameInput.value.trim();
  var payment = paymentTypeInput.value;

  if (!name) {
    buyerNameInput.focus();
    showToast('Ingresa tu nombre.', 'error');
    return;
  }
  if (!payment) {
    paymentTypeInput.focus();
    showToast('Elegi una forma de pago.', 'error');
    return;
  }
  if (!waNumber) {
    showToast('El numero de WhatsApp aun no fue configurado.', 'error');
    return;
  }

  var message = buildWhatsAppMessage(name, payment);
  var url = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message);

  cart = [];
  saveCart(cart);
  updateCartUI();
  closeCheckoutModal();
  showToast('Redirigiendo a WhatsApp...', 'success');
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ===== EVENT LISTENERS =====

// Filters
filtersContainer.addEventListener('click', function (e) {
  var btn = e.target.closest('.filter-btn');
  if (!btn) return;
  activeFilter = btn.dataset.category;
  filtersContainer.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderProducts(activeFilter);
});

// Add to cart (btn-add click)
productGrid.addEventListener('click', function (e) {
  var btn = e.target.closest('.btn-add');
  if (btn) {
    if (!btn.disabled) addToCart(btn.dataset.id);
    return;
  }
  // Any other click on the card → open detail modal
  var card = e.target.closest('.product-card');
  if (!card) return;
  var product = allProducts.find(function (p) { return p.id === card.dataset.id; });
  if (product) openProductDetail(product);
});

// Cart
cartToggleBtn.addEventListener('click', openCart);
cartOverlay.addEventListener('click', closeCart);
cartCloseBtn.addEventListener('click', closeCart);

cartItems.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-action]');
  if (btn) {
    changeQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1);
    return;
  }
  var rem = e.target.closest('.cart-item-remove');
  if (rem) removeFromCart(rem.dataset.id);
});

// Checkout
btnWhatsapp.addEventListener('click', openCheckoutModal);
checkoutClose.addEventListener('click', closeCheckoutModal);
checkoutCancel.addEventListener('click', closeCheckoutModal);
checkoutModal.addEventListener('click', function (e) {
  if (e.target === checkoutModal) closeCheckoutModal();
});
btnSendWhatsapp.addEventListener('click', sendWhatsApp);

// Product detail modal
productDetailClose.addEventListener('click', closeProductDetail);
productDetailModal.addEventListener('click', function (e) {
  if (e.target === productDetailModal) closeProductDetail();
});
productDetailAdd.addEventListener('click', function () {
  if (currentDetailProductId) {
    addToCart(currentDetailProductId);
    closeProductDetail();
  }
});

// Escape
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeCart();
    closeCheckoutModal();
    closeProductDetail();
  }
});

// ===== INIT =====
loadProducts();
