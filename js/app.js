/* ==========================================================================
   app.js – Stable Controller for Nepali Bazar (2025 rewrite + Base64 storage + patches)
   ========================================================================== */

(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_v3";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";

  // ------------------ HELPERS ------------------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const escapeHtml = (str = "") =>
    str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const numberWithCommas = (x) => isNaN(x) ? x : Number(x).toLocaleString("en-IN");
  const todayMidnight = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const parseDate = (d) => (d ? new Date(d.split("T")[0] + "T00:00:00") : null);
  const nowIso = () => { const d = new Date(); return d.toISOString().slice(0, 16).replace("T", " "); };

  // ------------------ STORAGE ------------------
  const readJSON = (k, fb) => { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fb; } catch { return fb; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { alert("⚠️ Storage full! Please delete some listings."); } };
  const getAllProducts = () => readJSON(STORAGE_KEY, []);
  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);
  const getActiveProducts = () => getAllProducts().filter((p) => !p.expiryDate || parseDate(p.expiryDate) >= todayMidnight());
  const addProduct = (p) => { const list = getAllProducts(); p.id = p.id || "p-" + Date.now(); p.createdAt = p.createdAt || nowIso(); list.push(p); saveProducts(list); };

  // ------------------ USERS ------------------
  const ensureDefaultUsers = () => {
    const users = readJSON(USERS_KEY, []);
    if (!users.length) {
      writeJSON(USERS_KEY, [
        { username: "sohaum", password: "sohaum", role: "admin" },
        { username: "sneha", password: "sneha", role: "user" },
      ]);
    }
  };
  const getCurrentUser = () => localStorage.getItem(LOGGED_IN_KEY);
  const logoutUser = () => localStorage.removeItem(LOGGED_IN_KEY);
  const isAdmin = () => { const u = getCurrentUser(); return readJSON(USERS_KEY, []).some((usr) => usr.username === u && usr.role === "admin"); };

  // ------------------ AUTH UI ------------------
  const initAuthUI = () => {
    const user = getCurrentUser();
    const loginLink = $("#login-link"); const userInfo = $("#user-info"); const usernameDisplay = $("#username-display");
    if (loginLink && userInfo && usernameDisplay) {
      if (user) {
        loginLink.style.display = "none"; userInfo.style.display = "inline-block"; usernameDisplay.textContent = user;
        $("#logout-btn")?.addEventListener("click", (e) => { e.preventDefault(); logoutUser(); location.reload(); });
      } else { loginLink.style.display = "inline-block"; userInfo.style.display = "none"; }
    }
  };

  // ------------------ CARDS ------------------
const canDelete = (p) => isAdmin() || (getCurrentUser() && getCurrentUser() === p.seller);

