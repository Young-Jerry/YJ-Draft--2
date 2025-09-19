/* ==========================================================================
   app.js – Stable Controller for Nepali Bazar (2025 rewrite)
   ========================================================================== */

(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_v2";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";

  // ------------------ HELPERS ------------------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

  const escapeHtml = (str = "") =>
    str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const numberWithCommas = (x) =>
    isNaN(x) ? x : Number(x).toLocaleString("en-IN");

  const todayMidnight = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const parseDate = (d) => (d ? new Date(d.split("T")[0] + "T00:00:00") : null);

  const nowIso = () => {
    const d = new Date();
    return d.toISOString().slice(0, 16).replace("T", " ");
  };

  // ------------------ STORAGE ------------------
  const readJSON = (k, fb) => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fb;
    } catch {
      return fb;
    }
  };
  const writeJSON = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  const getAllProducts = () => readJSON(STORAGE_KEY, []);
  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);

  const getActiveProducts = () =>
    getAllProducts().filter(
      (p) => !p.expiryDate || parseDate(p.expiryDate) >= todayMidnight()
    );

  const addProduct = (p) => {
    const list = getAllProducts();
    p.id = p.id || "p-" + Date.now();
    p.createdAt = p.createdAt || nowIso();
    list.push(p);
    saveProducts(list);
  };

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

  const isAdmin = () => {
    const u = getCurrentUser();
    return readJSON(USERS_KEY, []).some(
      (usr) => usr.username === u && usr.role === "admin"
    );
  };

  // ------------------ AUTH UI ------------------
  const initAuthUI = () => {
    const user = getCurrentUser();

    const loginLink = $("#login-link");
    const userInfo = $("#user-info");
    const usernameDisplay = $("#username-display");

    if (loginLink && userInfo && usernameDisplay) {
      if (user) {
        loginLink.style.display = "none";
        userInfo.style.display = "inline-block";
        usernameDisplay.textContent = user;
        $("#logout-btn")?.addEventListener("click", (e) => {
          e.preventDefault();
          logoutUser();
          location.reload();
        });
      } else {
        loginLink.style.display = "inline-block";
        userInfo.style.display = "none";
      }
    }
  };

  // ------------------ CARDS ------------------
  const canDelete = (p) =>
    isAdmin() || (getCurrentUser() && getCurrentUser() === p.seller);

  const card = (p, compact = false) => {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";

    div.innerHTML = `
      <div class="thumb"><img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" /></div>
      <div class="title">${escapeHtml(p.title)} ${p.pinned ? "📌" : ""}</div>
      <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
      ${
        compact
          ? ""
          : `<div class="actions">
               <button class="btn view">View</button>
               ${canDelete(p) ? `<button class="btn delete">Delete</button>` : ""}
               ${isAdmin() ? `<button class="btn ${p.pinned ? "unpin" : "pin"}">${p.pinned ? "Unpin" : "Pin"}</button>` : ""}
             </div>`
      }
    `;

    // View
    div.querySelector(".view")?.addEventListener("click", () => showModal(p));

    // Delete
    div.querySelector(".delete")?.addEventListener("click", () => {
      if (confirm("Delete this ad?")) {
        const list = getAllProducts().filter((x) => x.id !== p.id);
        saveProducts(list);
        renderAll();
      }
    });

    // Pin / Unpin
    div.querySelector(".pin")?.addEventListener("click", () => {
      const list = getAllProducts().map((x) =>
        x.id === p.id ? { ...x, pinned: true } : x
      );
      saveProducts(list);
      renderAll();
    });
    div.querySelector(".unpin")?.addEventListener("click", () => {
      const list = getAllProducts().map((x) =>
        x.id === p.id ? { ...x, pinned: false } : x
      );
      saveProducts(list);
      renderAll();
    });

    return div;
  };

  // ------------------ MODAL ------------------
  const showModal = (p) => {
    let modal = $("#nb-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "nb-modal";
      modal.className = "nb-modal";
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
    modal.querySelector(".close").onclick = () =>
      (modal.style.display = "none");
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
    if (!pinned.length) {
      pinnedWrap.innerHTML = `<p class="muted">No pinned ads yet.</p>`;
      return;
    }
    pinned.forEach((p) => pinnedWrap.appendChild(card(p, true)));
  };

  const renderAll = () => {
    renderGrid("#home-grid, .home-grid, #products-grid", getActiveProducts());
    renderGrid(
      "#profile-listings",
      getActiveProducts().filter((p) => p.seller === getCurrentUser())
    );
    renderHeroPinned();
  };

  // ------------------ INIT ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers();
    initAuthUI();
    renderAll();
    window.NB_LOGOUT = () => {
      logoutUser();
      location.reload();
    };
  });
})();
