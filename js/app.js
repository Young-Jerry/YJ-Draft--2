/* ==========================================================================
   app.js – Stable Controller for Nepali Bazar (base working version)
   ========================================================================== */

(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_working";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";

  // ------------------ HELPERS ------------------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

  const escapeHtml = (str = "") =>
    String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));

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
    } catch (e) {
      console.error("readJSON error", e);
      return fb;
    }
  };

  const writeJSON = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.error("writeJSON error (storage maybe full)", e);
      alert("Storage error. Try deleting some old listings.");
    }
  };

  const getAllProducts = () => readJSON(STORAGE_KEY, []);
  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);

  const getActiveProducts = () =>
    getAllProducts().filter(
      (p) => !p.expiryDate || parseDate(p.expiryDate) >= todayMidnight()
    );

  const addProduct = (p) => {
    const list = getAllProducts();
    if (!p.id) p.id = "p-" + Date.now();
    if (!p.createdAt) p.createdAt = nowIso();
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
    const users = readJSON(USERS_KEY, []);
    return users.some((usr) => usr.username === u && usr.role === "admin");
  };

  // ------------------ AUTH UI ------------------
  const initAuthUI = () => {
    const user = getCurrentUser();
    const loginLink = $("#login-link");
    const userInfo = $("#user-info");
    const usernameDisplay = $("#username-display");
    if (!loginLink || !userInfo || !usernameDisplay) return;

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
  };

  // ------------------ CARD / MODAL VIEW ------------------
  const canDelete = (p) =>
    isAdmin() || (getCurrentUser() && getCurrentUser() === p.seller);

  const card = (p, compact = false) => {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";
    div.dataset.id = p.id;

    let actionsHtml = "";
    if (!compact) {
      actionsHtml = `
        <div class="actions">
          <button class="btn view-btn">View</button>
          ${canDelete(p) ? `<button class="btn delete">Delete</button>` : ""}
          ${isAdmin() ? `<button class="btn ${p.pinned ? "unpin" : "pin"}">${p.pinned ? "Unpin" : "Pin"}</button>` : ""}
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="actions">
          <button class="btn view-btn">View</button>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="thumb"><img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" /></div>
      <div class="title">${escapeHtml(p.title)} ${p.pinned ? "📌" : ""}</div>
      <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
      ${actionsHtml}
    `;

    // EVENT: View button
    div.querySelector(".view-btn")?.addEventListener("click", () => showModal(p));

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
        x.id === p.id ? { ...x, pinned: !p.pinned } : x
      );
      saveProducts(list);
      renderAll();
    });

    return div;
  };

  const showModal = (p) => {
    const modal = $("#nb-modal");
    const modalBody = $("#nb-modal-body");
    if (!modal || !modalBody) return;

    modalBody.innerHTML = `
      <h2>${escapeHtml(p.title)}</h2>
      <img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" />
      <p>${escapeHtml(p.description || "")}</p>
      <p><b>Contact:</b> ${escapeHtml(p.contact || "N/A")}</p>
    `;
    modal.style.display = "flex";
  };

  // ------------------ RENDERERS ------------------
  const renderGrid = (sel, list, compact = false) => {
    $$(sel).forEach((grid) => {
      grid.innerHTML = "";
      list.forEach((p) => {
        grid.appendChild(card(p, compact));
      });
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
    pinned.forEach((p) => pinnedWrap.appendChild(card(p, true)));
  };

  const renderAll = () => {
    // pinned items sorted first
    const products = getActiveProducts().sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // fallback by creation date
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    renderGrid("#home-grid, .home-grid, #products-grid", products);
    renderHeroPinned();
  };

  // ------------------ SELL FORM HANDLER ------------------
  const initSellForm = () => {
    const form = $("#sell-form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      // only logged in users allowed
      if (!getCurrentUser()) {
        alert("You must log in to post a listing.");
        return;
      }

      const fd = new FormData(form);
      const files = fd.getAll("images");
      const images = [];
      let processed = 0;

      if (!files.length) {
        finalize([]);
      } else {
        files.forEach((f) => {
          if (f && f.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              images.push(ev.target.result);  // always accept for now
              processed++;
              if (processed === files.length) finalize(images);
            };
            reader.readAsDataURL(f);
          } else {
            processed++;
            if (processed === files.length) finalize(images);
          }
        });
      }

      function finalize(imgs) {
        const product = {
          title: fd.get("title"),
          category: fd.get("category"),
          price: parseFloat(fd.get("price") || "0"),
          province: fd.get("province"),
          city: fd.get("city"),
          contact: fd.get("contact"),
          description: fd.get("description"),
          expiryDate: fd.get("expiryDate"),
          images: imgs,
          seller: getCurrentUser(),
          pinned: false,
          createdAt: nowIso(),
          id: "p-" + Date.now(),
        };
        addProduct(product);

        const msg = $("#sell-msg");
        if (msg) {
          msg.textContent = "✅ Listing published!";
          msg.style.color = "limegreen";
        }
        form.reset();
        renderAll();
      }
    });
  };

  // ------------------ MODAL CLOSE AREA ------------------
  const initModalClose = () => {
    const modal = $("#nb-modal");
    if (!modal) return;
    // close by clicking outside or close button
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.classList.contains("close")) {
        modal.style.display = "none";
      }
    });
  };

  // ------------------ INIT ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers();
    initAuthUI();
    initSellForm();
    initModalClose();
    renderAll();
    window.NB_LOGOUT = () => {
      logoutUser();
      location.reload();
    };
  });
})();
