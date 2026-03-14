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
var allProducts          = [];
var cart                  = loadCart();
var activeFilter          = 'all';
var waNumber              = '';
var searchQuery           = '';
var searchDebounceTimer   = null;
var currentDetailProductId = null;
var currentDetailVariant   = null;
var _catalogScrollY       = 0;   // saved scroll position for iOS scroll lock
var _carouselImages       = [];  // images array for the currently open product detail
var _carouselIndex        = 0;   // current slide index
var _carouselTouchStartX  = 0;   // touch start X for swipe detection

// ===== SCROLL LOCK (iOS Safari compatible) =====
function _preventCatalogBgScroll(e) {
  var target = e.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    return;
  }
  var scrollableParent = target
    ? (target.closest('.modal-body') || target.closest('.cart-items') || target.closest('.product-detail-content'))
    : null;
  if (!scrollableParent) {
    e.preventDefault();
    return;
  }
  var atTop    = scrollableParent.scrollTop <= 0;
  var atBottom = scrollableParent.scrollTop + scrollableParent.clientHeight >= scrollableParent.scrollHeight - 1;
  if (e.touches && e.touches[0]) {
    var dy = e.touches[0].clientY - (scrollableParent._lastTouchY || e.touches[0].clientY);
    if ((atTop && dy > 0) || (atBottom && dy < 0)) {
      e.preventDefault();
    }
  }
}

function _trackCatalogTouchStart(e) {
  var scrollable = e.target.closest('.modal-body') || e.target.closest('.cart-items') || e.target.closest('.product-detail-content');
  if (scrollable && e.touches && e.touches[0]) {
    scrollable._lastTouchY = e.touches[0].clientY;
  }
}

function lockCatalogBodyScroll() {
  _catalogScrollY = window.scrollY;
  document.body.style.top = '-' + _catalogScrollY + 'px';
  document.body.classList.add('modal-open');
  document.addEventListener('touchstart', _trackCatalogTouchStart, { passive: true });
  document.addEventListener('touchmove', _preventCatalogBgScroll, { passive: false });
}

function unlockCatalogBodyScroll() {
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, _catalogScrollY);
  document.removeEventListener('touchstart', _trackCatalogTouchStart);
  document.removeEventListener('touchmove', _preventCatalogBgScroll);
}

// ===== CONSTANTS =====
var NEW_PRODUCT_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

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

function isNewProduct(product) {
  return product.created_at &&
    (Date.now() - new Date(product.created_at).getTime() < NEW_PRODUCT_MS);
}

// ===== DOM =====
var productGrid         = document.getElementById('productGrid');
var filtersContainer    = document.getElementById('filtersContainer');
var allFilterBtn        = document.getElementById('allFilterBtn');
var btnCategoriesToggle = document.getElementById('btnCategoriesToggle');
var categoryPanel       = document.getElementById('categoryPanel');
var cartOverlay         = document.getElementById('cartOverlay');
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

// Search bar
var searchInput    = document.getElementById('searchInput');
var searchClearBtn = document.getElementById('searchClearBtn');

// Scroll-to-top button
var scrollTopBtn = document.getElementById('scrollTopBtn');

// Product detail modal
var productDetailModal       = document.getElementById('productDetailModal');
var productDetailClose       = document.getElementById('productDetailClose');
var productDetailCarousel    = document.getElementById('productDetailCarousel');
var carouselTrack            = document.getElementById('carouselTrack');
var carouselPrev             = document.getElementById('carouselPrev');
var carouselNext             = document.getElementById('carouselNext');
var carouselDots             = document.getElementById('carouselDots');
var productDetailPlaceholder = document.getElementById('productDetailPlaceholder');
var productDetailCategory    = document.getElementById('productDetailCategory');
var productDetailName        = document.getElementById('productDetailName');
var productDetailDesc        = document.getElementById('productDetailDesc');
var productDetailPrice       = document.getElementById('productDetailPrice');
var productDetailBadges      = document.getElementById('productDetailBadges');
var productDetailAdd         = document.getElementById('productDetailAdd');
var productDetailVariants    = document.getElementById('productDetailVariants');
var variantsList             = document.getElementById('variantsList');

