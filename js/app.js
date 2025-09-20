/* ========================================================================== 
   app.js – Nepali Bazar (FINAL single-file)
   - Purpose: single controller for index.html, sell.html, products.html, profile.html
   - Features: auth, products CRUD, pins (top 5), wishlist, modal/confirm,
               gallery, sell form (images->dataURL), draft save/load, pagination,
               search (title-only on products page), filters, owner/admin rules,
               debug API
   ========================================================================== */
(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_v1";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const PINS_KEY = "nb_pins";
  const WISHLIST_KEY = "nb_wishlist";
  const DRAFT_KEY = "nb_sell_draft_v1";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";
  const PIN_LIMIT = 5;
  const MAX_IMAGES = 3; // per your request: max 3 images
  const MAX_IMAGE_BYTES = 600 * 1024; // ~600KB soft warning
  const PAGE_SIZE = 12;

  // ------------------ DOM HELPERS ------------------
  const $ = (sel, p = document) => (p || document).querySelector(sel);
  const $$ = (sel, p = document) => Array.from((p || document).querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  // ------------------ UTILS ------------------
  const uid = (prefix = "p") => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const escapeHtml = (str = "") =>
    String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const numberWithCommas = (x) => (isNaN(x) ? x : Number(x).toLocaleString("en-IN"));

  // ------------------ STORAGE ------------------
  function readJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("readJSON error", key, e);
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("writeJSON error", key, e);
      alert("⚠️ Local storage error (maybe quota). Try removing old listings or images.");
    }
  }

  // ------------------ AUTH / USERS ------------------
  function ensureDefaultUsers() {
    const users = readJSON(USERS_KEY, []);
    if (!users || !users.length) {
      writeJSON(USERS_KEY, [
        { username: "sohaum", password: "sohaum", role: "admin" },
        { username: "sneha", password: "sneha", role: "user" },
      ]);
    }
  }
  function currentUser() {
    const u = localStorage.getItem(LOGGED_IN_KEY);
    if (!u) return null;
    const users = readJSON(USERS_KEY, []) || [];
    const found = users.find((x) => x.username === u);
    if (found) return { username: found.username, role: found.role };
    return { username: u, role: null };
  }
  function loginUser(username) {
    localStorage.setItem(LOGGED_IN_KEY, username);
    initAuthUI();
  }
  function logoutUser() {
    localStorage.removeItem(LOGGED_IN_KEY);
    initAuthUI();
  }
  function isAdmin() {
    const u = currentUser();
    return !!(u && u.role === "admin");
  }

  // ------------------ PRODUCTS CRUD ------------------
  function getAllProducts() {
    return readJSON(STORAGE_KEY, []) || [];
  }
  function saveProducts(list) {
    writeJSON(STORAGE_KEY, list || []);
  }
  function getActiveProducts() {
    const now = new Date();
    return getAllProducts().filter((p) => {
      if (!p || !p.expiryDate) return true;
      try {
        const ed = new Date(p.expiryDate + "T23:59:59");
        return ed >= now;
      } catch {
        return true;
      }
    });
  }
  function addProduct(product) {
    const list = getAllProducts();
    if (!product.id) product.id = uid("p");
    if (!product.createdAt) product.createdAt = new Date().toISOString();
    list.push(product);
    saveProducts(list);
  }
  function updateProduct(id, changes) {
    const list = getAllProducts().map((p) => (p.id === id ? { ...p, ...changes } : p));
    saveProducts(list);
  }
  function removeProduct(id) {
    const list = getAllProducts().filter((p) => p.id !== id);
    saveProducts(list);
  }

  // ------------------ PINS ------------------
  function getPins() {
    return readJSON(PINS_KEY, []) || [];
  }
  function savePins(ids) {
    writeJSON(PINS_KEY, ids);
  }
  function isPinned(id) {
    return getPins().includes(id);
  }
  function togglePin(id) {
    const user = currentUser();
    if (!user) {
      Modal.show(`<p>Please log in to pin listings.</p>`);
      return;
    }
    const pins = getPins();
    if (pins.includes(id)) {
      savePins(pins.filter((x) => x !== id));
    } else {
      if (pins.length >= PIN_LIMIT) {
        Modal.show(`❌ You can only pin up to ${PIN_LIMIT} listings.`);
        return;
      }
      pins.push(id);
      savePins(pins);
    }
    renderHeroPinned();
    if ($("#products-grid")) renderProductsPage(currentPage);
    renderHomeProducts(itemsToShow);
  }

  // ------------------ WISHLIST (kept but hidden on products page) ------------------
  function getWishlist() {
    return readJSON(WISHLIST_KEY, []) || [];
  }
  function saveWishlist(arr) {
    writeJSON(WISHLIST_KEY, arr);
  }
  function toggleWishlist(id) {
    const user = currentUser();
    if (!user) {
      Modal.show("<p>Please log in to save listings.</p>");
      return;
    }
    let wl = getWishlist();
    if (wl.includes(id)) wl = wl.filter((x) => x !== id);
    else wl.push(id);
    saveWishlist(wl);
  }

  // ------------------ MODAL & CONFIRM ------------------
  const Modal = {
    ensure() {
      let el = $("#nb-modal");
      if (!el) {
        el = document.createElement("div");
        el.id = "nb-modal";
        el.className = "nb-modal-overlay";
        el.innerHTML = `<div class="nb-modal"><div class="nb-modal-content"></div><div class="nb-modal-actions"></div></div>`;
        document.body.appendChild(el);
      }
      return el;
    },
    show(html, opts = {}) {
      const el = this.ensure();
      $(".nb-modal-content", el).innerHTML = html;
      const actions = $(".nb-modal-actions", el);
      actions.innerHTML = "";
      const ok = document.createElement("button");
      ok.className = "btn btn-primary";
      ok.textContent = opts.okText || "OK";
      ok.addEventListener("click", () => this.hide());
      actions.appendChild(ok);
      el.style.display = "flex";
    },
    hide() {
      const el = $("#nb-modal");
      if (el) el.style.display = "none";
    },
  };

  function Confirm(msg, cb) {
    if (window.Confirm && typeof window.Confirm === "function") {
      try {
        window.Confirm(msg, cb);
        return;
      } catch (err) {
        console.warn("external Confirm failed", err);
      }
    }

    let el = $("#nb-confirm");
    if (!el) {
      el = document.createElement("div");
      el.id = "nb-confirm";
      el.className = "nb-modal-overlay";
      el.innerHTML = `<div class="nb-modal"><div class="nb-modal-content"></div><div class="nb-modal-actions"></div></div>`;
      document.body.appendChild(el);
    }
    $(".nb-modal-content", el).innerHTML = `<p>${escapeHtml(msg)}</p>`;
    const actions = $(".nb-modal-actions", el);
    actions.innerHTML = "";
    const yes = document.createElement("button");
    yes.className = "btn btn-danger";
    yes.textContent = "Yes";
    yes.onclick = () => {
      el.style.display = "none";
      cb(true);
    };
    const no = document.createElement("button");
    no.className = "btn";
    no.textContent = "No";
    no.onclick = () => {
      el.style.display = "none";
      cb(false);
    };
    actions.appendChild(yes);
    actions.appendChild(no);
    el.style.display = "flex";
  }

  // ------------------ RENDER HELPERS ------------------
  // full card used on home/profile; compact used for pinned grid
  function buildCard(product, compact = false) {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";
    div.dataset.id = product.id;

    const img = escapeHtml((product.images || [])[0] || PLACEHOLDER_IMG);
    const pinned = isPinned(product.id) ? "📌" : "";
    const owner = escapeHtml(product.owner || "guest");
    const title = escapeHtml(product.title || "Untitled");
    const priceText = product.price ? `Rs. ${numberWithCommas(product.price)}` : "FREE";

    // determine permissions
    const u = currentUser();
    const isOwner = u && u.username === product.owner;
    const admin = isAdmin();

    let actionsHtml = `<div class="actions"><button class="btn view-btn">View</button>`;

    if (!compact) {
      // Delete: only owner or admin
      if (isOwner || admin) actionsHtml += `<button class="btn delete-btn">Delete</button>`;
      // Pin: only logged-in users (not shown on products page because products page uses separate card builder)
      if (u) actionsHtml += `<button class="btn pin-btn">${isPinned(product.id) ? "Unpin" : "Pin"}</button>`;
    }

    actionsHtml += `</div>`;

    div.innerHTML = `
      <div class="thumb"><img src="${img}" alt="${title}"></div>
      <div class="title">${title} ${pinned}</div>
      <div class="meta">by ${owner} ${product.city ? "• " + escapeHtml(product.city) : ""}</div>
      <div class="price">${priceText}</div>
      ${actionsHtml}
    `;

    div.querySelector(".view-btn")?.addEventListener("click", () => openProductModal(product.id));

    const delBtn = div.querySelector(".delete-btn");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        // Confirm then delete — admin allowed to delete anyone; owner allowed to delete own
        Confirm("Delete this listing?", (ok) => {
          if (!ok) return;
          removeProduct(product.id);
          renderAllViews();
        });
      });
    }

    const pinBtn = div.querySelector(".pin-btn");
    if (pinBtn) {
      pinBtn.addEventListener("click", () => {
        togglePin(product.id);
      });
    }

    return div;
  }

  function renderGrid(selector, list, compact = false) {
    $$(selector).forEach((grid) => {
      grid.innerHTML = "";
      list.forEach((p) => grid.appendChild(buildCard(p, compact)));
    });
  }

  function renderHeroPinned() {
    const wrap = $("#pinned-ads");
    if (!wrap) return;
    const pinnedIds = getPins();
    const pinnedProducts = getActiveProducts().filter((p) => pinnedIds.includes(p.id)).slice(0, PIN_LIMIT);
    wrap.innerHTML = "";
    pinnedProducts.forEach((p) => wrap.appendChild(buildCard(p, true)));
  }

  // ------------------ HOME PAGE ------------------
  let itemsToShow = 10;
  function renderHomeProducts(limit = itemsToShow) {
    const products = getActiveProducts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const slice = products.slice(0, limit);
    renderGrid("#home-grid", slice);
    const loadBtn = $("#load-more-btn");
    if (loadBtn) loadBtn.style.display = products.length > slice.length ? "inline-block" : "none";
  }

  // ------------------ PRODUCTS PAGE: filtering + pagination (title-only search) ------------------
  let currentPage = 1;
  let productsCache = [];

  function filterAndSortProducts(filters = {}) {
    const all = getActiveProducts();
    const q = (filters.q || "").trim().toLowerCase();
    const category = (filters.category || "").trim();
    const min = Number(filters.minPrice || 0) || 0;
    const max = Number(filters.maxPrice || 0) || 0;
    const sort = filters.sort || "newest";

    let list = all.filter((p) => {
      // SEARCH BY TITLE ONLY (your requirement)
      if (q) {
        if (!((p.title || "").toLowerCase().includes(q))) return false;
      }
      if (category && (p.category || "").toLowerCase() !== category.toLowerCase()) return false;
      if (min && (p.price || 0) < min) return false;
      if (max && max > 0 && (p.price || 0) > max) return false;
      return true;
    });

    if (sort === "newest") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === "oldest") list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === "price-asc") list.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === "price-desc") list.sort((a, b) => (b.price || 0) - (a.price || 0));

    return list;
  }

  // Products page card: intentionally minimal — only "View" visible here per your request
  function buildProductCardForPage(p) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = p.id;
    const thumb = escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG);
    const pinned = isPinned(p.id);

    card.innerHTML = `
      <div class="thumb"><img src="${thumb}" alt="${escapeHtml(p.title)}" /></div>
      <div class="title">${escapeHtml(p.title)} ${pinned ? "📌": ""}</div>
      <div class="meta muted">by ${escapeHtml(p.owner || "guest")} ${p.city ? "• " + escapeHtml(p.city) : ""}</div>
      <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
      <div class="actions">
        <button class="btn btn-small view-btn">View</button>
      </div>
    `;

    card.querySelector(".view-btn")?.addEventListener("click", () => openProductModal(p.id));

    return card;
  }

  function renderProductsPagination(totalPages) {
    const wrap = $("#products-pagination");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (totalPages <= 1) return;

    const prev = document.createElement("button");
    prev.textContent = "Prev";
    prev.disabled = currentPage === 1;
    prev.addEventListener("click", () => renderProductsPage(currentPage - 1));

    const next = document.createElement("button");
    next.textContent = "Next";
    next.disabled = currentPage === totalPages;
    next.addEventListener("click", () => renderProductsPage(currentPage + 1));

    const pagesWrap = document.createElement("div");
    pagesWrap.style.display = "flex";
    pagesWrap.style.gap = "6px";

    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);

    for (let i = start; i <= end; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.disabled = i === currentPage;
      btn.addEventListener("click", () => renderProductsPage(i));
      pagesWrap.appendChild(btn);
    }

    wrap.appendChild(prev);
    wrap.appendChild(pagesWrap);
    wrap.appendChild(next);
  }

  function toggleEmptyState(show) {
    const el = $("#empty-state");
    if (!el) return;
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
  }

  function readProductsPageFiltersFromDOM() {
    // use search-box (products page) or home-search
    const q = ($("#search-box") && $("#search-box").value) || ($("#home-search") && $("#home-search").value) || "";
    const category = ($("#filter-category") && $("#filter-category").value) || "";
    const sort = ($("#filter-sort") && $("#filter-sort").value) || "newest";
    const minPrice = ($("#price-min") && $("#price-min").value) || 0;
    const maxPrice = ($("#price-max") && $("#price-max").value) || 0;
    return { q, category, sort, minPrice, maxPrice };
  }

  function renderProductsPage(page = 1) {
    const filters = readProductsPageFiltersFromDOM();
    productsCache = filterAndSortProducts(filters);
    const total = productsCache.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.max(1, Math.min(page, pages));
    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = productsCache.slice(start, start + PAGE_SIZE);

    const grid = $("#products-grid");
    if (!grid) return;
    grid.innerHTML = "";
    slice.forEach((p) => grid.appendChild(buildProductCardForPage(p)));
    renderProductsPagination(pages);
    toggleEmptyState(total === 0);
  }

  // ------------------ PRODUCT MODAL / GALLERY ------------------
  let modalState = { images: [], idx: 0, productId: null };

  function openProductModal(productId) {
    const p = getAllProducts().find((x) => x.id === productId);
    if (!p) return;
    modalState.productId = p.id;
    modalState.images = (p.images && p.images.length) ? p.images : [PLACEHOLDER_IMG];
    modalState.idx = 0;
    fillProductModal(p);
    showModal();
  }

  function fillProductModal(p) {
    const modal = $("#product-modal");
    if (!modal) return;
    const image = $("#modal-image");
    const title = $("#modal-title");
    const desc = $("#modal-desc");
    const category = $("#modal-category");
    const price = $("#modal-price");
    const locationEl = $("#modal-location");
    const seller = $("#modal-seller");
    const contact = $("#modal-contact");
    const thumbs = $("#modal-thumbs");
    const wishlistBtn = $("#toggle-wishlist");
    const shareBtn = $("#share-btn");
    const contactBtn = $("#contact-seller");
    const editLink = $("#edit-link");
    const deleteBtn = $("#delete-btn");

    title.textContent = p.title || "Untitled";
    desc.textContent = p.description || "";
    category.textContent = p.category || p.subcategory || "—";
    price.textContent = p.price ? numberWithCommas(p.price) : "FREE";
    locationEl.textContent = [p.city, p.province].filter(Boolean).join(", ") || "N/A";
    seller.textContent = p.owner || "guest";
    contact.textContent = p.contact || "N/A";

    modalState.images = (p.images && p.images.length) ? p.images : [PLACEHOLDER_IMG];
    modalState.idx = 0;
    if (image) image.src = modalState.images[modalState.idx];
    if (thumbs) {
      thumbs.innerHTML = "";
      modalState.images.forEach((src, i) => {
        const img = document.createElement("img");
        img.src = src;
        img.className = i === modalState.idx ? "active" : "";
        img.onclick = () => {
          modalState.idx = i;
          if (image) image.src = modalState.images[modalState.idx];
          Array.from(thumbs.children).forEach((c, idx) => c.classList.toggle("active", idx === modalState.idx));
        };
        thumbs.appendChild(img);
      });
    }

    const user = currentUser();

    // Wishlist in modal: only show if logged in (but hide on products page cards per request)
    if (wishlistBtn) {
      if (user) {
        wishlistBtn.classList.remove("hidden");
        const saved = getWishlist().includes(p.id);
        wishlistBtn.textContent = saved ? "Saved" : "♡ Save";
        wishlistBtn.onclick = () => {
          toggleWishlist(p.id);
          wishlistBtn.textContent = getWishlist().includes(p.id) ? "Saved" : "♡ Save";
        };
      } else {
        wishlistBtn.classList.add("hidden");
      }
    }

    if (contactBtn) {
      contactBtn.onclick = () => {
        if (p.contact && p.contact.includes("@")) window.location.href = "mailto:" + p.contact;
        else alert("Contact: " + (p.contact || "N/A"));
      };
    }

    if (shareBtn) {
      shareBtn.onclick = async () => {
        const url = window.location.origin + window.location.pathname + "#product-" + p.id;
        const data = { title: p.title, text: p.description || "", url };
        if (navigator.share) {
          try { await navigator.share(data); } catch (err) { console.warn(err); }
        } else {
          try { await navigator.clipboard.writeText(url); alert("Link copied to clipboard."); }
          catch { prompt("Copy link:", url); }
        }
      };
    }

    // Edit/Delete controls: owner can edit & delete; admin can delete everyone but not edit others
    if (editLink && deleteBtn) {
      if (user && user.username === p.owner) {
        editLink.classList.remove("hidden");
        editLink.href = "sell.html?id=" + encodeURIComponent(p.id);
        deleteBtn.classList.remove("hidden");
        deleteBtn.onclick = () => {
          Confirm("Delete this listing?", (ok) => {
            if (!ok) return;
            removeProduct(p.id);
            closeModal();
            renderAllViews();
          });
        };
      } else if (isAdmin()) {
        editLink.classList.add("hidden");
        deleteBtn.classList.remove("hidden");
        deleteBtn.onclick = () => {
          Confirm("Admin delete this listing?", (ok) => {
            if (!ok) return;
            removeProduct(p.id);
            closeModal();
            renderAllViews();
          });
        };
      } else {
        editLink.classList.add("hidden");
        deleteBtn.classList.add("hidden");
      }
    }
  }

  function showModal() {
    const modal = $("#product-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    const modal = $("#product-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    modalState = { images: [], idx: 0, productId: null };
  }

  function bindProductModalControls() {
    const prev = $("#gallery-prev");
    const next = $("#gallery-next");
    const closeBtn = $("#modal-close");

    if (prev) prev.addEventListener("click", () => {
      if (!modalState.images.length) return;
      modalState.idx = (modalState.idx - 1 + modalState.images.length) % modalState.images.length;
      $("#modal-image") && ($("#modal-image").src = modalState.images[modalState.idx]);
    });
    if (next) next.addEventListener("click", () => {
      if (!modalState.images.length) return;
      modalState.idx = (modalState.idx + 1) % modalState.images.length;
      $("#modal-image") && ($("#modal-image").src = modalState.images[modalState.idx]);
    });
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowLeft") prev && prev.click();
      if (e.key === "ArrowRight") next && next.click();
    });
  }

  // ------------------ SELL FORM (robust to different field naming) ------------------
  function initSellForm() {
    const form = $("#sell-form");
    if (!form) return;

    // support either id-based inputs (sell-*) or name-based fields
    const titleField = $("#sell-title") || form.querySelector('[name="title"]') || form.title;
    const descField = $("#sell-desc") || form.querySelector('[name="description"]') || form.description;
    const priceField = $("#sell-price") || form.querySelector('[name="price"]') || form.price;
    const categoryField = $("#sell-category") || form.querySelector('[name="category"]') || form.category;
    const provinceField = $("#sell-province") || form.querySelector('[name="province"]') || form.province;
    const cityField = $("#sell-city") || form.querySelector('[name="city"]') || form.city;
    const imageInput = $("#sell-images") || $("#image-input") || form.querySelector('[type="file"]');
    const thumbPreview = $("#preview-images") || $("#thumb-preview");
    const saveDraftBtn = $("#save-draft") || $("#save-draft-btn");
    const expiryInput = $("#expiryDate") || form.querySelector('[name="expiryDate"]');

    let imageDataUrls = [];
    let editingProductId = null;

    // detect edit via ?id=...
    const params = new URLSearchParams(window.location.search);
    if (params.has("id")) {
      const id = params.get("id");
      const p = getAllProducts().find((x) => x.id === id);
      if (p) {
        editingProductId = id;
        if (titleField) titleField.value = p.title || "";
        if (descField) descField.value = p.description || "";
        if (categoryField) categoryField.value = p.category || "";
        if (priceField) priceField.value = p.price || "";
        if (provinceField) provinceField.value = p.province || "";
        if (cityField) cityField.value = p.city || "";
        if (form.contact) form.contact.value = p.contact || "";
        if (expiryInput && p.expiryDate) expiryInput.value = p.expiryDate;
        imageDataUrls = p.images ? p.images.slice(0, MAX_IMAGES) : [];
        renderThumbs();
      }
    } else {
      // try load draft
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        try {
          const d = JSON.parse(raw);
          Object.keys(d).forEach((k) => {
            const el = form.querySelector(`[name="${k}"]`) || form[k];
            if (el) el.value = d[k];
            if (titleField && k === "title" && !titleField.value) titleField.value = d[k];
          });
        } catch (e) {
          console.warn("draft load failed", e);
        }
      }
    }

    function renderThumbs() {
      if (!thumbPreview) return;
      thumbPreview.innerHTML = "";
      imageDataUrls.forEach((data, i) => {
        const wrap = document.createElement("div");
        wrap.className = "thumb-wrapper";
        const img = document.createElement("img");
        img.src = data;
        img.alt = `img-${i}`;
        const btn = document.createElement("button");
        btn.className = "remove-thumb";
        btn.innerHTML = "×";
        btn.title = "Remove";
        btn.onclick = () => {
          imageDataUrls.splice(i, 1);
          renderThumbs();
        };
        wrap.appendChild(img);
        wrap.appendChild(btn);
        thumbPreview.appendChild(wrap);
      });
    }

    async function filesToDataUrls(files) {
      const arr = Array.from(files).slice(0, MAX_IMAGES);
      const out = [];
      for (const f of arr) {
        if (f.size > MAX_IMAGE_BYTES) {
          console.warn(`Image ${f.name} large (${Math.round(f.size / 1024)}KB) - may hit storage quota.`);
        }
        const data = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = (err) => rej(err);
          reader.readAsDataURL(f);
        });
        out.push(data);
      }
      return out;
    }

    imageInput?.addEventListener("change", async (e) => {
      const files = e.target.files;
      if (!files) return;
      if (files.length > MAX_IMAGES) alert(`You can upload max ${MAX_IMAGES} images.`);
      try {
        const urls = await filesToDataUrls(files);
        imageDataUrls = urls.slice(0, MAX_IMAGES);
        renderThumbs();
      } catch (err) {
        console.error("file read error", err);
        alert("Failed to read images.");
      }
    });

    saveDraftBtn?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const obj = {};
      fd.forEach((v, k) => {
        if (k !== "images") obj[k] = v;
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(obj));
      alert("Draft saved locally.");
    });

    // expiry default (7 days max)
    if (expiryInput) {
      const today = new Date();
      const max = new Date();
      max.setDate(today.getDate() + 7);
      expiryInput.min = today.toISOString().split("T")[0];
      expiryInput.max = max.toISOString().split("T")[0];
      expiryInput.value = expiryInput.value || expiryInput.max;
    }

    // price preview formatting (if preview element exists)
    const previewPriceEl = $("#preview-price");
    priceField?.addEventListener?.("input", () => {
      if (!previewPriceEl) return;
      const v = priceField.value ? Number(priceField.value) : 0;
      previewPriceEl.textContent = v ? "NPR " + numberWithCommas(v) : "NPR 0";
    });

    // province->city quick map (small set, extend as needed)
    const citiesByProvince = {
      "1": ["Biratnagar", "Dharan", "Itahari", "Birtamode", "Damak"],
      "2": ["Janakpur", "Birgunj", "Kalaiya", "Jaleshwar"],
      "3": ["Kathmandu", "Lalitpur", "Bhaktapur", "Hetauda", "Banepa"],
      "4": ["Pokhara", "Gorkha", "Baglung", "Waling"],
      "5": ["Butwal", "Bhairahawa", "Nepalgunj", "Tansen"],
      "6": ["Surkhet", "Jumla", "Dailekh"],
      "7": ["Dhangadhi", "Mahendranagar", "Tikapur"]
    };
    if (provinceField && cityField) {
      provinceField.addEventListener("change", () => {
        cityField.innerHTML = "<option value=''>-- Select City --</option>";
        const key = provinceField.value;
        if (citiesByProvince[key]) {
          citiesByProvince[key].forEach((c) => {
            const o = document.createElement("option");
            o.value = c;
            o.textContent = c;
            cityField.appendChild(o);
          });
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const user = currentUser();
      if (!user) {
        alert("You must be logged in to post a listing.");
        window.location.href = "login.html";
        return;
      }
      if (!confirm("Are you sure you want to publish this listing?")) return;

      // if user selected files but we haven't processed into dataURLs
      if (imageInput && imageInput.files && imageInput.files.length && imageDataUrls.length === 0) {
        try {
          imageDataUrls = await filesToDataUrls(imageInput.files);
        } catch (err) {
          console.warn(err);
        }
      }

      // read values robustly
      const title = (titleField && titleField.value) || (form.title && form.title.value) || "";
      const description = (descField && descField.value) || (form.description && form.description.value) || "";
      const category = (categoryField && categoryField.value) || (form.category && form.category.value) || "";
      const price = parseInt((priceField && priceField.value) || (form.price && form.price.value) || "0") || 0;
      const contact = (form.contact && form.contact.value) || "";
      const province = (provinceField && provinceField.value) || (form.province && form.province.value) || "";
      const city = (cityField && cityField.value) || (form.city && form.city.value) || "";
      const expiryDate = (expiryInput && expiryInput.value) || null;

      const payload = {
        id: editingProductId || uid("p"),
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        price: price,
        contact: contact.trim(),
        images: imageDataUrls.slice(0, MAX_IMAGES),
        owner: user.username,
        createdAt: editingProductId ? getAllProducts().find((x) => x.id === editingProductId).createdAt : new Date().toISOString(),
        expiryDate: expiryDate,
        province: province,
        city: city
      };

      if (editingProductId) updateProduct(editingProductId, payload);
      else addProduct(payload);

      localStorage.removeItem(DRAFT_KEY);

      Modal.show(`<h2>Listing Published 🎉</h2><p>Your item has been successfully listed. You can view it in your profile or go to shop.</p>
        <div style="margin-top:12px;">
          <a href="products.html" class="btn btn-primary">Go to Shop</a>
          <a href="profile.html" class="btn btn-ghost">View My Listings</a>
        </div>`, { okText: "Close" });

      form.reset();
      imageDataUrls = [];
      renderThumbs();
      renderAllViews();

      if (!editingProductId) window.location.href = "products.html";
    });

    // helper: if preview elements exist, update live preview fields (keeps compatibility with the sell.html you showed)
    const previewTitle = $("#preview-title");
    const previewDesc = $("#preview-desc");
    const previewImages = $("#preview-images");
    const previewBy = $("#preview-by");
    const previewAddress = $("#preview-address");

    if (titleField && previewTitle) titleField.addEventListener("input", () => previewTitle.textContent = titleField.value || "Your Title");
    if (descField && previewDesc) descField.addEventListener("input", () => previewDesc.textContent = descField.value || "Your description will appear here.");
    if (priceField && previewPriceEl) priceField.addEventListener("input", () => previewPriceEl.textContent = priceField.value ? "NPR " + numberWithCommas(priceField.value) : "NPR 0");
    if (provinceField && previewAddress) provinceField.addEventListener("change", () => previewAddress.textContent = "Address: " + (provinceField.options[provinceField.selectedIndex].text || "-"));
    if (cityField && previewAddress) cityField.addEventListener("change", () => {
      const prov = provinceField ? provinceField.options[provinceField.selectedIndex].text || "" : "";
      const city = cityField.value || "";
      previewAddress.textContent = "Address: " + city + (prov ? ", " + prov : "");
    });
    if (imageInput && previewImages) {
      imageInput.addEventListener("change", async () => {
        previewImages.innerHTML = "";
        const files = Array.from(imageInput.files).slice(0, MAX_IMAGES);
        for (const f of files) {
          const data = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(f);
          });
          const img = document.createElement("img");
          img.src = data;
          previewImages.appendChild(img);
        }
      });
    }
  }

  // ------------------ SEARCH & FILTERS BINDING ------------------
  function initSearchAndFilters() {
    // hide header home-search form on index if requested (you wanted the top search to disappear on index)
    if (location.pathname.endsWith("index.html") || location.pathname === "/" || location.pathname === "") {
      const hs = $("#home-search-form");
      if (hs) hs.style.display = "none";
    }

    const homeSearch = $("#home-search");
    const pageSearch = $("#search-box");
    const filterCategory = $("#filter-category");
    const filterSort = $("#filter-sort");
    const priceMin = $("#price-min");
    const priceMax = $("#price-max");

    const handler = () => {
      if ($("#products-grid")) renderProductsPage(1);
      else renderHomeProducts(itemsToShow);
    };

    [homeSearch, pageSearch, filterCategory, filterSort, priceMin, priceMax].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    });
  }

  // ------------------ PROFILE PAGE (role hierarchy) ------------------
  function renderProfilePage() {
    const wrap = $("#profile-listings");
    if (!wrap) return;
    const user = currentUser();
    if (!user) {
      wrap.innerHTML = "<p>You must be logged in to view your listings.</p>";
      return;
    }

    // Admin: show all listings (admin cannot edit others, only delete).
    // Normal user: show only their own (edit+delete).
    const products = isAdmin() ? getActiveProducts() : getActiveProducts().filter((p) => p.owner === user.username);
    wrap.innerHTML = "";

    if (!products.length) {
      const empty = $("#profile-empty");
      if (empty) empty.style.display = "block";
      return;
    } else {
      const empty = $("#profile-empty");
      if (empty) empty.style.display = "none";
    }

    products.forEach((p) => {
      const card = document.createElement("div");
      card.className = "listing-card";
      card.innerHTML = `
        <div class="listing-head">
          <div>
            <div class="listing-title">${escapeHtml(p.title)}</div>
            <div class="listing-meta">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"} • ${escapeHtml(p.city || "")} • ${new Date(p.createdAt).toLocaleDateString()}</div>
          </div>
          <div class="listing-actions"></div>
        </div>
        <p class="muted small">${escapeHtml(p.description || "").slice(0, 140)}${(p.description || "").length>140 ? "…" : ""}</p>
      `;
      const actions = card.querySelector(".listing-actions");
      // owner editing
      if (user.username === p.owner) {
        const edit = document.createElement("a");
        edit.className = "btn btn-small";
        edit.href = "sell.html?id=" + encodeURIComponent(p.id);
        edit.textContent = "Edit";
        actions.appendChild(edit);
        const del = document.createElement("button");
        del.className = "btn btn-small btn-danger";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          Confirm("Delete this listing?", (ok) => {
            if (!ok) return;
            removeProduct(p.id);
            renderAllViews();
          });
        });
        actions.appendChild(del);
      } else if (isAdmin()) {
        // admin can remove others, but not edit
        const del = document.createElement("button");
        del.className = "btn btn-small btn-danger";
        del.textContent = "Remove";
        del.addEventListener("click", () => {
          Confirm("Admin remove this listing?", (ok) => {
            if (!ok) return;
            removeProduct(p.id);
            renderAllViews();
          });
        });
        actions.appendChild(del);
      }

      wrap.appendChild(card);
    });
  }

  // ------------------ GLOBAL RENDERER ------------------
  function renderAllViews() {
    renderHeroPinned();
    renderHomeProducts(itemsToShow);
    if ($("#products-grid")) renderProductsPage(currentPage);
    renderProfilePage();
  }

  // ------------------ AUTH UI (header) ------------------
  function initAuthUI() {
    const user = currentUser();
    const loginLink = $("#login-link");
    const userInfo = $("#user-info");
    const usernameDisplay = $("#username-display");

    if (user) {
      if (loginLink) loginLink.style.display = "none";
      if (userInfo) {
        userInfo.style.display = "inline-block";
        if (usernameDisplay) usernameDisplay.textContent = user.username;
      }
      $("#logout-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        Confirm("Log out?", (ok) => {
          if (ok) {
            logoutUser();
            location.reload();
          }
        });
      });
    } else {
      if (loginLink) loginLink.style.display = "inline-block";
      if (userInfo) userInfo.style.display = "none";
    }
  }

  // ------------------ BIND PAGE CONTROLS ------------------
  function wirePageControls() {
    initSearchAndFilters();
    bindProductModalControls();

    const loadMore = $("#load-more-btn");
    if (loadMore) {
      loadMore.addEventListener("click", () => {
        itemsToShow += 10;
        renderHomeProducts(itemsToShow);
      });
    }

    const pm = $("#product-modal");
    if (pm) {
      pm.addEventListener("click", (ev) => { if (ev.target === pm) closeModal(); });
    }
  }

  // ------------------ DEBUG / PUBLIC API ------------------
  function exposeDebugAPI() {
    window.NB = window.NB || {};
    Object.assign(window.NB, {
      // auth
      login: loginUser,
      logout: logoutUser,
      currentUser,
      // products
      addProduct,
      updateProduct,
      deleteProduct: removeProduct,
      getAllProducts,
      saveProducts,
      // pins
      getPinnedIds: getPins,
      togglePin,
      // wishlist
      getWishlist,
      toggleWishlist,
      // renders
      renderAllProducts: renderAllViews,
      renderHomeProducts,
      renderProductsPage,
      renderProfilePage,
    });
  }

  // ------------------ BOOTSTRAP ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers();
    exposeDebugAPI();
    initAuthUI();
    initSellForm();
    wirePageControls();
    renderAllViews();
    bindProductModalControls();
    const yr = $("#year");
    if (yr) yr.textContent = new Date().getFullYear();
  });

  // ------------------ END ------------------
})();