const card = (p, compact = false) => {
  const div = document.createElement("div");
  div.className = compact ? "card compact" : "card";
  div.innerHTML = `
    <div class="thumb"><img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" /></div>
    <div class="title">${escapeHtml(p.title)} ${p.pinned ? "📌" : ""}</div>
    <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
    ${compact
      ? `<button class="view-btn">View</button>`   /* ✅ show button for pinned */
      : `<div class="actions">
          <button class="btn view">View</button>
          ${canDelete(p) ? `<button class="btn delete">Delete</button>` : ""}
          ${isAdmin() ? `<button class="btn ${p.pinned ? "unpin" : "pin"}">${p.pinned ? "Unpin" : "Pin"}</button>` : ""}
        </div>`}
  `;

  // View (normal + compact)
  div.querySelector(".view")?.addEventListener("click", () => showModal(p));
  div.querySelector(".view-btn")?.addEventListener("click", () => showModal(p));

  // Delete
  div.querySelector(".delete")?.addEventListener("click", () => {
    if (confirm("Delete this ad?")) {
      const list = getAllProducts().filter((x) => x.id !== p.id);
      saveProducts(list); renderAll();
    }
  });

  // Pin / Unpin
  div.querySelector(".pin")?.addEventListener("click", () => {
    const list = getAllProducts().map((x) => x.id === p.id ? { ...x, pinned: true } : x);
    saveProducts(list); renderAll();
  });
  div.querySelector(".unpin")?.addEventListener("click", () => {
    const list = getAllProducts().map((x) => x.id === p.id ? { ...x, pinned: false } : x);
    saveProducts(list); renderAll();
  });

  return div;
};


    // View
    div.querySelector(".view")?.addEventListener("click", () => showModal(p));
    if (compact) { // hover modal for pinned ads in hero
      div.addEventListener("mouseenter", () => showModal(p));
    }

    // Delete
    div.querySelector(".delete")?.addEventListener("click", () => {
      if (confirm("Delete this ad?")) {
        const list = getAllProducts().filter((x) => x.id !== p.id);
        saveProducts(list); renderAll();
      }
    });

    // Pin / Unpin
    div.querySelector(".pin")?.addEventListener("click", () => {
      const list = getAllProducts().map((x) => x.id === p.id ? { ...x, pinned: true } : x);
      saveProducts(list); renderAll();
    });
    div.querySelector(".unpin")?.addEventListener("click", () => {
      const list = getAllProducts().map((x) => x.id === p.id ? { ...x, pinned: false } : x);
      saveProducts(list); renderAll();
    });
    return div;
  };

  // ------------------ MODAL ------------------
  const showModal = (p) => {
    let modal = $("#nb-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "nb-modal"; modal.className = "nb-modal";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="nb-modal-content">
        <div id="nb-modal-body">
          <h2>${escapeHtml(p.title)}</h2>
          <img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" />
          <p>${escapeHtml(p.description || "")}</p>
          <p><b>Contact:</b> ${escapeHtml(p.contact || "N/A")}</p>
        </div>
        <button class="close">Close</button>
      </div>
    `;
    modal.style.display = "flex";
    modal.querySelector(".close").onclick = () => (modal.style.display = "none");
    modal.onclick = (e) => e.target === modal && (modal.style.display = "none");
  };

  // ------------------ RENDERERS ------------------
  const renderGrid = (sel, list, compact = false) => {
    $$(sel).forEach((grid) => {
      grid.innerHTML = "";
      list.forEach((p) => grid.appendChild(card(p, compact)));
    });
  };

  const renderHeroPinned = () => {
    const pinnedWrap = $("#pinned-ads");
    if (!pinnedWrap) return;
    const pinned = getActiveProducts()
      .filter((p) => p.pinned)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    pinnedWrap.innerHTML = "";
    if (!pinned.length) { pinnedWrap.innerHTML = `<p class="muted">No pinned ads yet.</p>`; return; }
    pinned.forEach((p) => pinnedWrap.appendChild(card(p, true)));
  };

  const renderAll = () => {
    // Pinned first in latest listings
    const products = getActiveProducts().sort((a, b) => (b.pinned === true) - (a.pinned === true) || new Date(b.createdAt) - new Date(a.createdAt));
    renderGrid("#home-grid, .home-grid, #products-grid", products);
    renderGrid("#profile-listings", products.filter((p) => p.seller === getCurrentUser()));
    renderHeroPinned();
  };

  // ------------------ SELL FORM HANDLER (Base64 storage + restrict login) ------------------
  const initSellForm = () => {
    const form = $("#sell-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!getCurrentUser()) { alert("⚠️ You must be logged in to post a listing."); return; }
      const fd = new FormData(form);
      const files = fd.getAll("images"); const images = []; let processed = 0;
      if (!files.length) { finalize([]); return; }
      files.forEach((f) => {
        if (f && f.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target.result.length < 2048000) { images.push(ev.target.result); }
            processed++; if (processed === files.length) finalize(images);
          };
          reader.readAsDataURL(f);
        } else { processed++; if (processed === files.length) finalize(images); }
      });

      function finalize(imgs) {
        const product = {
          title: fd.get("title"), category: fd.get("category"),
          price: parseFloat(fd.get("price") || 0),
          province: fd.get("province"), city: fd.get("city"),
          contact: fd.get("contact"), description: fd.get("description"),
          expiryDate: fd.get("expiryDate"), images: imgs,
          seller: getCurrentUser(), pinned: false,
        };
        addProduct(product);
        const msg = $("#sell-msg"); if (msg) { msg.textContent = "✅ Listing published successfully!"; msg.style.color = "limegreen"; }
        form.reset(); renderAll();
      }
    });
  };

  // ------------------ SEARCH BAR ------------------
  const initSearchBar = () => {
    const searchInput = $("#header-search");
    if (!searchInput) return;
    searchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        const term = searchInput.value.toLowerCase();
        const results = getActiveProducts().filter((p) =>
          p.title.toLowerCase().includes(term) || (p.description || "").toLowerCase().includes(term)
        );
        renderGrid("#home-grid, .home-grid, #products-grid", results);
      }
    });
  };

  // ------------------ INIT ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers(); initAuthUI(); initSellForm(); initSearchBar(); renderAll();
    window.NB_LOGOUT = () => { logoutUser(); location.reload(); };
  });
})();