// ===== LOAD PRODUCTS FROM JSON =====
function loadProducts() {
  // Show skeleton loaders while fetching
  var skeletonHtml = '';
  for (var i = 0; i < 6; i++) {
    skeletonHtml +=
      '<div class="product-card skeleton-card">' +
        '<div class="skeleton-img"></div>' +
        '<div class="skeleton-body">' +
          '<div class="skeleton-line short"></div>' +
          '<div class="skeleton-line"></div>' +
          '<div class="skeleton-line medium"></div>' +
          '<div class="skeleton-line short"></div>' +
        '</div>' +
      '</div>';
  }
  productGrid.innerHTML = skeletonHtml;

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
      // Update floating WhatsApp button href
      var waFloatBtn = document.getElementById('waFloatBtn');
      if (waFloatBtn && waNumber) {
        waFloatBtn.href = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent('Hola! Vi tu catálogo de Dazu Beauty Shop 💖');
      }
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
    getProductCategories(p).forEach(function (cat) {
      if (cat && cats.indexOf(cat) === -1) cats.push(cat);
    });
  });
  return cats.sort();
}

function renderFilters() {
  // Remove previous "Lo Nuevo" button if exists
  var existingNew = document.getElementById('newFilterBtn');
  if (existingNew) existingNew.remove();

  categoryPanel.innerHTML = '';

  getCategories().forEach(function (cat) {
    var count = allProducts.filter(function (p) {
      return getProductCategories(p).indexOf(cat) !== -1 && p.available;
    }).length;
    var btn = document.createElement('button');
    btn.className = 'category-panel-btn';
    btn.dataset.category = cat;
    btn.textContent = getCategoryEmoji(cat) + ' ' + cat + (count > 0 ? ' (' + count + ')' : '');
    categoryPanel.appendChild(btn);
  });

  // Update "Todos" button count
  var totalAvailable = allProducts.filter(function (p) { return p.available; }).length;
  allFilterBtn.textContent = 'Todos' + (totalAvailable > 0 ? ' (' + totalAvailable + ')' : '');

  // Add "Lo Nuevo" button if there are new products
  var hasNew = allProducts.some(function (p) { return p.available && isNewProduct(p); });
  if (hasNew) {
    var newBtn = document.createElement('button');
    newBtn.id = 'newFilterBtn';
    newBtn.className = 'filter-btn';
    newBtn.dataset.category = '__new__';
    newBtn.textContent = '✨ Lo Nuevo';
    filtersContainer.insertBefore(newBtn, btnCategoriesToggle);
  }
}

