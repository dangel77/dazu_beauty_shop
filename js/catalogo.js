/* =====================================================================
   catalogo.js  –  Dazu Beauty Shop
   Public catalog. Reads products from data/products.json (served by
   GitHub Pages). The cart stays in localStorage (per-user, per-browser)
   and the order is sent as a prefilled WhatsApp message.
   ===================================================================== */

'use strict';

// ===== STORAGE =====
var CART_KEY  = 'dazu_cart';
var BUYER_KEY = 'dazu_buyer';

function readStore(key, fallback) {
  try {
    var value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function loadCart() {
  var stored = readStore(CART_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(function (item) {
    return item && typeof item.id === 'string' && item.qty > 0;
  });
}

function saveCart() {
  writeStore(CART_KEY, cart);
}

// ===== CONSTANTS =====
var NEW_PRODUCT_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
var MAX_QTY        = 99;

// ===== STATE =====
var allProducts  = [];
var settings     = {};
var waNumber     = '';
var searchIndex  = {};            // product id -> normalized text to search in
var cart         = loadCart();    // [{ id, qty, variant? }]
var activeFilter = 'all';         // 'all' | '__new__' | category name
var searchQuery  = '';
var searchTimer  = null;
var detail       = { product: null, variant: null, qty: 1, images: [] };
var layers       = [];            // open sheets, bottom to top: 'product' | 'cart' | 'checkout'
var lastFocus    = null;          // element to give focus back to when every sheet closes

// ===== DOM =====
var toolbar        = document.getElementById('toolbar');
var searchInput    = document.getElementById('searchInput');
var searchClearBtn = document.getElementById('searchClearBtn');
var chips          = document.getElementById('chips');
var catalog        = document.getElementById('catalog');
var resultInfo     = document.getElementById('resultInfo');
var productGrid    = document.getElementById('productGrid');
var bannerText     = document.getElementById('bannerText');
var contactLink    = document.getElementById('contactLink');
var overlay        = document.getElementById('overlay');

// Cart
var cartOpenBtn   = document.getElementById('cartOpenBtn');
var cartCount     = document.getElementById('cartCount');
var cartBar       = document.getElementById('cartBar');
var cartBarBtn    = document.getElementById('cartBarBtn');
var cartBarCount  = document.getElementById('cartBarCount');
var cartBarTotal  = document.getElementById('cartBarTotal');
var cartSheet     = document.getElementById('cartSheet');
var cartList      = document.getElementById('cartList');
var cartEmpty     = document.getElementById('cartEmpty');
var cartFoot      = document.getElementById('cartFoot');
var cartTotal     = document.getElementById('cartTotal');
var cartContinue  = document.getElementById('cartContinue');

// Product sheet
var productSheet  = document.getElementById('productSheet');
var pdMedia       = document.getElementById('pdMedia');
var pdGallery     = document.getElementById('pdGallery');
var pdPrev        = document.getElementById('pdPrev');
var pdNext        = document.getElementById('pdNext');
var pdCaption     = document.getElementById('pdCaption');
var pdDots        = document.getElementById('pdDots');
var pdCats        = document.getElementById('pdCats');
var pdName        = document.getElementById('pdName');
var pdPrice       = document.getElementById('pdPrice');
var pdVariants    = document.getElementById('pdVariants');
var pdVariantList = document.getElementById('pdVariantList');
var pdDesc        = document.getElementById('pdDesc');
var pdAsk         = document.getElementById('pdAsk');
var pdShare       = document.getElementById('pdShare');
var pdStepper     = document.getElementById('pdStepper');
var pdQty         = document.getElementById('pdQty');
var pdAdd         = document.getElementById('pdAdd');

// Checkout sheet
var checkoutSheet  = document.getElementById('checkoutSheet');
var checkoutForm   = document.getElementById('checkoutForm');
var coSummary      = document.getElementById('coSummary');
var coName         = document.getElementById('coName');
var coDelivery     = document.getElementById('coDelivery');
var coAddressField = document.getElementById('coAddressField');
var coAddress      = document.getElementById('coAddress');
var coPayment      = document.getElementById('coPayment');
var coNote         = document.getElementById('coNote');
var coNotice       = document.getElementById('coNotice');
var coError        = document.getElementById('coError');
var coDone         = document.getElementById('coDone');
var coReopen       = document.getElementById('coReopen');
var coBack         = document.getElementById('coBack');

var SHEETS = { product: productSheet, cart: cartSheet, checkout: checkoutSheet };

// ===== HELPERS =====
function isNewProduct(product) {
  return product.created_at &&
    (Date.now() - new Date(product.created_at).getTime() < NEW_PRODUCT_MS);
}

function findProduct(id) {
  return allProducts.find(function (p) { return p.id === id; });
}

function findVariant(product, name) {
  if (!hasVariants(product)) return null;
  return product.variants.find(function (v) { return v.name === name; }) || null;
}

function productUrl(id) {
  return DAZU_CONFIG.SITE_URL + '#p=' + encodeURIComponent(id);
}

function waLink(text) {
  return 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(text);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise(function (resolve, reject) {
    var area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = document.execCommand('copy');
    area.remove();
    if (ok) resolve(); else reject(new Error('copy failed'));
  });
}

// ===== LOAD PRODUCTS FROM JSON =====
function renderSkeleton() {
  var html = '';
  for (var i = 0; i < 6; i++) {
    html +=
      '<div class="card skeleton" aria-hidden="true">' +
        '<div class="card-media"></div>' +
        '<div class="card-body">' +
          '<div class="sk-line"></div>' +
          '<div class="sk-line short"></div>' +
          '<div class="sk-line btn-like"></div>' +
        '</div>' +
      '</div>';
  }
  productGrid.innerHTML = html;
}

function loadProducts() {
  renderSkeleton();

  return fetch('data/products.json?v=' + Date.now())
    .then(function (res) {
      if (!res.ok) throw new Error('No se pudo cargar');
      return res.json();
    })
    .then(function (data) {
      allProducts = data.products || [];
      settings    = data.settings || {};
      waNumber    = settings.wa_number || '';

      searchIndex = {};
      allProducts.forEach(function (p) {
        var variantNames = hasVariants(p) ? p.variants.map(function (v) { return v.name; }) : [];
        searchIndex[p.id] = normalizeText(
          [p.name, p.description].concat(getProductCategories(p), variantNames).join(' ')
        );
      });

      // Drop cart lines whose product was deleted from the catalog
      cart = cart.filter(function (item) { return !!findProduct(item.id); });
      saveCart();

      applySettings();
      renderChips();
      renderProducts();
      updateCartUI();
      restoreLayers();
    })
    .catch(function () {
      productGrid.innerHTML =
        '<div class="empty">' +
          icon('bag') +
          '<strong>No pudimos cargar los productos</strong>' +
          '<p>Revisá tu conexión e intentá de nuevo.</p>' +
          '<button class="btn btn-primary" type="button" data-reload>Reintentar</button>' +
        '</div>';
    });
}

function applySettings() {
  var banner = getSetting(settings, 'banner_text').trim();
  bannerText.textContent = banner;
  bannerText.hidden = !banner;

  contactLink.hidden = !waNumber;
  if (waNumber) {
    contactLink.href = waLink('¡Hola! Vi el catálogo de Dazu Beauty Shop y tengo una consulta.');
  }
}

// ===== CATEGORIES =====
function getCategories() {
  var counts = {};
  allProducts.forEach(function (p) {
    getProductCategories(p).forEach(function (cat) {
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
  });
  return Object.keys(counts)
    .sort(function (a, b) { return a.localeCompare(b, 'es', { sensitivity: 'base' }); })
    .map(function (name) { return { name: name, count: counts[name] }; });
}

function chipHtml(filter, label, count) {
  return '<button class="chip" type="button" data-filter="' + escapeHtml(filter) + '">' +
    escapeHtml(label) + '<span class="chip-count">' + count + '</span></button>';
}

function renderChips() {
  var html = chipHtml('all', 'Todos', allProducts.length);

  var newCount = allProducts.filter(isNewProduct).length;
  if (newCount > 0) html += chipHtml('__new__', 'Lo nuevo', newCount);

  getCategories().forEach(function (cat) {
    html += chipHtml(cat.name, cat.name, cat.count);
  });

  chips.innerHTML = html;
  updateChipState();
}

function updateChipState() {
  chips.querySelectorAll('.chip').forEach(function (chip) {
    chip.setAttribute('aria-pressed', chip.dataset.filter === activeFilter ? 'true' : 'false');
  });
}

// Searching looks through the whole catalog, so a filter and a search are never active together.
function setFilter(filter) {
  activeFilter = filter;
  searchQuery = '';
  searchInput.value = '';
  searchClearBtn.hidden = true;
  updateChipState();
  renderProducts();
  scrollToResults();
}

function applySearch() {
  searchQuery = searchInput.value.trim();
  searchClearBtn.hidden = searchInput.value === '';
  if (searchQuery) activeFilter = 'all';
  updateChipState();
  renderProducts();
  scrollToResults();
}

// If the reader scrolled past the first row, bring the new results back into view
function scrollToResults() {
  var top = catalog.offsetTop - toolbar.offsetHeight;
  if (window.scrollY > top) window.scrollTo(0, top);
}

// ===== PRODUCT RENDERING =====
function getVisibleProducts() {
  if (searchQuery) {
    var words = normalizeText(searchQuery).split(/\s+/).filter(Boolean);
    return allProducts.filter(function (p) {
      return words.every(function (word) { return searchIndex[p.id].indexOf(word) !== -1; });
    });
  }
  if (activeFilter === '__new__') return allProducts.filter(isNewProduct);
  if (activeFilter === 'all') return allProducts;
  return allProducts.filter(function (p) {
    return getProductCategories(p).indexOf(activeFilter) !== -1;
  });
}

function cardActionHtml(product) {
  if (!product.available) {
    return '<button class="btn btn-block" type="button" disabled>Agotado</button>';
  }

  var qty = productQty(product.id);

  // The option (tone, size…) is chosen in the product sheet
  if (hasVariants(product)) {
    return '<button class="btn btn-primary btn-block" type="button" data-action="open">' +
      'Elegir opción' + (qty > 0 ? '<span class="btn-badge">' + qty + '</span>' : '') +
      '</button>';
  }

  if (qty > 0) {
    return '<div class="stepper stepper-block stepper-solid">' +
      '<button type="button" data-action="dec" aria-label="' + (qty === 1 ? 'Quitar del carrito' : 'Una unidad menos') + '">' +
        icon(qty === 1 ? 'trash' : 'minus') +
      '</button>' +
      '<span aria-live="polite">' + qty + '</span>' +
      '<button type="button" data-action="inc" aria-label="Una unidad más">' + icon('plus') + '</button>' +
    '</div>';
  }

  return '<button class="btn btn-primary btn-block" type="button" data-action="inc">' +
    icon('plus') + 'Agregar</button>';
}

function cardHtml(product, index) {
  var images  = getProductImages(product);
  var name    = escapeHtml(cleanName(product.name));
  var loading = index < 4 ? 'eager' : 'lazy';

  var media = images.length > 0
    ? thumbImg(images[0], 'media-bg', '', loading) +
      thumbImg(images[0], 'media-img', cleanName(product.name), loading)
    : '';

  var badge = '';
  if (!product.available) badge = '<span class="badge badge-out">Agotado</span>';
  else if (isNewProduct(product)) badge = '<span class="badge badge-new">Nuevo</span>';

  var photoCount = images.length > 1
    ? '<span class="media-count">' + icon('images') + images.length + '</span>'
    : '';

  return '<article class="card' + (product.available ? '' : ' is-out') + '" data-id="' + escapeHtml(product.id) + '">' +
    '<button class="card-media' + (media ? '' : ' no-img') + '" type="button" aria-label="Ver ' + name + '">' +
      media +
      '<span class="media-fallback">' + icon('bag') + '</span>' +
      badge + photoCount +
    '</button>' +
    '<div class="card-body">' +
      '<h3 class="card-name">' + name + '</h3>' +
      '<p class="card-desc">' + escapeHtml(product.description || '') + '</p>' +
      '<p class="card-price">' + formatPrice(product.price) + '</p>' +
      '<div class="card-action">' + cardActionHtml(product) + '</div>' +
    '</div>' +
  '</article>';
}

function emptyHtml() {
  var title, hint;
  if (searchQuery) {
    title = 'No encontramos “' + escapeHtml(searchQuery) + '”';
    hint  = 'Probá con otra palabra o mirá todo el catálogo.';
  } else if (activeFilter === 'all') {
    title = 'Todavía no hay productos';
    hint  = 'Volvé pronto, ¡siempre llegan novedades!';
  } else {
    title = 'No hay productos aquí por ahora';
    hint  = 'Mirá las otras categorías o todo el catálogo.';
  }

  var showAll = searchQuery || activeFilter !== 'all';
  return '<div class="empty">' +
    icon('search') +
    '<strong>' + title + '</strong>' +
    '<p>' + hint + '</p>' +
    (showAll ? '<button class="btn btn-soft" type="button" data-show-all>Ver todo el catálogo</button>' : '') +
  '</div>';
}

function renderProducts() {
  var visible = getVisibleProducts();

  if (searchQuery && visible.length > 0) {
    resultInfo.textContent = visible.length +
      (visible.length === 1 ? ' resultado' : ' resultados') + ' para “' + searchQuery + '”';
    resultInfo.hidden = false;
  } else {
    resultInfo.hidden = true;
  }

  productGrid.innerHTML = visible.length > 0 ? visible.map(cardHtml).join('') : emptyHtml();
}

function refreshCard(productId) {
  var product = findProduct(productId);
  if (!product) return;
  productGrid.querySelectorAll('.card').forEach(function (card) {
    if (card.dataset.id !== productId) return;
    card.querySelector('.card-action').innerHTML = cardActionHtml(product);
  });
}

// ===== CART =====
function findLine(id, variant) {
  return cart.find(function (item) {
    return item.id === id && (item.variant || null) === (variant || null);
  });
}

function productQty(id) {
  return cart.reduce(function (sum, item) {
    return item.id === id ? sum + item.qty : sum;
  }, 0);
}

// Cart lines with their product. `ok` is false when the product (or the chosen
// option) went out of stock after it was added, so it is left out of the order.
function cartLines() {
  var lines = [];
  cart.forEach(function (item) {
    var product = findProduct(item.id);
    if (!product) return;
    var variant = item.variant ? findVariant(product, item.variant) : null;
    var variantOk = !item.variant || (!!variant && variant.available !== false);
    lines.push({
      item: item,
      product: product,
      ok: !!product.available && variantOk,
      total: product.price * item.qty
    });
  });
  return lines;
}

function orderLines() {
  return cartLines().filter(function (line) { return line.ok; });
}

function getCartTotal() {
  return orderLines().reduce(function (sum, line) { return sum + line.total; }, 0);
}

function getTotalItems() {
  return cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
}

function setLineQty(id, variant, qty) {
  var line = findLine(id, variant);
  qty = Math.max(0, Math.min(MAX_QTY, qty));

  if (qty === 0) {
    cart = cart.filter(function (item) { return item !== line; });
  } else if (line) {
    line.qty = qty;
  } else {
    var item = { id: id, qty: qty };
    if (variant) item.variant = variant;
    cart.push(item);
  }

  saveCart();
  updateCartUI();
  refreshCard(id);
  if (layers.indexOf('cart') !== -1) renderCart();
}

function addToCart(id, variant, qty) {
  var line = findLine(id, variant);
  setLineQty(id, variant, (line ? line.qty : 0) + qty);

  cartCount.classList.remove('bump');
  void cartCount.offsetWidth;
  cartCount.classList.add('bump');
}

function updateCartUI() {
  var count = getTotalItems();
  cartCount.textContent = count;
  cartCount.hidden = count === 0;
  cartOpenBtn.setAttribute('aria-label',
    count > 0 ? 'Ver carrito, ' + count + (count === 1 ? ' producto' : ' productos') : 'Ver carrito');

  cartBarCount.textContent = count;
  cartBarTotal.textContent = formatPrice(getCartTotal());
  cartBar.classList.toggle('show', count > 0);
  document.body.classList.toggle('has-cart', count > 0);
}

function cartItemHtml(line, index) {
  var product = line.product;
  var qty     = line.item.qty;
  var images  = getProductImages(product);

  var thumb = images.length > 0
    ? thumbImg(images[0], 'cart-thumb', '')
    : '<span class="cart-thumb"></span>';

  var variantLine = line.item.variant
    ? '<p class="cart-variant">' + escapeHtml(line.item.variant) + '</p>'
    : '';

  var priceLine, side;
  if (line.ok) {
    priceLine = '<p class="cart-price">' + formatPrice(product.price) + ' c/u</p>';
    side =
      '<strong class="cart-line-total">' + formatPrice(line.total) + '</strong>' +
      '<div class="stepper stepper-sm">' +
        '<button type="button" data-action="dec" aria-label="' + (qty === 1 ? 'Quitar del carrito' : 'Una unidad menos') + '">' +
          icon(qty === 1 ? 'trash' : 'minus') +
        '</button>' +
        '<span>' + qty + '</span>' +
        '<button type="button" data-action="inc" aria-label="Una unidad más">' + icon('plus') + '</button>' +
      '</div>';
  } else {
    priceLine = '<p class="cart-out">Ya no está disponible</p>';
    side = '<button class="btn btn-soft" type="button" data-action="remove">Quitar</button>';
  }

  return '<li class="cart-item' + (line.ok ? '' : ' is-out') + '" data-index="' + index + '">' +
    thumb +
    '<div class="cart-info">' +
      '<p class="cart-name">' + escapeHtml(cleanName(product.name)) + '</p>' +
      variantLine + priceLine +
    '</div>' +
    '<div class="cart-side">' + side + '</div>' +
  '</li>';
}

function renderCart() {
  var lines = cartLines();
  cartList.innerHTML = lines.map(cartItemHtml).join('');
  cartEmpty.hidden = lines.length > 0;
  cartFoot.hidden = lines.length === 0;
  cartTotal.textContent = formatPrice(getCartTotal());
  cartContinue.disabled = orderLines().length === 0;
}

// ===== SHEETS + BROWSER HISTORY =====
// Every open sheet is a history entry whose state lists the open sheets, so the
// phone's back button closes the sheet instead of leaving the site. Closing from
// the UI calls history.back(), and `popstate` is the only place that hides sheets.
function topLayer() {
  return layers[layers.length - 1] || null;
}

function syncLayers() {
  var top = topLayer();
  Object.keys(SHEETS).forEach(function (name) {
    var isOpen = name === top;
    SHEETS[name].classList.toggle('open', isOpen);
    SHEETS[name].toggleAttribute('inert', !isOpen);
  });
  overlay.classList.toggle('open', !!top);
  document.documentElement.classList.toggle('locked', !!top);
}

// Fills a sheet with its content. Returns false when it cannot be shown.
function enterLayer(name, productId) {
  if (name === 'product') return showProduct(productId);
  if (name === 'cart') { renderCart(); return true; }
  if (name === 'checkout') { renderCheckoutSummary(); return true; }
  return false;
}

function pushLayer(name, productId) {
  if (!enterLayer(name, productId)) return;
  if (layers.length === 0) lastFocus = document.activeElement;

  layers.push(name);
  history.pushState(
    { layers: layers.slice(), productId: productId || null },
    '',
    name === 'product' ? '#p=' + encodeURIComponent(productId) : window.location.href
  );
  syncLayers();
  SHEETS[name].focus({ preventScroll: true });
}

function closeLayer() {
  if (layers.length > 0) history.back();
}

function closeAllLayers() {
  if (layers.length > 0) history.go(-layers.length);
}

function baseUrl() {
  return window.location.pathname + window.location.search;
}

window.addEventListener('popstate', function (e) {
  var state = e.state || {};
  var next  = Array.isArray(state.layers) ? state.layers.slice() : [];
  var top   = next[next.length - 1];

  if (top && !enterLayer(top, state.productId)) {
    next = [];
    history.replaceState({ layers: [] }, '', baseUrl());
  }

  layers = next;
  syncLayers();

  if (layers.length === 0 && lastFocus && document.contains(lastFocus)) {
    lastFocus.focus({ preventScroll: true });
  }
});

// Runs once the products are loaded: reopens what a reload left open,
// or the product named in a shared link (…/#p=<id>).
function restoreLayers() {
  var state = history.state;
  if (state && Array.isArray(state.layers) && state.layers.length > 0) {
    if (enterLayer(state.layers[state.layers.length - 1], state.productId)) {
      layers = state.layers.slice();
      syncLayers();
      return;
    }
  }

  var match = /^#p=(.+)$/.exec(window.location.hash);
  history.replaceState({ layers: [] }, '', baseUrl());
  if (!match) return;

  var id = '';
  try { id = decodeURIComponent(match[1]); } catch (_) {}

  if (findProduct(id)) pushLayer('product', id);
  else showToast('Ese producto ya no está en el catálogo', 'error');
}

// ===== PRODUCT SHEET =====
function showProduct(id) {
  var product = findProduct(id);
  if (!product) return false;

  detail = { product: product, variant: null, qty: 1, images: getProductImages(product) };

  pdCats.textContent  = getProductCategories(product).join(' · ');
  pdName.textContent  = cleanName(product.name);
  pdPrice.textContent = formatPrice(product.price);
  pdDesc.textContent  = product.description || '';

  pdAsk.hidden = !waNumber;
  if (waNumber) {
    pdAsk.href = waLink('¡Hola! Tengo una consulta sobre este producto:\n' +
      cleanName(product.name) + '\n' + productUrl(product.id));
  }

  renderGallery();
  renderVariants();
  updateDetailFooter();
  productSheet.querySelector('.sheet-scroll').scrollTop = 0;
  return true;
}

function renderGallery() {
  var images = detail.images;
  var name   = escapeHtml(cleanName(detail.product.name));

  pdMedia.classList.toggle('has-many', images.length > 1);

  if (images.length === 0) {
    pdGallery.innerHTML = '<div class="slide no-img"><span class="media-fallback">' + icon('bag') + '</span></div>';
  } else {
    pdGallery.innerHTML = images.map(function (image, i) {
      var src     = escapeHtml(imageUrl(image));
      var loading = i === 0 ? 'eager' : 'lazy';
      return '<div class="slide">' +
        '<img class="media-bg" src="' + src + '" alt="" loading="' + loading + '" aria-hidden="true" />' +
        '<img class="media-img" src="' + src + '" alt="' + name + ', foto ' + (i + 1) + '" loading="' + loading + '" />' +
        '<span class="media-fallback">' + icon('bag') + '</span>' +
      '</div>';
    }).join('');
  }

  pdDots.innerHTML = images.length > 1
    ? images.map(function (_, i) {
        return '<button type="button" data-slide="' + i + '" aria-label="Ver foto ' + (i + 1) + '"></button>';
      }).join('')
    : '';

  pdGallery.scrollLeft = 0;
  setActiveSlide(0);
}

function currentSlide() {
  if (pdGallery.clientWidth === 0) return 0;
  return Math.round(pdGallery.scrollLeft / pdGallery.clientWidth);
}

function goToSlide(index) {
  var count = detail.images.length;
  if (count === 0) return;
  index = (index + count) % count;   // wraps around at both ends

  // Jumps instead of gliding when the reader asked for less motion, or when
  // the page is in the background and animations are paused.
  var animate = !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  pdGallery.scrollTo({ left: index * pdGallery.clientWidth, behavior: animate ? 'smooth' : 'auto' });
  setActiveSlide(index);
}

function setActiveSlide(index) {
  pdDots.querySelectorAll('button').forEach(function (dot, i) {
    dot.setAttribute('aria-current', i === index ? 'true' : 'false');
  });

  // Photos can be tied to an option (e.g. a lipstick tone); name it over the photo
  var image  = detail.images[index];
  var linked = hasVariants(detail.product)
    ? detail.product.variants.find(function (v) { return v.image && v.image === image; })
    : null;
  pdCaption.textContent = linked ? linked.name : '';
  pdCaption.hidden = !linked;
}

function renderVariants() {
  var product = detail.product;
  pdVariants.hidden = !hasVariants(product);
  pdVariantList.innerHTML = hasVariants(product)
    ? product.variants.map(function (v, i) {
        var soldOut = v.available === false;
        return '<button class="variant-chip" type="button" data-variant="' + i + '" aria-pressed="false"' +
          (soldOut ? ' disabled title="No disponible"' : '') + '>' + escapeHtml(v.name) + '</button>';
      }).join('')
    : '';
}

function selectVariant(index) {
  var variant = detail.product.variants[index];
  if (!variant || variant.available === false) return;

  detail.variant = variant.name;
  pdVariantList.querySelectorAll('.variant-chip').forEach(function (chip, i) {
    chip.setAttribute('aria-pressed', i === index ? 'true' : 'false');
  });

  var slide = variant.image ? detail.images.indexOf(variant.image) : -1;
  if (slide !== -1) goToSlide(slide);

  updateDetailFooter();
}

function needsVariant() {
  return hasVariants(detail.product) && !detail.variant;
}

function updateDetailFooter() {
  var product = detail.product;
  pdQty.textContent = detail.qty;
  pdStepper.hidden = !product.available;
  pdAdd.disabled = !product.available;
  pdAdd.classList.toggle('btn-primary', !needsVariant());
  pdAdd.classList.toggle('btn-soft', needsVariant());

  if (!product.available) pdAdd.textContent = 'Agotado';
  else if (needsVariant()) pdAdd.textContent = 'Elegí una opción';
  else pdAdd.textContent = 'Agregar · ' + formatPrice(product.price * detail.qty);
}

function addDetailToCart() {
  var product = detail.product;
  if (!product || !product.available) return;

  if (needsVariant()) {
    pdVariants.scrollIntoView({ block: 'center', behavior: 'smooth' });
    pdVariants.classList.remove('shake');
    void pdVariants.offsetWidth;
    pdVariants.classList.add('shake');
    return;
  }

  addToCart(product.id, detail.variant, detail.qty);
  closeLayer();
  showToast('Agregado al carrito', 'success');
}

function shareProduct() {
  var product = detail.product;
  if (!product) return;

  var url = productUrl(product.id);
  if (navigator.share) {
    navigator.share({
      title: cleanName(product.name),
      text: cleanName(product.name) + ' – ' + formatPrice(product.price),
      url: url
    }).catch(function () {});   // the share menu was dismissed
    return;
  }

  copyText(url).then(
    function () { showToast('Link copiado', 'success'); },
    function () { showToast('No se pudo copiar el link', 'error'); }
  );
}

// ===== CHECKOUT =====
function deliveryOptions() {
  return getDeliveryOptions(settings);
}

function checkedValue(group) {
  var input = group.querySelector('input:checked');
  return input ? input.value : '';
}

function renderPills(group, name, labels, selected) {
  if (labels.length === 1) selected = labels[0];
  group.innerHTML = labels.map(function (label) {
    return '<label class="pill">' +
      '<input type="radio" name="' + name + '" value="' + escapeHtml(label) + '"' +
        (label === selected ? ' checked' : '') + ' />' +
      '<span>' + escapeHtml(label) + '</span>' +
    '</label>';
  }).join('');
}

function syncAddressField() {
  var chosen = checkedValue(coDelivery);
  var option = deliveryOptions().find(function (o) { return o.label === chosen; });
  coAddressField.hidden = !(option && option.address);
}

function renderCheckoutSummary() {
  var count = orderLines().reduce(function (sum, line) { return sum + line.item.qty; }, 0);
  coSummary.innerHTML =
    '<span>' + count + (count === 1 ? ' producto' : ' productos') + '</span>' +
    '<strong>Total ' + formatPrice(getCartTotal()) + '</strong>';
}

function clearCheckoutError() {
  coError.hidden = true;
  checkoutForm.querySelectorAll('.field.invalid').forEach(function (field) {
    field.classList.remove('invalid');
  });
}

// Shows the message under the field that needs attention and moves focus there
function failCheckout(target, message) {
  var field = target.closest('.field');
  field.classList.add('invalid');
  field.appendChild(coError);
  coError.textContent = message;
  coError.hidden = false;

  var focusable = target.matches('input, textarea') ? target : target.querySelector('input');
  if (focusable) focusable.focus({ preventScroll: true });
  field.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function openCheckout() {
  if (orderLines().length === 0) return;

  var buyer = readStore(BUYER_KEY, {}) || {};
  if (!buyer.name) buyer.name = localStorage.getItem('dazu_buyer_name') || '';   // key used by the previous version

  checkoutSheet.classList.remove('is-sent');
  clearCheckoutError();

  // Keep what was already typed if the sheet is reopened
  if (!coName.value) coName.value = buyer.name || '';
  if (!coAddress.value) coAddress.value = buyer.address || '';

  renderPills(coDelivery, 'delivery',
    deliveryOptions().map(function (o) { return o.label; }),
    checkedValue(coDelivery) || buyer.delivery);
  renderPills(coPayment, 'payment',
    getSetting(settings, 'payment_methods'),
    checkedValue(coPayment) || buyer.payment);
  syncAddressField();

  var notice = getSetting(settings, 'payment_notice').trim();
  coNotice.textContent = notice;
  coNotice.hidden = !notice;

  pushLayer('checkout');
}

function buildWhatsAppMessage(order) {
  var msg = '¡Hola! Quiero hacer un pedido:\n\n*Mi pedido*\n';

  orderLines().forEach(function (line) {
    var qty = line.item.qty;
    msg += '• ' + qty + ' × ' + cleanName(line.product.name);
    if (line.item.variant) msg += ' (' + line.item.variant + ')';
    if (qty > 1) msg += ' (' + formatPrice(line.product.price) + ' c/u)';
    msg += ' — ' + formatPrice(line.total) + '\n';
  });

  msg += '\n*Total: ' + formatPrice(getCartTotal()) + '*\n';
  msg += '\n*Nombre:* ' + order.name;
  msg += '\n*Entrega:* ' + order.delivery;
  if (order.address) msg += '\n*Dirección:* ' + order.address;
  msg += '\n*Forma de pago:* ' + order.payment;
  if (order.note) msg += '\n*Nota:* ' + order.note;
  msg += '\n\nCatálogo: ' + DAZU_CONFIG.SITE_URL;

  return msg;
}

function sendOrder(e) {
  e.preventDefault();
  clearCheckoutError();

  var name     = coName.value.trim();
  var delivery = checkedValue(coDelivery);
  var payment  = checkedValue(coPayment);
  var note     = coNote.value.trim();
  var option   = deliveryOptions().find(function (o) { return o.label === delivery; });
  var address  = option && option.address ? coAddress.value.trim() : '';

  if (!name) return failCheckout(coName, 'Escribí tu nombre.');
  if (!delivery) return failCheckout(coDelivery, 'Elegí cómo querés recibir tu pedido.');
  if (option.address && !address) return failCheckout(coAddress, 'Escribí la dirección de envío.');
  if (!payment) return failCheckout(coPayment, 'Elegí una forma de pago.');
  if (!waNumber) return failCheckout(coNote, 'Todavía no hay un número de WhatsApp configurado. Intentá más tarde.');

  writeStore(BUYER_KEY, {
    name: name,
    address: coAddress.value.trim(),
    delivery: delivery,
    payment: payment
  });

  var url = waLink(buildWhatsAppMessage({
    name: name,
    delivery: delivery,
    address: address,
    payment: payment,
    note: note
  }));

  // The cart is kept until the buyer confirms the message was really sent
  coReopen.href = url;
  checkoutSheet.classList.add('is-sent');
  window.open(url, '_blank', 'noopener,noreferrer');
}

function finishOrder() {
  cart = [];
  saveCart();
  coNote.value = '';
  updateCartUI();
  renderProducts();
  closeAllLayers();
  showToast('¡Gracias por tu pedido!', 'success');
}

// ===== EVENT LISTENERS =====

// Search bar
searchInput.addEventListener('input', function () {
  searchClearBtn.hidden = searchInput.value === '';
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 200);
});

searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') searchInput.blur();   // hides the phone keyboard to show the results
});

searchClearBtn.addEventListener('click', function () {
  searchInput.value = '';
  applySearch();
  searchInput.focus();
});

// Category chips
chips.addEventListener('click', function (e) {
  var chip = e.target.closest('.chip');
  if (!chip) return;
  setFilter(chip.dataset.filter);
  chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
});

// Product grid: buttons act on the cart, anything else on a card opens the product
productGrid.addEventListener('click', function (e) {
  if (e.target.closest('[data-reload]')) { loadProducts(); return; }
  if (e.target.closest('[data-show-all]')) { setFilter('all'); return; }

  var card = e.target.closest('.card');
  if (!card || !card.dataset.id) return;

  var actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    var action = actionEl.dataset.action;
    if (action === 'inc') addToCart(card.dataset.id, null, 1);
    else if (action === 'dec') setLineQty(card.dataset.id, null, productQty(card.dataset.id) - 1);
    else pushLayer('product', card.dataset.id);
    return;
  }

  if (e.target.closest('.card-action')) return;   // e.g. the disabled "Agotado" button
  pushLayer('product', card.dataset.id);
});

// Cart
cartOpenBtn.addEventListener('click', function () { pushLayer('cart'); });
cartBarBtn.addEventListener('click', function () { pushLayer('cart'); });
cartContinue.addEventListener('click', openCheckout);

cartList.addEventListener('click', function (e) {
  var actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  var line = cartLines()[Number(actionEl.closest('.cart-item').dataset.index)];
  if (!line) return;

  var action = actionEl.dataset.action;
  var qty = action === 'inc' ? line.item.qty + 1 : action === 'dec' ? line.item.qty - 1 : 0;
  setLineQty(line.item.id, line.item.variant, qty);
});

// Product sheet
pdPrev.addEventListener('click', function () { goToSlide(currentSlide() - 1); });
pdNext.addEventListener('click', function () { goToSlide(currentSlide() + 1); });

pdDots.addEventListener('click', function (e) {
  var dot = e.target.closest('[data-slide]');
  if (dot) goToSlide(Number(dot.dataset.slide));
});

pdGallery.addEventListener('scroll', function () {
  setActiveSlide(currentSlide());
}, { passive: true });

pdVariantList.addEventListener('click', function (e) {
  var chip = e.target.closest('[data-variant]');
  if (chip) selectVariant(Number(chip.dataset.variant));
});

pdStepper.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-qty]');
  if (!btn) return;
  detail.qty = Math.max(1, Math.min(MAX_QTY, detail.qty + Number(btn.dataset.qty)));
  updateDetailFooter();
});

pdAdd.addEventListener('click', addDetailToCart);
pdShare.addEventListener('click', shareProduct);

// Checkout
checkoutForm.addEventListener('submit', sendOrder);
checkoutForm.addEventListener('input', clearCheckoutError);
coDelivery.addEventListener('change', syncAddressField);
coDone.addEventListener('click', finishOrder);
coBack.addEventListener('click', function () { checkoutSheet.classList.remove('is-sent'); });

// Closing sheets
overlay.addEventListener('click', closeLayer);

document.addEventListener('click', function (e) {
  if (e.target.closest('[data-close]')) closeLayer();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeLayer();
});

// Shadow under the toolbar once it sticks to the top
window.addEventListener('scroll', function () {
  toolbar.classList.toggle('is-stuck', window.scrollY >= toolbar.offsetTop && window.scrollY > 0);
}, { passive: true });

// ===== INIT =====
loadProducts();
