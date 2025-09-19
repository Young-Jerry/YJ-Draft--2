/* ==========================================================================
   app.js – Core Controller for Nepali Bazar (2025 clean rewrite)
   ==========================================================================
   ✅ LocalStorage: products & users (never lose expired ads)
   ✅ Auth: handles all header variants, login/logout/profile link
   ✅ Products: add, delete, pin/unpin, expiry checks
   ✅ Hero: up to 5 latest pinned ads, neat layout
   ✅ Cards: normal vs compact (hero)
   ✅ Modal: fallback-safe
   ✅ Rendering: home, products, profile, pinned hero
   ========================================================================== */

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

  const getAllProducts = () => readJSON(STORAGE_KEY, []);

  const getActiveProducts = () =>
    getAllProducts().filter(
      (p) => !p.expiryDate || parseDate(p.expiryDate) >= todayMidnight()
    );

  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);

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
      $("#login-link") && ($("#login-link").style.display = user ? "none" : "inline");
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

  // ------------------ CARDS ------------------
  const canDelete = (p) =>
    isAdmin() || (getCurrentUser() && getCurrentUser() === p.seller);

  const card = (p, compact = false) => {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";
    div.innerHTML = `
      <div class="thumb"><img src="${escapeHtml((p.images||[])[0]||PLACEHOLDER_IMG)}" /></div>
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

    div.querySelector(".view")?.addEventListener("click", () => showModal(p));
    div.querySelector(".delete")?.addEventListener("click", () => {
      if (confirm("Delete?")) {
        const list = getAllProducts().filter((x) => x.id !== p.id);
        saveProducts(list);
        renderAll();
      }
    });
    div.querySelector(".pin")?.addEventListener("click", () => {
      p.pinned = true;
      saveProducts([...getAllProducts()]);
      renderAll();
    });
    div.querySelector(".unpin")?.addEventListener("click", () => {
      p.pinned = false;
      saveProducts([...getAllProducts()]);
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
        <p>${escapeHtml(p.description || "")}</p>
        <p><b>Contact:</b> ${escapeHtml(p.contact || "N/A")}</p>
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
    const heroRight = $(".hero-right");
    if (!heroRight) return;

    const pinned = getActiveProducts()
      .filter((p) => p.pinned)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    heroRight.innerHTML = "";
    if (pinned.length === 0) {
      heroRight.innerHTML = `<p class="muted">No pinned ads yet.</p>`;
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "pinned-grid";
    pinned.forEach((p) => wrap.appendChild(card(p, true)));
    heroRight.appendChild(wrap);
  };

  const renderAll = () => {
    renderGrid("#home-grid, .home-grid, #products-grid", getActiveProducts());
    renderGrid("#profile-listings", getActiveProducts().filter(p => p.seller === getCurrentUser()));
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