// ===== PRODUCT RENDERING =====
function buildProductCard(product) {
  var card = document.createElement('article');
  card.className = 'product-card fade-in';
  card.dataset.id = product.id;

  var imgs = getProductImages(product);
  var imgSrc = imgs.length > 0 ? 'data/images/' + encodeURIComponent(imgs[0]) : '';
  var firstCat = getProductCategories(product)[0] || '';
  var imgContent = imgSrc
    ? '<img src="' + escapeAttr(imgSrc) + '" alt="' + escapeAttr(product.name) + '" loading="lazy" />'
    : '<div class="product-placeholder">' + getCategoryEmoji(firstCat) + '</div>';

  var badgeHtml = product.available
    ? '<span class="badge-available">Disponible</span>'
    : '<span class="badge-unavailable">Sin stock</span>';

  var newBadgeHtml = isNewProduct(product) ? '<span class="badge-new">✨ Nuevo</span>' : '';

  var productCats = getProductCategories(product);
  var catHtml = productCats.length > 0
    ? '<p class="product-category">' + productCats.map(escapeHtml).join(' · ') + '</p>'
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
  var filtered;

  if (filter === '__new__') {
    filtered = allProducts.filter(function (p) { return p.available && isNewProduct(p); });
  } else if (filter === 'all') {
    filtered = allProducts;
  } else {
    filtered = allProducts.filter(function (p) {
      return getProductCategories(p).indexOf(filter) !== -1;
    });
  }

  // Apply search filter on top
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    filtered = filtered.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) !== -1 ||
        (p.description && p.description.toLowerCase().indexOf(q) !== -1);
    });
  }

  productGrid.innerHTML = '';

  if (filtered.length === 0) {
    var emptyIcon, emptyMsg, emptySub;
    if (searchQuery) {
      emptyIcon = '🔍';
      emptyMsg  = 'No encontramos "' + escapeHtml(searchQuery) + '"';
      emptySub  = '¿Probás con otro nombre o categoría?';
    } else if (filter === '__new__') {
      emptyIcon = '✨';
      emptyMsg  = 'No hay productos nuevos por ahora';
      emptySub  = 'Volvé pronto, ¡siempre llegan novedades!';
    } else if (filter !== 'all') {
      emptyIcon = '🏷️';
      emptyMsg  = 'No hay productos en esta categoría todavía';
      emptySub  = 'Mirá las otras categorías o explorá todo el catálogo.';
    } else {
      emptyIcon = '🛍️';
      emptyMsg  = 'No hay productos disponibles';
      emptySub  = '';
    }
    productGrid.innerHTML =
      '<div class="empty-catalog">' +
        '<span>' + emptyIcon + '</span>' +
        '<p>' + emptyMsg + '</p>' +
        (emptySub ? '<p class="empty-catalog-sub">' + escapeHtml(emptySub) + '</p>' : '') +
      '</div>';
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

function addToCart(productId, variantName) {
  var product = allProducts.find(function (p) { return p.id === productId; });
  if (!product || !product.available) return;

  var variant = variantName || undefined;

  var existing = cart.find(function (i) {
    return i.id === productId && (i.variant || undefined) === variant;
  });

  if (existing) {
    existing.qty += 1;
  } else {
    var item = { id: productId, qty: 1 };
    if (variant) item.variant = variant;
    cart.push(item);
  }

  saveCart(cart);
  updateCartUI();

  var toastMsg = product.name;
  if (variant) toastMsg += ' — ' + variant;
  showToast(toastMsg + ' agregado al carrito', 'success');

  cartCount.classList.remove('bump');
  void cartCount.offsetWidth;
  cartCount.classList.add('bump');
}

function removeFromCart(productId, variantName) {
  var variant = variantName || undefined;
  cart = cart.filter(function (i) {
    return !(i.id === productId && (i.variant || undefined) === variant);
  });
  saveCart(cart);
  updateCartUI();
  renderCartItems();
}

function changeQty(productId, delta, variantName) {
  var variant = variantName || undefined;
  var item = cart.find(function (i) {
    return i.id === productId && (i.variant || undefined) === variant;
  });
  if (!item) return;
  var newQty = item.qty + delta;
  if (newQty <= 0) {
    removeFromCart(productId, variantName);
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

    var imgSrc = getProductImages(product).length > 0 ? 'data/images/' + encodeURIComponent(getProductImages(product)[0]) : '';
    var imgContent = imgSrc
      ? '<img src="' + escapeAttr(imgSrc) + '" alt="' + escapeAttr(product.name) + '" />'
      : getCategoryEmoji(getProductCategories(product)[0] || '');

    var variantAttr = item.variant ? ' data-variant="' + escapeAttr(item.variant) + '"' : '';
    var variantLine = item.variant
      ? '<div class="cart-item-variant">— ' + escapeHtml(item.variant) + '</div>'
      : '';

    li.innerHTML =
      '<div class="cart-item-img">' + imgContent + '</div>' +
      '<div class="cart-item-info">' +
        '<div class="cart-item-name" title="' + escapeAttr(product.name) + '">' + escapeHtml(product.name) + '</div>' +
        variantLine +
        '<div class="cart-item-price">' + formatPrice(product.price * item.qty) + '</div>' +
      '</div>' +
      '<div class="cart-item-controls">' +
        '<button class="qty-btn" data-action="dec" data-id="' + escapeAttr(item.id) + '"' + variantAttr + '>−</button>' +
        '<span class="qty-val">' + item.qty + '</span>' +
        '<button class="qty-btn" data-action="inc" data-id="' + escapeAttr(item.id) + '"' + variantAttr + '>+</button>' +
      '</div>' +
      '<button class="cart-item-remove" data-id="' + escapeAttr(item.id) + '"' + variantAttr + '>🗑</button>';

    cartItems.appendChild(li);
  });
}

// ===== CART SIDEBAR =====
function openCart() {
  renderCartItems();
  cartSidebar.classList.add('open');
  cartOverlay.classList.add('open');
  lockCatalogBodyScroll();
}

function closeCart() {
  cartSidebar.classList.remove('open');
  cartOverlay.classList.remove('open');
  unlockCatalogBodyScroll();
}

// ===== CHECKOUT =====
function openCheckoutModal() {
  // Close cart elements without unlocking body (body stays locked for checkout)
  cartSidebar.classList.remove('open');
  cartOverlay.classList.remove('open');
  checkoutModal.classList.add('open');
  buyerNameInput.value = localStorage.getItem('dazu_buyer_name') || '';
  paymentTypeInput.value = '';
  buyerNameInput.focus();
}

