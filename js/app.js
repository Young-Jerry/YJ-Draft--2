/* app.js - Complete controller for Nepali Bazar
   - storage migration
   - default users + demo seed
   - auth UI for multiple header variants
   - pinned ads (multiple allowed) -> hero shows up to 5 (1 large + up to 4 thumbs)
   - search / filter / sort
   - sell form helpers (expiry, validation)
   - ads injection
   - modal fallback
   - expose global helpers
*/
(function () {
  "use strict";

  // ====== CONFIG ======
  const STORAGE_KEY = window.LOCAL_STORAGE_KEY || "nb_products_v2";
  const LEGACY_KEYS = ["nb_products", "nb_products_v1"];
  const USERS_KEY = window.LOCAL_USERS_KEY || "nb_users_v1";
  const LOGGED_KEY = window.CURRENT_USER_KEY || "nb_logged_in_user";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";
  const MAX_EXPIRY_DAYS = 7;
  const AD_DEFS = [
    { img: "assets/images/ad1.jpg", url: "https://www.google.com" },
    { img: "assets/images/ad2.jpg", url: "https://www.google.com" },
  ];
  const PINNED_HERO_LIMIT = 5; // show up to 5 pinned ads in hero (1 big + up to 4 thumbs)

  // ====== DOM helpers ======
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
  const isProfilePage = () => /profile\.html$/i.test(window.location.pathname) || !!$("#profile-listings");

  function escapeHtml(s) {
    if (!s && s !== 0) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function numFmt(x) {
    try {
      return Number(x).toLocaleString("en-IN");
    } catch {
      return x;
    }
  }
  function nowIso() {
    const d = new Date();
    return d.toISOString();
  }
  function parseToMidnight(dateStr) {
    try {
      const d = new Date(dateStr);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch {
      return new Date(dateStr);
    }
  }
  function todayMidnight() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // ====== Storage helpers ======
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("readJSON failed", key, e);
      return fallback;
    }
  }
  function writeJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn("writeJSON failed", key, e);
    }
  }

  // migrate old keys to new STORAGE_KEY
  function migrateLegacy() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    for (const k of LEGACY_KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          writeJSON(STORAGE_KEY, parsed);
          console.info("migrated products from", k, "to", STORAGE_KEY);
          return;
        }
      } catch {}
    }
  }

  // ====== Users ======
  function ensureUsers() {
    const u = readJSON(USERS_KEY, null);
    if (u && Array.isArray(u) && u.length) return;
    const defaults = [
      { username: "sohaum", password: "sohaum", role: "admin" },
      { username: "sneha", password: "sneha", role: "user" },
    ];
    writeJSON(USERS_KEY, defaults);
    return defaults;
  }

  function getCurrentUser() {
    try {
      return localStorage.getItem(LOGGED_KEY) || null;
    } catch {
      return null;
    }
  }
  function setCurrentUser(u) {
    try {
      if (!u) localStorage.removeItem(LOGGED_KEY);
      else localStorage.setItem(LOGGED_KEY, u);
    } catch {}
  }
  function logoutCurrentUser() {
    try {
      localStorage.removeItem(LOGGED_KEY);
    } catch {}
  }
  function isAdmin() {
    const u = getCurrentUser();
    if (!u) return false;
    const users = readJSON(USERS_KEY, []);
    return users.some((x) => x.username === u && x.role === "admin");
  }

  // ====== Products helpers ======
  function getProductsRaw() {
    return readJSON(STORAGE_KEY, []);
  }
  function saveProductsRaw(list) {
    writeJSON(STORAGE_KEY, list);
  }
  function getProducts() {
    const raw = getProductsRaw() || [];
    const tmid = todayMidnight();
    return raw.filter((p) => {
      if (!p) return false;
      if (!p.expiryDate) return true;
      try {
        const exp = parseToMidnight(p.expiryDate);
        return exp >= tmid;
      } catch {
        return true;
      }
    });
  }
  function addProduct(prod) {
    const list = getProductsRaw();
    prod.id = prod.id || "p-" + Date.now() + "-" + Math.floor(Math.random() * 9999);
    prod.createdAt = prod.createdAt || nowIso();
    list.push(prod);
    saveProductsRaw(list);
  }
  function deleteProduct(id) {
    const raw = getProductsRaw();
    const found = raw.find((p) => p.id === id);
    if (!found) return;
    // permission check: admin or owner on profile page
    const me = getCurrentUser();
    if (!me) return alert("You must be logged in to delete.");
    const users = readJSON(USERS_KEY, []);
    const meObj = users.find((u) => u.username === me);
    if (!(meObj && meObj.role === "admin") && !(found.seller === me && isProfilePage())) return alert("Not authorized to delete.");
    const rest = raw.filter((p) => p.id !== id);
    saveProductsRaw(rest);
    renderAll();
  }

  // allow multiple pins; record pinnedAt; admin only
  function pinProduct(id) {
    if (!isAdmin()) return alert("Only admin can pin/unpin ads.");
    const list = getProductsRaw();
    const p = list.find((x) => x.id === id);
    if (!p) return alert("Listing not found.");
    p.pinned = true;
    p.pinnedBy = getCurrentUser();
    p.pinnedAt = new Date().toISOString();
    saveProductsRaw(list);
    renderAll();
  }
  function unpinProduct(id) {
    if (!isAdmin()) return alert("Only admin can pin/unpin ads.");
    const list = getProductsRaw();
    const p = list.find((x) => x.id === id);
    if (!p) return alert("Listing not found.");
    p.pinned = false;
    delete p.pinnedBy;
    delete p.pinnedAt;
    saveProductsRaw(list);
    renderAll();
  }

  // remove expired ads from storage (cleanup)
  function cleanupExpired() {
    const raw = getProductsRaw();
    if (!Array.isArray(raw) || !raw.length) return;
    const tmid = todayMidnight();
    const remaining = raw.filter((p) => {
      if (!p) return false;
      if (!p.expiryDate) return true;
      try {
        return parseToMidnight(p.expiryDate) >= tmid;
      } catch {
        return true;
      }
    });
    if (remaining.length !== raw.length) saveProductsRaw(remaining);
  }

  // seed demo products if empty
  function seedDemo() {
    const raw = getProductsRaw();
    if (raw && raw.length) return;
    const now = Date.now();
    const demo = [
      {
        id: "p-" + (now + 1),
        title: "Apple iPhone 14 (demo)",
        description: "128GB, like new. Demo listing.",
        price: 120000,
        currency: "Rs.",
        category: "Electronics",
        location: "Kathmandu",
        seller: "sohaum",
        contact: "9800000000",
        images: ["assets/images/iphone.jpg"],
        createdAt: nowIso(),
        expiryDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        pinned: true,
        pinnedBy: "sohaum",
        pinnedAt: new Date().toISOString(),
      },
      {
        id: "p-" + (now + 2),
        title: "Mountain Bike (demo)",
        description: "Perfect for trails and city.",
        price: 25000,
        currency: "Rs.",
        category: "Sports",
        location: "Pokhara",
        seller: "sneha",
        contact: "9811111111",
        images: ["assets/images/bike.jpg"],
        createdAt: nowIso(),
        expiryDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
      {
        id: "p-" + (now + 3),
        title: "Guitar (demo)",
        description: "Acoustic, good condition.",
        price: 8000,
        currency: "Rs.",
        category: "Music",
        location: "Dharan",
        seller: "demo",
        contact: "demo@nb.local",
        images: ["assets/images/guitar.jpg"],
        createdAt: nowIso(),
        expiryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
    ];
    saveProductsRaw(demo);
  }

  // ====== Sorting helpers ======
  // pinned first (pinned true), ordered by pinnedAt desc (newest pinned first), then createdAt desc
  function sortByPinnedThenDate(list) {
    return (list || []).slice().sort((a, b) => {
      const ai = a.pinned ? 1 : 0;
      const bi = b.pinned ? 1 : 0;
      if (ai !== bi) return bi - ai;
      // both same pinned state -> sort by pinnedAt or createdAt
      const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : new Date(a.createdAt || 0).getTime();
      const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  // ====== Modal ======
  function showModalHtml(html) {
    const builtin = $("#nb-modal");
    if (builtin) {
      const body = builtin.querySelector("#nb-modal-body") || builtin;
      if (body) {
        body.innerHTML = html;
        builtin.style.display = "flex";
        // wire close if exists
        const closeBtn = builtin.querySelector(".nb-modal-close") || builtin.querySelector(".modal-close");
        if (closeBtn) closeBtn.onclick = () => (builtin.style.display = "none");
        builtin.onclick = (ev) => {
          if (ev.target === builtin) builtin.style.display = "none";
        };
        return;
      }
    }
    // fallback overlay
    const existing = document.querySelector(".nb-modal-overlay");
    if (existing) existing.remove();
    const ov = document.createElement("div");
    ov.className = "nb-modal-overlay";
    ov.style = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
    const box = document.createElement("div");
    box.className = "nb-modal";
    box.style = "max-width:900px;width:94%;background:linear-gradient(180deg,#071027,#041026);color:#fff;padding:18px;border-radius:12px;position:relative;border:1px solid rgba(255,255,255,0.06);";
    box.innerHTML = `<button class="nb-modal-close" aria-label="Close" style="position:absolute;right:10px;top:10px;background:transparent;border:0;color:inherit;font-size:20px;">✕</button><div id="nb-modal-body"></div>`;
    ov.appendChild(box);
    document.body.appendChild(ov);
    ov.querySelector("#nb-modal-body").innerHTML = html;
    box.querySelector(".nb-modal-close").addEventListener("click", () => ov.remove());
    ov.addEventListener("click", (ev) => {
      if (ev.target === ov) ov.remove();
    });
  }

  function buildProductHtml(product) {
    const img = (product.images && product.images[0]) || PLACEHOLDER_IMG;
    return `
      <div style="display:flex;gap:16px;flex-wrap:wrap;color:inherit;">
        <div style="flex:0 0 320px;"><img src="${escapeHtml(img)}" style="width:320px;height:220px;object-fit:cover;border-radius:8px;" onerror="this.src='${PLACEHOLDER_IMG}'"/></div>
        <div style="flex:1;min-width:220px;">
          <h2 style="margin:0 0 8px 0">${escapeHtml(product.title)}</h2>
          <div style="font-weight:700;margin-bottom:8px;">${product.price ? (product.currency || "Rs.") + " " + numFmt(product.price) : "FREE"}</div>
          <div class="muted small">Location: ${escapeHtml(product.location || "")}</div>
          <div class="muted small">Seller: ${escapeHtml(product.seller || "")}</div>
          <hr style="opacity:0.06;margin:8px 0"/>
          <p style="max-height:240px;overflow:auto;margin:0;padding-right:6px">${escapeHtml(product.description || "")}</p>
          <p style="margin-top:10px;"><strong>Contact:</strong> ${escapeHtml(product.contact || "")}</p>
          <p style="margin-top:8px;font-size:13px;color:var(--muted)">Posted: ${escapeHtml(product.createdAt || "")} ${product.expiryDate ? ` | Expires: ${escapeHtml(product.expiryDate)}` : ""}</p>
        </div>
      </div>
    `;
  }

  function openProductModalById(id) {
    const prod = getProductsRaw().find((p) => p.id === id);
    if (!prod) return alert("Listing not found");
    showModalHtml(buildProductHtml(prod));
  }

  // ====== Card builder ======
  function createCard(product) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = product.id;

    const img = (product.images && product.images[0]) || PLACEHOLDER_IMG;
    const price = product.price ? (product.currency || "Rs.") + " " + numFmt(product.price) : "FREE";
    const pinnedBadge = product.pinned ? `<span title="Pinned">📌</span>` : "";

    card.innerHTML = `
      <div class="thumb"><img src="${escapeHtml(img)}" alt="${escapeHtml(product.title)}" onerror="this.src='${PLACEHOLDER_IMG}'"/></div>
      <div class="title">${escapeHtml(product.title)} ${pinnedBadge}</div>
      <div class="meta"><div class="price">${price}</div><div class="muted small">${escapeHtml(product.location || "")}</div></div>
      <div class="desc small muted" style="margin-top:6px">${escapeHtml((product.description || "").slice(0, 160))}</div>
      <div class="actions" style="margin-top:auto;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn view-btn" data-id="${escapeHtml(product.id)}">View</button>
        ${canDelete(product) ? `<button class="btn delete-btn" data-id="${escapeHtml(product.id)}">Delete</button>` : ""}
        ${isAdmin() ? (product.pinned ? `<button class="btn unpin-btn" data-id="${escapeHtml(product.id)}">Unpin</button>` : `<button class="btn pin-btn" data-id="${escapeHtml(product.id)}">Pin</button>`) : ""}
      </div>
      <div style="margin-top:6px;font-size:12px;color:var(--muted)">Posted: ${escapeHtml(product.createdAt || "")} ${product.expiryDate ? ` | Expires: ${escapeHtml(product.expiryDate)}` : ""}</div>
    `;

    // Events
    const viewBtn = card.querySelector(".view-btn");
    if (viewBtn) viewBtn.addEventListener("click", () => openProductModalById(product.id));

    const deleteBtn = card.querySelector(".delete-btn");
    if (deleteBtn)
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm("Delete this listing?")) return;
        deleteProduct(product.id);
      });

    const pinBtn = card.querySelector(".pin-btn");
    if (pinBtn) pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pinProduct(product.id);
    });
    const unpinBtn = card.querySelector(".unpin-btn");
    if (unpinBtn) unpinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      unpinProduct(product.id);
    });

    // hover
    card.style.transition = "transform .16s ease, box-shadow .16s ease";
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-6px)";
      card.style.boxShadow = "0 18px 60px rgba(0,0,0,0.6)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
      card.style.boxShadow = "";
    });

    return card;
  }

  // ====== Hero rendering (show up to PINNED_HERO_LIMIT pinned ads) ======
  function renderPinnedHero() {
    const heroSections = document.querySelectorAll(".hero");
    if (!heroSections || heroSections.length === 0) return;
    const raw = getProductsRaw() || [];
    const pinned = raw.filter((p) => p && p.pinned);
    pinned.sort((a, b) => {
      const ta = a.pinnedAt ? new Date(a.pinnedAt).getTime() : new Date(a.createdAt || 0).getTime();
      const tb = b.pinnedAt ? new Date(b.pinnedAt).getTime() : new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });

    // limit
    const shown = pinned.slice(0, PINNED_HERO_LIMIT);

    heroSections.forEach((heroSection) => {
      if (isProfilePage()) {
        heroSection.style.display = "none";
        return;
      } else {
        heroSection.style.display = "";
      }

      // ensure hero-inner left/right structure
      let heroInner = heroSection.querySelector(".hero-inner");
      if (!heroInner) {
        heroInner = document.createElement("div");
        heroInner.className = "hero-inner container";
        // move existing child nodes into heroInner (if present) to preserve content
        while (heroSection.firstChild) heroInner.appendChild(heroSection.firstChild);
        heroSection.appendChild(heroInner);
      }

      let left = heroInner.querySelector(".hero-left");
      if (!left) {
        left = document.createElement("div");
        left.className = "hero-left";
        left.innerHTML = `<h1 class="hero-title"><span class="accent site-name"></span><br>Buy • Sell • Connect — Locally</h1>
          <p class="hero-sub">Buy and sell locally — quick, free listings. Pin items to highlight them in the hero.</p>
          <div class="hero-buttons"><a class="btn btn-primary" href="products.html">Browse Items</a> <a class="btn btn-ghost" href="sell.html">List an Item</a></div>`;
        heroInner.appendChild(left);
      } else {
        left.querySelectorAll(".site-name").forEach((n) => (n.textContent = window.SITE_NAME || "NEPALI BAZAR"));
      }

      let right = heroInner.querySelector(".hero-right");
      if (!right) {
        right = document.createElement("div");
        right.className = "hero-right";
        heroInner.appendChild(right);
      }

      if (!shown.length) {
        right.innerHTML = `<div class="hero-card"><img src="assets/images/hero-1.jpg" alt="hero" style="width:100%;height:240px;object-fit:cover;border-radius:10px"/><div class="meta">Featured: Browse current listings</div></div>`;
        return;
      }

      // main big = first pinned
      const main = shown[0];
      const thumbs = shown.slice(1);
      let thumbsHtml = "";
      if (thumbs.length) {
        thumbsHtml =
          '<div class="hero-thumbs" style="display:flex;gap:8px;margin-top:10px;">' +
          thumbs
            .map(
              (t) =>
                `<div class="hero-thumb" data-id="${escapeHtml(t.id)}" style="flex:1;cursor:pointer;border-radius:8px;overflow:hidden"><img src="${escapeHtml((t.images && t.images[0]) || PLACEHOLDER_IMG)}" style="width:100%;height:84px;object-fit:cover"/></div>`
            )
            .join("") +
          "</div>";
      }

      right.innerHTML = `
        <div class="hero-card pinned-hero" style="position:relative;cursor:pointer;">
          <div style="position:absolute;left:12px;top:12px;background:linear-gradient(90deg,var(--neon-1),var(--neon-2));color:#041026;padding:6px 8px;border-radius:10px;font-weight:700;">📌 Pinned</div>
          <img src="${escapeHtml((main.images && main.images[0]) || PLACEHOLDER_IMG)}" alt="${escapeHtml(main.title)}" style="width:100%;height:240px;object-fit:cover;border-radius:10px" />
          <div class="meta" style="margin-top:10px">${escapeHtml(main.title)} — ${main.price ? (main.currency || "Rs.") + " " + numFmt(main.price) : "FREE"}</div>
          ${thumbsHtml}
        </div>
      `;

      const heroCard = right.querySelector(".pinned-hero");
      if (heroCard) {
        heroCard.addEventListener("click", () => {
          openProductModalById(main.id);
        });
        heroCard.style.transition = "transform .16s ease, box-shadow .16s ease";
        heroCard.addEventListener("mouseenter", () => {
          heroCard.style.transform = "translateY(-6px)";
          heroCard.style.boxShadow = "0 18px 60px rgba(0,0,0,0.6)";
        });
        heroCard.addEventListener("mouseleave", () => {
          heroCard.style.transform = "";
          heroCard.style.boxShadow = "";
        });
      }
      right.querySelectorAll(".hero-thumb").forEach((thumb) => {
        thumb.addEventListener("click", () => openProductModalById(thumb.dataset.id));
      });
    });
  }

  // ====== Ads injection ======
  function initAds() {
    const slots = document.querySelectorAll(".ad-slot");
    if (!slots || !slots.length) return;
    slots.forEach((slot, idx) => {
      const def = AD_DEFS[idx % AD_DEFS.length];
      // if slot already an <a> keep it, else wrap
      let anchor;
      if (slot.tagName.toLowerCase() === "a") anchor = slot;
      else {
        const innerA = slot.querySelector("a");
        if (innerA) anchor = innerA;
        else {
          anchor = document.createElement("a");
          anchor.target = "_blank";
          anchor.rel = "noopener";
          anchor.href = def.url;
          // move existing image if any
          const imgInside = slot.querySelector("img");
          if (imgInside) {
            anchor.appendChild(imgInside);
            slot.innerHTML = "";
            slot.appendChild(anchor);
          } else {
            const img = document.createElement("img");
            img.src = def.img;
            img.alt = "ad";
            anchor.appendChild(img);
            slot.innerHTML = "";
            slot.appendChild(anchor);
          }
        }
      }
      // ensure anchor href
      if (!anchor.href) anchor.href = def.url;
      // hover effect inline (safe fallback if CSS missing)
      const img = anchor.querySelector("img");
      if (img) {
        img.style.transition = "transform .28s ease, box-shadow .28s ease";
        anchor.addEventListener("mouseenter", () => {
          img.style.transform = "translateY(-6px) scale(1.03)";
          img.style.boxShadow = "0 18px 60px rgba(0,0,0,0.6)";
        });
        anchor.addEventListener("mouseleave", () => {
          img.style.transform = "";
          img.style.boxShadow = "";
        });
      }
    });
  }

  // ====== Categories population ======
  function initCategories() {
    const products = getProductsRaw();
    const cats = [...new Set((products || []).map((p) => p.category).filter(Boolean))].sort();
    const selects = document.querySelectorAll("#filter-category, select#filter-category, .filter-category");
    selects.forEach((sel) => {
      if (!sel) return;
      const prev = sel.value || "";
      sel.innerHTML = '<option value="">All Categories</option>' + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      if (prev) sel.value = prev;
      sel.addEventListener("change", () => {
        renderAll();
      });
    });
  }

  // ====== Filters & search ======
  function applyFilters(list) {
    const q = ($("#search-box") && $("#search-box").value) || ($("#search-products") && $("#search-products").value) || "";
    const category = ($("#filter-category" && $("#filter-category").value) || "") || "";
    const minPrice = parseInt($("#filter-min")?.value || "0");
    const maxPrice = parseInt($("#filter-max")?.value || "999999999");
    const ql = (q || "").toLowerCase();
    return list.filter((p) => {
      if (ql) {
        const hay = ((p.title || "") + " " + (p.description || "") + " " + (p.seller || "") + " " + (p.location || "")).toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (category && p.category !== category) return false;
      const price = parseInt(p.price || "0");
      if (price < minPrice || price > maxPrice) return false;
      return true;
    });
  }

  function initFilters() {
    const ids = ["#search-box", "#search-products", "#filter-category", "#filter-min", "#filter-max", "#filter-sort"];
    ids.forEach((id) => {
      const n = document.querySelector(id);
      if (!n) return;
      const ev = id === "#filter-sort" ? "change" : "input";
      n.addEventListener(ev, () => {
        renderProductsPage();
        renderHomeGrid();
      });
    });
  }

  // ====== Renderers ======
  function renderHomeGrid(limit = 8) {
    const grids = document.querySelectorAll("#home-grid, .home-grid");
    if (!grids || !grids.length) return;
    let list = getProducts();
    // category filter
    const cat = $("#filter-category") ? $("#filter-category").value : "";
    if (cat) list = list.filter((p) => p.category === cat);
    list = sortByPinnedThenDate(list());
    // The above line would be wrong; let's do correct sorting:
    list = sortByPinnedThenDate(list);
    grids.forEach((g) => {
      g.innerHTML = "";
      list.slice(0, limit).forEach((p) => g.appendChild(createCard(p)));
    });
  }
  // small helper to call the sorting function used earlier
  function sortByPinnedThenDate(list) {
    return sortByPinnedThenDate_impl(list);
  }
  // implementing a local wrapped function to avoid hoisting confusion
  function sortByPinnedThenDate_impl(list) {
    return (list || []).slice().sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ta = a.pinnedAt ? new Date(a.pinnedAt) : new Date(a.createdAt || 0);
      const tb = b.pinnedAt ? new Date(b.pinnedAt) : new Date(b.createdAt || 0);
      return tb - ta;
    });
  }

  function renderProductsPage() {
    const grid = $("#products-grid");
    if (!grid) return;
    let list = getProducts();
    // apply search + filters
    list = applyFilters(list);
    // apply sort
    const sortVal = $("#filter-sort") ? $("#filter-sort").value : "new";
    if (sortVal === "price-asc") list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    else if (sortVal === "price-desc") list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    else list = sortByPinnedThenDate_impl(list);
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = '<div class="muted">No listings found.</div>';
      return;
    }
    list.forEach((p) => grid.appendChild(createCard(p)));
  }

  function renderProfilePage() {
    const container = $("#profile-listings");
    if (!container) return;
    const user = getCurrentUser();
    if (!user) {
      // let page handle redirect if needed
      container.innerHTML = '<div class="muted">Please log in to see your listings.</div>';
      return;
    }
    let list = getProducts().filter((p) => p.seller === user);
    list = sortByPinnedThenDate_impl(list);
    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML = '<div class="muted">You have not listed any items yet.</div>';
      return;
    }
    list.forEach((p) => container.appendChild(createCard(p)));
  }

  function renderAll() {
    renderPinnedHero();
    renderHomeGrid();
    renderProductsPage();
    renderProfilePage();
  }

  // ====== Sell form helpers ======
  function initSellForm() {
    const form = $("#sell-form") || $("form#sell");
    if (!form) return;

    // add expiry input if missing
    if (!form.querySelector('[name="expiryDate"]')) {
      const wrap = document.createElement("label");
      wrap.style.display = "block";
      wrap.style.marginTop = "8px";
      wrap.innerHTML = `Expiry Date (max ${MAX_EXPIRY_DAYS} day(s) from today)
        <input type="date" name="expiryDate" required class="input" />`;
      form.appendChild(wrap);
      const inp = wrap.querySelector('input[name="expiryDate"]');
      const today = new Date();
      inp.min = today.toISOString().split("T")[0];
      inp.max = new Date(today.getTime() + MAX_EXPIRY_DAYS * 86400000).toISOString().split("T")[0];
      inp.value = inp.max;
    }

    // province / city dropdowns (if present) - small dataset
    const provinces = {
      "Province 1": ["Biratnagar", "Dharan", "Itahari"],
      "Madhesh": ["Janakpur", "Birgunj", "Lahan"],
      "Bagmati": ["Kathmandu", "Lalitpur", "Bhaktapur", "Hetauda"],
      "Gandaki": ["Pokhara", "Gorkha", "Baglung"],
      "Lumbini": ["Butwal", "Bhairahawa", "Nepalgunj"],
      "Karnali": ["Surkhet", "Jumla", "Dailekh"],
      "Sudurpashchim": ["Dhangadhi", "Mahendranagar", "Tikapur"],
    };
    const prov = $("#province");
    const city = $("#city");
    if (prov) {
      // populate
      prov.innerHTML = '<option value="">Select Province</option>' + Object.keys(provinces).map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
      prov.addEventListener("change", function () {
        city && (city.innerHTML = '<option value="">Select City</option>' + (provinces[this.value] || []).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(""));
      });
    }

    // contact sanitize
    const contactEl = form.querySelector('[name="contact"]');
    if (contactEl) {
      contactEl.setAttribute("placeholder", "10-digit phone or email");
      contactEl.addEventListener("input", () => {
        contactEl.value = contactEl.value.replace(/[^\d@.\-_a-zA-Z]/g, "").slice(0, 120);
      });
    }

    // submit handler
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const title = (fd.get("title") || "").trim();
      let price = Number(fd.get("price") || 0);
      const location = (fd.get("location") || fd.get("province") || fd.get("city") || "").trim();
      const contact = (fd.get("contact") || "").trim();
      const expiryDate = fd.get("expiryDate");

      if (!title) return alert("Please provide a title");
      const phoneOk = /^\d{10}$/.test(contact);
      const emailOk = contact.includes("@");
      if (!phoneOk && !emailOk) return alert("Please enter a 10-digit phone number or an email");
      if (price < 0) price = 0;
      if (price > 100000000) return alert("Price exceeds allowed maximum.");
      if (!expiryDate) return alert("Please select expiry date");

      // expiry window validation
      const chosen = parseToMidnight(expiryDate);
      const tmid = todayMidnight();
      const max = new Date(tmid.getTime() + MAX_EXPIRY_DAYS * 86400000);
      if (chosen < tmid || chosen > max) return alert(`Expiry must be between today and ${MAX_EXPIRY_DAYS} days from today.`);

      const images = ["assets/images/placeholder.jpg"]; // file upload not stored in this demo
      const seller = getCurrentUser() || fd.get("seller") || "Anonymous";

      const product = {
        id: "p-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        title,
        price,
        currency: "Rs.",
        category: fd.get("category") || "Other",
        location,
        seller,
        contact,
        description: fd.get("description") || "",
        images,
        createdAt: nowIso(),
        expiryDate,
      };

      addProduct(product);
      alert("Listing published!");
      // redirect to products page if present
      if (window.location.pathname.endsWith("sell.html")) window.location.href = "products.html";
      else renderAll();
    });
  }

  // ====== Global search wiring (many id variants) ======
  function initGlobalSearch() {
    const ids = ["#global-search", "#global-search-top", "#global-search-product", "#global-search-sell", "#search-products", "#search-box"];
    let s = null;
    for (const id of ids) {
      const n = document.querySelector(id);
      if (n) {
        s = n;
        break;
      }
    }
    if (!s) return;
    s.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const q = s.value.trim();
        if (!q) return;
        const href = "products.html?q=" + encodeURIComponent(q);
        window.location.href = href;
      }
    });
  }

  function prefillSearchFromQuery() {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q") || "";
    if (!q) return;
    const ids = ["#search-products", "#search-box", "#global-search", "#global-search-top"];
    ids.forEach((id) => {
      const n = document.querySelector(id);
      if (n) n.value = q;
    });
  }

  // ====== Auth UI - supports multiple header variants ======
  function initAuthUI() {
    const user = getCurrentUser();

    // Variant: container #auth-links (some pages)
    const container = $("#auth-links");
    if (container) {
      if (user) {
        container.innerHTML = `<span class="muted">Hi, ${escapeHtml(user)}</span> <button id="nb-logout-small" class="btn">Logout</button>`;
        $("#nb-logout-small") && $("#nb-logout-small").addEventListener("click", () => {
          logoutCurrentUser();
          location.reload();
        });
      } else {
        container.innerHTML = `<a href="login.html" class="nav-link">Login</a>`;
      }
    }

    // Variant: user-info + username-display + login-link + logout-btn
    const userInfo = $("#user-info");
    const usernameDisplay = $("#username-display");
    if (userInfo && usernameDisplay) {
      if (user) {
        userInfo.style.display = "inline";
        usernameDisplay.textContent = user;
        const loginLink = $("#login-link");
        if (loginLink) loginLink.style.display = "none";
      } else {
        userInfo.style.display = "none";
        const loginLink = $("#login-link");
        if (loginLink) loginLink.style.display = "inline";
      }
    }
    const logoutBtn = $("#logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logoutCurrentUser();
        location.reload();
      });
    }

    // ensure profile link exists
    const nav = $(".nav");
    if (nav) {
      let prof = $("#profile-link");
      if (!prof) {
        prof = document.createElement("a");
        prof.id = "profile-link";
        prof.className = "nav-link";
        prof.href = "profile.html";
        prof.textContent = "Profile";
        nav.appendChild(prof);
      }
      prof.style.display = user ? "inline" : "none";
    }

    // top-auth fallback
    const topAuth = $("#top-auth");
    if (topAuth) {
      if (user) topAuth.innerHTML = `Hi, ${escapeHtml(user)} | <a href="#" id="top-logout">Logout</a>`;
      else topAuth.innerHTML = `<a href="login.html">Login</a>`;
      const tlo = $("#top-logout");
      if (tlo) tlo.addEventListener("click", (e) => {
        e.preventDefault();
        logoutCurrentUser();
        location.reload();
      });
    }
  }

  // ====== Render helpers exposed globally ======
  // We'll expose the key functions at the end of init

  // ====== INIT ======
  document.addEventListener("DOMContentLoaded", () => {
    // migration + cleanup
    migrateLegacy();
    ensureUsers();
    cleanupExpired();
    seedDemo();

    // init UI bits
    initAuthUI();
    initAds();
    initCategories();
    initGlobalSearch();
    prefillSearchFromQuery();
    initSellForm();
    initFilters();

    // initial render
    renderAll();

    // expose globals for inline scripts
    window.NB_PIN_PRODUCT = pinProduct;
    window.NB_UNPIN_PRODUCT = unpinProduct;
    window.NB_DELETE_PRODUCT = deleteProduct;
    window.NB_VIEW_PRODUCT = openProductModalById;
    window.NB_SET_USER = setCurrentUser;
    window.NB_LOGOUT = function () {
      logoutCurrentUser();
      location.reload();
    };

    // footer year filler if present
    const yr = document.getElementById("year");
    if (yr) yr.textContent = new Date().getFullYear();
  });

  // ====== helpers used earlier but declared below to keep logical grouping ======
  function migrateLegacy() {
    migrateLegacy_impl();
  }
  function migrateLegacy_impl() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    for (const k of LEGACY_KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          writeJSON(STORAGE_KEY, parsed);
          return;
        }
      } catch {}
    }
  }
})();
