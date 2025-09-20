/* ==========================================================================
   app.js – Comprehensive controller for Nepali Bazar
   Features: custom modals, pin limit, gallery, confirmations, search, profile rendering
   ========================================================================== */
(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_working";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";
  const PIN_LIMIT = 5;
  const MAX_IMAGES = 6;

  // ------------------ HELPERS ------------------
  const $ = (s, p = document) => (p || document).querySelector(s);
  const $$ = (s, p = document) => Array.from((p || document).querySelectorAll(s));

  const escapeHtml = (str = "") =>
    String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const numberWithCommas = (x) => (isNaN(x) ? x : Number(x).toLocaleString("en-IN"));

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
      console.error("writeJSON error (maybe storage full)", e);
      alert("⚠️ Storage error. Try clearing old listings.");
    }
  };

  const getAllProducts = () => readJSON(STORAGE_KEY, []);
  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);

  const getActiveProducts = () =>
    getAllProducts().filter((p) => !p.expiryDate || parseDate(p.expiryDate) >= todayMidnight());

  const addProduct = (p) => {
    const list = getAllProducts();
    if (!p.id) p.id = "p-" + Date.now();
    if (!p.createdAt) p.createdAt = nowIso();
    list.push(p);
    saveProducts(list);
  };

  const updateProduct = (id, changes) => {
    const list = getAllProducts().map((x) => (x.id === id ? { ...x, ...changes } : x));
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
  const renderAuthLinks = () => {
    const el = $("#auth-links");
    if (!el) return;
    const user = getCurrentUser();
    if (user) {
      el.innerHTML = `
        <span>Welcome, <b>${escapeHtml(user)}</b></span> |
        <a href="#" id="logout-btn" class="nav-link">Logout</a>
      `;
      $("#logout-btn").addEventListener("click", (e) => {
        e.preventDefault();
        logoutUser();
        location.reload();
      });
    } else {
      el.innerHTML = `<a href="login.html" class="nav-link">Login</a>`;
    }
  };

  // ------------------ MODALS ------------------
  const Modal = {
    show(msg, opts = {}) {
      let modal = $("#nb-modal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "nb-modal";
        modal.className = "nb-modal-overlay";
        modal.innerHTML = `
          <div class="nb-modal">
            <div class="nb-modal-content"></div>
            <div class="nb-modal-actions"></div>
          </div>
        `;
        document.body.appendChild(modal);
      }
      $(".nb-modal-content", modal).innerHTML = msg;
      const actions = $(".nb-modal-actions", modal);
      actions.innerHTML = "";

      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = opts.okText || "OK";
      btn.addEventListener("click", () => this.hide());
      actions.appendChild(btn);

      modal.style.display = "flex";
    },
    hide() {
      const modal = $("#nb-modal");
      if (modal) modal.style.display = "none";
    },
  };

  const Confirm = (msg, cb) => {
    let modal = $("#nb-confirm");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "nb-confirm";
      modal.className = "nb-modal-overlay";
      modal.innerHTML = `
        <div class="nb-modal">
          <div class="nb-modal-content"></div>
          <div class="nb-modal-actions"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    $(".nb-modal-content", modal).innerHTML = msg;
    const actions = $(".nb-modal-actions", modal);
    actions.innerHTML = "";

    const yes = document.createElement("button");
    yes.className = "btn btn-danger";
    yes.textContent = "Yes";
    yes.addEventListener("click", () => {
      modal.style.display = "none";
      cb(true);
    });
    actions.appendChild(yes);

    const no = document.createElement("button");
    no.className = "btn";
    no.textContent = "No";
    no.addEventListener("click", () => {
      modal.style.display = "none";
      cb(false);
    });
    actions.appendChild(no);

    modal.style.display = "flex";
  };

  // ------------------ PIN SYSTEM ------------------
  const getPinnedIds = () => readJSON("nb_pins", []);
  const savePinnedIds = (ids) => writeJSON("nb_pins", ids);

  const togglePin = (id) => {
    let pins = getPinnedIds();
    if (pins.includes(id)) {
      pins = pins.filter((x) => x !== id);
    } else {
      if (pins.length >= PIN_LIMIT) {
        Modal.show(`❌ You can only pin up to ${PIN_LIMIT} listings.`);
        return;
      }
      pins.push(id);
    }
    savePinnedIds(pins);
    renderAllProducts();
  };

  const isPinned = (id) => getPinnedIds().includes(id);
  // ------------------ RENDERING PRODUCTS ------------------
  const card = (p, compact = false) => {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";
    div.dataset.id = p.id;

    let actions = "";
    if (!compact) {
      actions = `
        <div class="actions">
          <button class="btn view-btn">View</button>
          ${canDelete(p) ? `<button class="btn delete">Delete</button>` : ""}
          <button class="btn ${isPinned(p.id) ? "unpin" : "pin"}">
            ${isPinned(p.id) ? "Unpin" : "Pin"}
          </button>
        </div>
      `;
    } else {
      actions = `
        <div class="actions">
          <button class="btn view-btn">View</button>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="thumb">
        <img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" />
      </div>
      <div class="title">${escapeHtml(p.title)} ${isPinned(p.id) ? "📌" : ""}</div>
      <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
      ${actions}
    `;

    // event: view
    div.querySelector(".view-btn")?.addEventListener("click", () => showGallery(p));

    // event: delete
    div.querySelector(".delete")?.addEventListener("click", () => {
      Confirm("Delete this ad?", (ok) => {
        if (ok) {
          const list = getAllProducts().filter((x) => x.id !== p.id);
          saveProducts(list);
          renderAllProducts();
        }
      });
    });

    // event: pin/unpin
    div.querySelector(".pin")?.addEventListener("click", () => togglePin(p.id));
    div.querySelector(".unpin")?.addEventListener("click", () => togglePin(p.id));

    return div;
  };

  const renderGrid = (sel, list, compact = false) => {
    $$(sel).forEach((grid) => {
      grid.innerHTML = "";
      list.forEach((p) => grid.appendChild(card(p, compact)));
    });
  };

  const renderHeroPinned = () => {
    const wrap = $("#pinned-ads");
    if (!wrap) return;
    const pinned = getActiveProducts().filter((p) => isPinned(p.id)).slice(0, PIN_LIMIT);
    wrap.innerHTML = "";
    pinned.forEach((p) => wrap.appendChild(card(p, true)));
  };

  const renderAllProducts = () => {
    const products = getActiveProducts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderGrid("#home-grid, .home-grid, #products-grid", products);
    renderHeroPinned();
  };

  // ------------------ PRODUCT GALLERY MODAL ------------------
  const showGallery = (p) => {
    let modal = $("#gallery-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "gallery-modal";
      modal.className = "nb-modal-overlay";
      modal.innerHTML = `
        <div class="gallery-box">
          <span class="close">&times;</span>
          <div class="gallery-content">
            <button class="arrow left">&#9664;</button>
            <img class="gallery-img" src="" />
            <button class="arrow right">&#9654;</button>
          </div>
          <div class="gallery-info"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const imgEl = $(".gallery-img", modal);
    const infoEl = $(".gallery-info", modal);
    const closeBtn = $(".close", modal);
    const leftBtn = $(".left", modal);
    const rightBtn = $(".right", modal);

    let idx = 0;
    const imgs = p.images && p.images.length ? p.images : [PLACEHOLDER_IMG];

    const renderImage = () => {
      imgEl.src = imgs[idx];
      infoEl.innerHTML = `
        <h2>${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.description || "")}</p>
        <p><b>Contact:</b> ${escapeHtml(p.contact || "N/A")}</p>
        <p><b>Price:</b> ${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</p>
      `;
    };

    renderImage();

    leftBtn.onclick = () => {
      idx = (idx - 1 + imgs.length) % imgs.length;
      renderImage();
    };
    rightBtn.onclick = () => {
      idx = (idx + 1) % imgs.length;
      renderImage();
    };

    closeBtn.onclick = () => (modal.style.display = "none");
    modal.style.display = "flex";

    document.onkeydown = (e) => {
      if (e.key === "Escape") modal.style.display = "none";
      if (e.key === "ArrowLeft") leftBtn.click();
      if (e.key === "ArrowRight") rightBtn.click();
    };
  };
  // ------------------ SELL FORM ------------------
  const initSellForm = () => {
    const form = $("#sell-form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const obj = {
        id: uid(),
        title: fd.get("title"),
        description: fd.get("description"),
        category: fd.get("category"),
        price: parseInt(fd.get("price") || "0"),
        contact: fd.get("contact"),
        images: (fd.get("images") || "").split(",").map((x) => x.trim()).filter(Boolean),
        owner: currentUser()?.username || "guest",
        createdAt: new Date().toISOString(),
      };

      const list = getAllProducts();
      list.push(obj);
      saveProducts(list);

      alert("Ad posted!");
      form.reset();
      window.location.href = "products.html";
    });
  };

  // ------------------ CONFIRM BOX ------------------
  const Confirm = (msg, cb) => {
    let box = $("#confirm-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "confirm-box";
      box.className = "nb-modal";
      box.innerHTML = `
        <div class="nb-modal-content">
          <p id="confirm-msg"></p>
          <div class="form-actions">
            <button id="c-yes" class="btn btn-primary">Yes</button>
            <button id="c-no" class="btn btn-ghost">No</button>
          </div>
        </div>
      `;
      document.body.appendChild(box);
    }

    $("#confirm-msg").textContent = msg;
    box.style.display = "flex";

    $("#c-yes").onclick = () => {
      box.style.display = "none";
      cb(true);
    };
    $("#c-no").onclick = () => {
      box.style.display = "none";
      cb(false);
    };
  };

  // ------------------ SEARCH ------------------
  const initSearch = () => {
    const input = $("#header-search");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase();
      const products = getActiveProducts().filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
      );
      renderGrid("#products-grid", products);
    });
  };

  // ------------------ FILTERS ------------------
  const initFilters = () => {
    const bar = $(".filters-bar");
    if (!bar) return;

    const catSel = $("select[name=category]", bar);
    const priceSel = $("select[name=price]", bar);

    const applyFilters = () => {
      let list = getActiveProducts();

      if (catSel && catSel.value) {
        list = list.filter((p) => (p.category || "").toLowerCase() === catSel.value.toLowerCase());
      }

      if (priceSel && priceSel.value) {
        const [min, max] = priceSel.value.split("-").map((x) => parseInt(x));
        list = list.filter((p) => (!min || p.price >= min) && (!max || p.price <= max));
      }

      renderGrid("#products-grid", list);
    };

    catSel?.addEventListener("change", applyFilters);
    priceSel?.addEventListener("change", applyFilters);
  };
  // ------------------ PROFILE RENDER ------------------
  const renderProfilePage = () => {
    const wrap = $("#profile-listings");
    if (!wrap) return;
    const u = currentUser();
    if (!u) {
      wrap.innerHTML = "<p>You must be logged in to view your listings.</p>";
      return;
    }
    const my = getActiveProducts().filter((p) => p.owner === u.username);
    wrap.innerHTML = "";
    my.forEach((p) => wrap.appendChild(buildCard(p)));
  };

  // ------------------ INIT ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureUsers();
    initAuthUI();
    initSellForm();
    initSearch();
    initFilters();
    renderAll();
    renderProfilePage();

    // dynamic year
    const yr = $("#year");
    if (yr) yr.textContent = new Date().getFullYear();

    // expose helpers
    window.NB = {
      logout: logout,
      renderProfilePage,
      renderAll,
    };
  });
})();