function closeCheckoutModal() {
  checkoutModal.classList.remove('open');
  unlockCatalogBodyScroll();
}

// ===== PRODUCT DETAIL MODAL =====
function renderVariantChips(product) {
  var variants = product.variants;
  if (!variants || variants.length === 0) {
    productDetailVariants.style.display = 'none';
    currentDetailVariant = null;
    return;
  }

  productDetailVariants.style.display = 'block';
  variantsList.innerHTML = '';
  currentDetailVariant = null;

  // Disable add button until variant is selected
  productDetailAdd.disabled = true;

  variants.forEach(function (v) {
    var btn = document.createElement('button');
    btn.className = 'variant-chip';
    btn.textContent = v.name;
    if (!v.available) {
      btn.disabled = true;
      btn.title = 'No disponible';
    }
    btn.addEventListener('click', function () {
      // Deselect all
      variantsList.querySelectorAll('.variant-chip').forEach(function (c) {
        c.classList.remove('selected');
      });
      btn.classList.add('selected');
      currentDetailVariant = v.name;
      // Enable add button if product is available
      if (product.available) {
        productDetailAdd.disabled = false;
        productDetailAdd.innerHTML = '<span>🛒</span> Agregar al carrito';
      }
    });
    variantsList.appendChild(btn);
  });
}

function openProductDetail(product) {
  var images = getProductImages(product);

  // Build carousel or show placeholder
  if (images.length > 0) {
    _carouselImages = images;
    _carouselIndex  = 0;
    buildCarousel(product.name);
    productDetailCarousel.style.display = 'block';
    productDetailPlaceholder.style.display = 'none';
  } else {
    _carouselImages = [];
    _carouselIndex  = 0;
    productDetailCarousel.style.display = 'none';
    productDetailPlaceholder.textContent = getCategoryEmoji(getProductCategories(product)[0] || '');
    productDetailPlaceholder.style.display = 'flex';
  }

  var productCats = getProductCategories(product);
  productDetailCategory.textContent = productCats.join(' · ');
  productDetailName.textContent = product.name;
  productDetailDesc.textContent = product.description || '';
  productDetailPrice.textContent = formatPrice(product.price);

  var badgesHtml = product.available
    ? '<span class="badge-available">Disponible</span>'
    : '<span class="badge-unavailable">Sin stock</span>';
  if (isNewProduct(product)) badgesHtml += '<span class="badge-new">✨ Nuevo</span>';
  productDetailBadges.innerHTML = badgesHtml;

  // Render variant chips (also controls add button enabled state)
  renderVariantChips(product);

  // Set add button state (override if no variants or unavailable)
  if (!product.available) {
    productDetailAdd.disabled = true;
    productDetailAdd.textContent = 'Sin stock';
  } else if (!product.variants || product.variants.length === 0) {
    // No variants: button enabled immediately
    productDetailAdd.disabled = false;
    productDetailAdd.innerHTML = '<span>🛒</span> Agregar al carrito';
  }
  // If has variants: button stays disabled until chip selected (handled in renderVariantChips)

  currentDetailProductId = product.id;
  productDetailModal.classList.add('open');
  lockCatalogBodyScroll();
}

