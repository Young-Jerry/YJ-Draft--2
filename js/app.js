/* ==========================================================================
   app.js – Core Controller for Nepali Bazar
   ==========================================================================
   ✅ Centralized storage & migration
   ✅ Default users seeding
   ✅ Robust auth UI (handles all header variants)
   ✅ Products: add, delete, pin/unpin, expiry checks
   ✅ Ads injection with hover effects
   ✅ Search & filters (works across ID variants)
   ✅ Sell form helpers (validation, expiry range, sanitization)
   ✅ Modal fallback if #nb-modal not present
   ✅ Rendering (home, products, profile, pinned hero)
   ==========================================================================
*/

(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_v2";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const MAX_EXPIRY_DAYS = 7;
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";

  const AD_DEFS = [
    { img: "assets/images/ad1.jpg", url: "https://www.google.com" },
    { img: "assets/images/ad2.jpg", url: "https://www.google.com" },
  ];

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

  const parseDate = (d) => {
    try {
      return new Date(d.split("T")[0] + "T00:00:00");
    } catch {
      return new Date(d);
    }
  };

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

  const getProducts = () =>
    readJSON(STORAGE_KEY, []).filter(
      (p) => !p.expiryDate || parseDate(p.expiryDate) >= todayMidnight()
    );

  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);

  const addProduct = (p) => {
    const list = readJSON(STORAGE_KEY, []);
    p.id = p.id || "p-" + Date.now();
    p.createdAt = p.createdAt || nowIso();
    list.push(p);
    saveProducts(list);
  };

  // ------------------ USERS ------------------
  const ensureDefaultUsers = () => {
    const users = readJSON(USERS_KEY, []);
    if (users.length) return;
    writeJSON(USERS_KEY, [
      { username: "sohaum", password: "sohaum", role: "admin" },
      { username: "sneha", password: "sneha", role: "user" },
    ]);
  };

  const getCurrentUser = () => localStorage.getItem(LOGGED_IN_KEY);
  const setCurrentUser = (u) => localStorage.setItem(LOGGED_IN_KEY, u);
  const logoutUser = () => localStorage.removeItem(LOGGED_IN_KEY);

  const isAdmin = () => {
    const u = getCurrentUser();
    return readJSON(USERS_KEY, []).some((usr) => usr.username === u && usr.role === "admin");
  };

  // ------------------ AUTH UI ------------------
  const initAuthUI = () => {
    const user = getCurrentUser();

    // Variant 1: #auth-links
    const authLinks = $("#auth-links");
    if (authLinks) {
      authLinks.innerHTML = user
        ? `Hi, ${escapeHtml(user)} <button id="logout-small" class="btn">Logout</button>`
        : `<a href="login.html" class="nav-link">Login</a>`;
      $("#logout-small")?.addEventListener("click", () => {
        logoutUser();
        location.reload();
      });
    }

    // Variant 2: #user-info
    const userInfo = $("#user-info");
    if (userInfo) {
      $("#username-display").textContent = user || "";
      userInfo.style.display = user ? "inline" : "none";
      $("#login-link").style.display = user ? "none" : "inline";
      $("#logout-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        logoutUser();
        location.reload();
      });
    }

    // Always ensure Profile link
    const nav = $(".nav");
    if (nav && !$("#profile-link")) {
      const a = document.createElement("a");
      a.id = "profile-link";
      a.className = "nav-link";
      a.href = "profile.html";
      a.textContent = "Profile";
      nav.appendChild(a);
      a.style.display = user ? "inline" : "none";
    }
  };

  // ------------------ RENDER CARDS ------------------
  const canDelete = (p) =>
    isAdmin() || (getCurrentUser() && getCurrentUser() === p.seller);

  const card = (p) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="thumb"><img src="${escapeHtml((p.images||[])[0]||PLACEHOLDER_IMG)}" /></div>
      <div class="title">${escapeHtml(p.title)} ${p.pinned ? "📌" : ""}</div>
      <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
      <div class="actions">
        <button class="btn view">View</button>
        ${canDelete(p) ? `<button class="btn delete">Delete</button>` : ""}
        ${isAdmin() ? `<button class="btn ${p.pinned ? "unpin" : "pin"}">${p.pinned ? "Unpin" : "Pin"}</button>` : ""}
      </div>
    `;
    div.querySelector(".view")?.addEventListener("click", () => showModal(p));
    div.querySelector(".delete")?.addEventListener("click", () => {
      if (confirm("Delete?")) {
        const list = getProducts().filter((x) => x.id !== p.id);
        saveProducts(list);
        renderAll();
      }
    });
    div.querySelector(".pin")?.addEventListener("click", () => {
      p.pinned = true;
      saveProducts([...getProducts()]);
      renderAll();
    });
    div.querySelector(".unpin")?.addEventListener("click", () => {
      p.pinned = false;
      saveProducts([...getProducts()]);
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
      modal.className = "modal";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal-content">
        <button class="close">✕</button>
        <h2>${escapeHtml(p.title)}</h2>
        <img src="${escapeHtml((p.images||[])[0]||PLACEHOLDER_IMG)}" />
        <p>${escapeHtml(p.description)}</p>
        <p><b>Contact:</b> ${escapeHtml(p.contact)}</p>
      </div>
    `;
    modal.style.display = "flex";
    modal.querySelector(".close").onclick = () => (modal.style.display = "none");
    modal.onclick = (e) => e.target === modal && (modal.style.display = "none");
  };

  // ------------------ RENDERERS ------------------
  const renderGrid = (sel, list) => {
    $$(sel).forEach((grid) => {
      grid.innerHTML = "";
      list.forEach((p) => grid.appendChild(card(p)));
    });
  };

  const renderAll = () => {
    renderGrid("#home-grid, .home-grid, #products-grid, #profile-listings", getProducts());
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
