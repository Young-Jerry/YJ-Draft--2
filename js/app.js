/* Modernized app.js - Full features + hero fix + search & filters */
(function () {
  // ================= CONFIG =================
  const STORAGE_KEY = window.LOCAL_STORAGE_KEY || "nb_products_v1";
  const USERS_KEY = window.LOCAL_USERS_KEY || "nb_users_v1";
  const CURRENT_USER_KEY = "nb_logged_in_user";
  const MAX_EXPIRY_DAYS = 7;
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";

  // ================= HELPERS =================
  const el = (s) => document.querySelector(s);
  const els = (s) => Array.from(document.querySelectorAll(s));

  const escapeHtml = (s) =>
    s
      ? String(s).replace(/[&<>"']/g, (m) => {
          return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }[m];
        })
      : "";

  const numberWithCommas = (x) => {
    try {
      return Number(x).toLocaleString("en-IN");
    } catch (e) {
      return x;
    }
  };

  const nowIsoDateTime = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(
      2,
      "0"
    )}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const dateOnlyToLocalMidnight = (dateStr) => {
    try {
      const parts = dateStr.split("T")[0].split(" ")[0];
      return new Date(parts + "T00:00:00");
    } catch (e) {
      return new Date(dateStr);
    }
  };

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  };

  const writeJSON = (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  };

  const isProfilePage = () =>
    /profile\.html$/i.test(window.location.pathname) ||
    !!el("#profile-page");

  // ================= USERS =================
  function ensureDefaultUsers() {
    const users = readJSON(USERS_KEY, null);
    if (users && Array.isArray(users) && users.length) return;
    const defaults = [
      { username: "sohaum", password: "sohaum", role: "admin" },
      { username: "sneha", password: "sneha", role: "user" },
    ];
    writeJSON(USERS_KEY, defaults);
    return defaults;
  }

  const getCurrentUser = () => {
    try {
      return localStorage.getItem(CURRENT_USER_KEY) || null;
    } catch (e) {
      return null;
    }
  };

  const setCurrentUser = (u) => {
    try {
      localStorage.setItem(CURRENT_USER_KEY, u);
    } catch (e) {}
  };

  const logoutCurrentUser = () => {
    try {
      localStorage.removeItem(CURRENT_USER_KEY);
    } catch (e) {}
  };

  function isAdmin() {
    const u = getCurrentUser();
    if (!u) return false;
    const users = readJSON(USERS_KEY, []);
    const match = users.find((x) => x.username === u);
    return !!(match && match.role === "admin");
  }

  function canDelete(product) {
    const u = getCurrentUser();
    if (!u) return false;
    const users = readJSON(USERS_KEY, []);
    const me = users.find((x) => x.username === u);
    if (me && me.role === "admin") return true;
    return product && product.seller === u && isProfilePage();
  }

  // ================= PRODUCTS =================
  const getProductsRaw = () => readJSON(STORAGE_KEY, []);
  const saveProductsRaw = (l) => writeJSON(STORAGE_KEY, l);

  function getProducts() {
    const raw = getProductsRaw();
    const todayMid = new Date(new Date().toDateString());
    return (raw || []).filter((p) => {
      if (!p) return false;
      if (!p.expiryDate) return true;
      return dateOnlyToLocalMidnight(p.expiryDate) >= todayMid;
    });
  }

  function addProduct(product) {
    const list = getProductsRaw();
    product.id = "p_" + Date.now();
    product.createdAt = nowIsoDateTime();
    product.expiryDate =
      product.expiryDate ||
      new Date(
        Date.now() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
    list.push(product);
    saveProductsRaw(list);
  }

  function deleteProduct(id) {
    let list = getProductsRaw();
    const f = list.find((p) => p.id === id);
    if (!f) return;
    if (!canDelete(f)) return;
    list = list.filter((p) => p.id !== id);
    saveProductsRaw(list);
    renderPinnedHero();
    renderAll();
  }

  // ================= PIN =================
  function pinProduct(id) {
    if (!isAdmin()) return alert("Only admin can pin");
    const list = getProductsRaw();
    list.forEach((p) => (p.pinned = false));
    const found = list.find((p) => p.id === id);
    if (found) {
      found.pinned = true;
      found.pinnedBy = getCurrentUser();
      found.pinnedAt = new Date().toISOString();
      saveProductsRaw(list);
      renderPinnedHero();
      renderAll();
    }
  }

  function unpinProduct(id) {
    if (!isAdmin()) return alert("Only admin can unpin");
    const list = getProductsRaw();
    const f = list.find((p) => p.id === id);
    if (f) {
      f.pinned = false;
      delete f.pinnedBy;
      delete f.pinnedAt;
      saveProductsRaw(list);
      renderPinnedHero();
      renderAll();
    }
  }

  // ================= UI: CARDS =================
  function createCard(p) {
    const card = document.createElement("div");
    card.className = "card";

    const img = (p.images && p.images[0]) || PLACEHOLDER_IMG;
    const price =
      +p.price === 0
        ? "FREE"
        : (p.currency || "Rs.") + " " + numberWithCommas(p.price);

    card.innerHTML = `
      <div class="thumb"><img src="${escapeHtml(img)}"/></div>
      <div class="title">${escapeHtml(p.title)} ${
      p.pinned ? "<span>📌</span>" : ""
    }</div>
      <div class="meta">${escapeHtml(p.category || "General")} • ${price}</div>
      <div class="actions">
        <button onclick="NB_VIEW_PRODUCT('${p.id}')">View</button>
        ${
          canDelete(p)
            ? `<button onclick="NB_DELETE_PRODUCT('${p.id}')">Delete</button>`
            : ""
        }
        ${
          isAdmin()
            ? p.pinned
              ? `<button onclick="NB_UNPIN_PRODUCT('${p.id}')">Unpin</button>`
              : `<button onclick="NB_PIN_PRODUCT('${p.id}')">Pin</button>`
            : ""
        }
      </div>
    `;
    return card;
  }

  // ================= MODAL =================
  function showModal(html) {
    const m = el("#nb-modal");
    if (m) {
      m.querySelector("#nb-modal-body").innerHTML = html;
      m.style.display = "flex";
      return;
    }
    alert("Modal placeholder:\n" + html);
  }

  function buildModalHtml(p) {
    const img = (p.images && p.images[0]) || PLACEHOLDER_IMG;
    return `
      <div class="modal-product">
        <h2>${escapeHtml(p.title)}</h2>
        <img src="${escapeHtml(img)}" class="modal-img"/>
        <p><b>Price:</b> ${
          +p.price === 0 ? "FREE" : numberWithCommas(p.price)
        }</p>
        <p><b>Category:</b> ${escapeHtml(p.category || "General")}</p>
        <p><b>Description:</b> ${escapeHtml(p.description || "")}</p>
        <p><b>Seller:</b> ${escapeHtml(p.seller || "Unknown")}</p>
      </div>
    `;
  }

  function openProductModalById(id) {
    const p = getProductsRaw().find((x) => x.id === id);
    if (p) showModal(buildModalHtml(p));
  }

  // ================= RENDER HERO =================
  function renderPinnedHero() {
    const hero = el(".hero");
    if (!hero) return;

    if (isProfilePage()) {
      hero.style.display = "none";
      return;
    } else {
      hero.style.display = "";
    }

    let heroInner = hero.querySelector(".hero-inner");
    if (!heroInner) {
      heroInner = document.createElement("div");
      heroInner.className = "container hero-inner";
      hero.appendChild(heroInner);
    }

    let left = heroInner.querySelector(".hero-left");
    if (!left) {
      left = document.createElement("div");
      left.className = "hero-left";
      left.innerHTML = `<h1 class="hero-title"><span class="accent site-name"></span><br>Buy • Sell • Connect — Locally</h1>`;
      heroInner.appendChild(left);
    }

    let right = heroInner.querySelector(".hero-right");
    if (!right) {
      right = document.createElement("div");
      right.className = "hero-right";
      heroInner.appendChild(right);
    }

    const pinned = getProductsRaw().find((p) => p && p.pinned);
    if (!pinned) {
      right.innerHTML = `<div class="hero-card">No pinned ad</div>`;
      return;
    }

    right.innerHTML = `
      <div class="hero-card pinned-hero">
        <img src="${escapeHtml(
          (pinned.images && pinned.images[0]) || PLACEHOLDER_IMG
        )}"/>
        <div>${escapeHtml(pinned.title)} - ${
      pinned.price || "N/A"
    }</div>
      </div>`;
    right.querySelector(".pinned-hero").onclick = () =>
      openProductModalById(pinned.id);
  }

  // ================= RENDERERS =================
  function renderHomeGrid() {
    const grid = el("#home-grid");
    if (!grid) return;
    grid.innerHTML = "";
    getProducts()
      .slice(0, 8)
      .forEach((p) => grid.appendChild(createCard(p)));
  }

  function renderProductsPage() {
    const grid = el("#products-grid");
    if (!grid) return;
    grid.innerHTML = "";
    applyFilters(getProducts()).forEach((p) =>
      grid.appendChild(createCard(p))
    );
  }

  function renderProfilePage() {
    const cont = el("#profile-listings");
    if (!cont) return;
    cont.innerHTML = "";
    getProducts()
      .filter((p) => p.seller === getCurrentUser())
      .forEach((p) => cont.appendChild(createCard(p)));
  }

  function renderAll() {
    renderHomeGrid();
    renderProductsPage();
    renderProfilePage();
  }

  // ================= FILTERS & SEARCH =================
  function applyFilters(list) {
    const keyword = (el("#search-box")?.value || "").toLowerCase();
    const category = el("#filter-category")?.value || "";
    const minPrice = parseInt(el("#filter-min")?.value || "0");
    const maxPrice = parseInt(el("#filter-max")?.value || "999999999");

    return list.filter((p) => {
      if (
        keyword &&
        !p.title.toLowerCase().includes(keyword) &&
        !(p.description || "").toLowerCase().includes(keyword)
      )
        return false;
      if (category && p.category !== category) return false;
      const price = parseInt(p.price || "0");
      if (price < minPrice || price > maxPrice) return false;
      return true;
    });
  }

  function initFilters() {
    ["#search-box", "#filter-category", "#filter-min", "#filter-max"].forEach(
      (s) => {
        const e = el(s);
        if (e) e.addEventListener("input", renderProductsPage);
      }
    );
  }

  // ================= AUTH UI =================
  function initAuthUI() {
    const nav = el(".nav");
    if (!nav) return;
    const user = getCurrentUser();
    const authEl = el("#auth-links");
    if (!authEl) return;

    if (user) {
      authEl.innerHTML = `
        <span>Welcome, ${escapeHtml(user)}</span>
        <button onclick="NB_LOGOUT()">Logout</button>
      `;
    } else {
      authEl.innerHTML = `<a href="login.html">Login</a>`;
    }
  }

  // ================= GLOBAL HOOKS =================
  window.NB_VIEW_PRODUCT = openProductModalById;
  window.NB_DELETE_PRODUCT = deleteProduct;
  window.NB_PIN_PRODUCT = pinProduct;
  window.NB_UNPIN_PRODUCT = unpinProduct;
  window.NB_LOGOUT = () => {
    logoutCurrentUser();
    location.reload();
  };

  // ================= INIT =================
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers();
    initAuthUI();
    initFilters();
    renderPinnedHero();
    renderAll();
  });
})();