// ===== CAROUSEL =====
function buildCarousel(altText) {
  carouselTrack.innerHTML = '';
  carouselDots.innerHTML  = '';

  _carouselImages.forEach(function (name, idx) {
    var slide = document.createElement('div');
    slide.className = 'carousel-slide';
    var img = document.createElement('img');
    img.src = 'data/images/' + encodeURIComponent(name);
    img.alt = escapeAttr(altText || '') + ' ' + (idx + 1);
    img.className = 'product-detail-img';
    img.loading = idx === 0 ? 'eager' : 'lazy';
    slide.appendChild(img);
    carouselTrack.appendChild(slide);
  });

  // Show/hide nav arrows
  var multipleImages = _carouselImages.length > 1;
  carouselPrev.style.display = multipleImages ? 'flex' : 'none';
  carouselNext.style.display = multipleImages ? 'flex' : 'none';

  // Build dots
  if (multipleImages) {
    _carouselImages.forEach(function (_, idx) {
      var dot = document.createElement('button');
      dot.className = 'carousel-dot' + (idx === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Imagen ' + (idx + 1));
      dot.dataset.idx = idx;
      carouselDots.appendChild(dot);
    });
  }

  goToSlide(0);
}

function goToSlide(idx) {
  if (_carouselImages.length === 0) return;
  _carouselIndex = Math.max(0, Math.min(idx, _carouselImages.length - 1));
  carouselTrack.style.transform = 'translateX(-' + (_carouselIndex * 100) + '%)';

  // Update dots
  carouselDots.querySelectorAll('.carousel-dot').forEach(function (dot, i) {
    dot.classList.toggle('active', i === _carouselIndex);
  });
}

function prevSlide() {
  if (_carouselImages.length <= 1) return;
  goToSlide(_carouselIndex > 0 ? _carouselIndex - 1 : _carouselImages.length - 1);
}

function nextSlide() {
  if (_carouselImages.length <= 1) return;
  goToSlide(_carouselIndex < _carouselImages.length - 1 ? _carouselIndex + 1 : 0);
}

function closeProductDetail() {
  productDetailModal.classList.remove('open');
  unlockCatalogBodyScroll();
  currentDetailProductId = null;
  currentDetailVariant = null;
}

function buildWhatsAppMessage(name, payment) {
  var msg = 'Hola! Quisiera hacer un pedido:\n\n*Mi pedido:*\n';
  var grandTotal = 0;

  cart.forEach(function (item) {
    var product = allProducts.find(function (p) { return p.id === item.id; });
    if (!product) return;
    var lineTotal = product.price * item.qty;
    grandTotal += lineTotal;

    var variantPart = item.variant ? ' (' + item.variant + ')' : '';

    if (item.qty > 1) {
      msg += '• ' + item.qty + 'x ' + product.name + variantPart +
        ' (' + item.qty + ' x ' + formatPrice(product.price) + ') = ' + formatPrice(lineTotal) + '\n';
    } else {
      msg += '• 1x ' + product.name + variantPart + ' = ' + formatPrice(product.price) + '\n';
    }
  });

  msg += '\n*Total: ' + formatPrice(grandTotal) + '*';
  msg += '\n*Forma de pago: ' + payment + '*';
  msg += '\n*Nombre: ' + name + '*';
  msg += '\n\n_Recorda que el pago se realiza ANTES de recibir los productos._';

  var origin = window.location.origin;
  if (origin && origin !== 'null') {
    msg += '\n\n📎 Catálogo: ' + origin + '/catalogo.html';
  }

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

  localStorage.setItem('dazu_buyer_name', name);

  var message = buildWhatsAppMessage(name, payment);
  var url = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message);

  cart = [];
  saveCart(cart);
  updateCartUI();
  closeCheckoutModal();
  showToast('Redirigiendo a WhatsApp...', 'success');
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ===== SEARCH =====
function handleSearch() {
  var val = searchInput.value.trim();
  searchQuery = val;
  searchClearBtn.classList.toggle('visible', val.length > 0);
  renderProducts(activeFilter);
}

function clearSearch() {
  searchInput.value = '';
  searchQuery = '';
  searchClearBtn.classList.remove('visible');
  renderProducts(activeFilter);
  searchInput.focus();
}

// ===== EVENT LISTENERS =====

// Search bar
searchInput.addEventListener('input', function () {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(handleSearch, 300);
});

searchClearBtn.addEventListener('click', clearSearch);

// Categories panel toggle
btnCategoriesToggle.addEventListener('click', function (e) {
  e.stopPropagation();
  var isOpen = categoryPanel.classList.toggle('open');
  btnCategoriesToggle.classList.toggle('active', isOpen);
  var arrow = btnCategoriesToggle.querySelector('.categories-arrow');
  if (arrow) arrow.textContent = isOpen ? '▴' : '▾';
});

// Close panel when clicking outside
document.addEventListener('click', function (e) {
  if (!e.target.closest('.catalog-filters-wrap')) {
    categoryPanel.classList.remove('open');
    btnCategoriesToggle.classList.remove('active');
    var arrow = btnCategoriesToggle.querySelector('.categories-arrow');
    if (arrow) arrow.textContent = '▾';
  }
});

// Helper: deactivate "Lo Nuevo" button if exists
function deactivateNewBtn() {
  var nb = document.getElementById('newFilterBtn');
  if (nb) nb.classList.remove('active');
}

// "Todos" filter button
filtersContainer.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-category="all"]');
  if (!btn) return;
  activeFilter = 'all';
  allFilterBtn.classList.add('active');
  deactivateNewBtn();
  btnCategoriesToggle.classList.remove('active', 'has-selection');
  btnCategoriesToggle.querySelector('.categories-icon').textContent = '🗂️';
  var arrow = btnCategoriesToggle.querySelector('.categories-arrow');
  if (arrow) arrow.textContent = '▾';
  categoryPanel.classList.remove('open');
  renderProducts(activeFilter);
});

// "Lo Nuevo" filter button (delegated from filtersContainer)
filtersContainer.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-category="__new__"]');
  if (!btn) return;
  activeFilter = '__new__';
  allFilterBtn.classList.remove('active');
  deactivateNewBtn();
  btn.classList.add('active');
  btnCategoriesToggle.classList.remove('active', 'has-selection');
  btnCategoriesToggle.querySelector('.categories-icon').textContent = '🗂️';
  var arrow = btnCategoriesToggle.querySelector('.categories-arrow');
  if (arrow) arrow.textContent = '▾';
  categoryPanel.classList.remove('open');
  renderProducts(activeFilter);
});

// Category panel button clicks
categoryPanel.addEventListener('click', function (e) {
  var btn = e.target.closest('.category-panel-btn');
  if (!btn) return;
  activeFilter = btn.dataset.category;
  allFilterBtn.classList.remove('active');
  deactivateNewBtn();
  categoryPanel.classList.remove('open');
  btnCategoriesToggle.classList.remove('active');
  btnCategoriesToggle.classList.add('has-selection');
  btnCategoriesToggle.querySelector('.categories-icon').textContent = getCategoryEmoji(activeFilter);
  var arrow = btnCategoriesToggle.querySelector('.categories-arrow');
  if (arrow) arrow.textContent = '▾';
  renderProducts(activeFilter);
});

// Add to cart (btn-add click on product card)
productGrid.addEventListener('click', function (e) {
  var btn = e.target.closest('.btn-add');
  if (btn) {
    if (!btn.disabled) {
      var product = allProducts.find(function (p) { return p.id === btn.dataset.id; });
      if (product) {
        // If product has variants, open detail modal instead
        if (product.variants && product.variants.length > 0) {
          openProductDetail(product);
        } else {
          addToCart(btn.dataset.id);
        }
      }
    }
    return;
  }
  // Any other click on the card → open detail modal
  var card = e.target.closest('.product-card');
  if (!card) return;
  var p = allProducts.find(function (pr) { return pr.id === card.dataset.id; });
  if (p) openProductDetail(p);
});

// Cart
cartToggleBtn.addEventListener('click', openCart);
cartOverlay.addEventListener('click', closeCart);
cartCloseBtn.addEventListener('click', closeCart);

cartItems.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-action]');
  if (btn) {
    changeQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1, btn.dataset.variant);
    return;
  }
  var rem = e.target.closest('.cart-item-remove');
  if (rem) removeFromCart(rem.dataset.id, rem.dataset.variant);
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
  if (currentDetailProductId && !productDetailAdd.disabled) {
    addToCart(currentDetailProductId, currentDetailVariant);
    closeProductDetail();
  }
});

// Carousel navigation
carouselPrev.addEventListener('click', prevSlide);
carouselNext.addEventListener('click', nextSlide);

carouselDots.addEventListener('click', function (e) {
  var dot = e.target.closest('.carousel-dot');
  if (!dot) return;
  var idx = parseInt(dot.dataset.idx, 10);
  if (!isNaN(idx)) goToSlide(idx);
});

// Carousel touch/swipe support
productDetailCarousel.addEventListener('touchstart', function (e) {
  if (e.touches && e.touches[0]) {
    _carouselTouchStartX = e.touches[0].clientX;
  }
}, { passive: true });

productDetailCarousel.addEventListener('touchend', function (e) {
  if (!e.changedTouches || !e.changedTouches[0]) return;
  var dx = e.changedTouches[0].clientX - _carouselTouchStartX;
  if (Math.abs(dx) > 40) {
    if (dx < 0) nextSlide();
    else prevSlide();
  }
}, { passive: true });

// Escape
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeCart();
    closeCheckoutModal();
    closeProductDetail();
  }
});

// ===== SCROLL-TO-TOP =====
if (scrollTopBtn) {
  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      scrollTopBtn.classList.add('visible');
    } else {
      scrollTopBtn.classList.remove('visible');
    }
  });
  scrollTopBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ===== INIT =====
loadProducts();
