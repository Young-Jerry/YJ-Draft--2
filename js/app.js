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

  // ------------------ GLOBAL MODAL SYSTEM (creates if missing) ------------------
  let globalModal;
  function ensureModal() {
    globalModal = $("#nb-modal");
    if (globalModal) return globalModal;
    // create one
    globalModal = document.createElement("div");
    globalModal.id = "nb-modal";
    globalModal.className = "nb-modal";
    globalModal.innerHTML = `<div class="nb-modal-content"><button class="nb-modal-close" title="Close">✕</button><div id="nb-modal-body"></div></div>`;
    document.body.appendChild(globalModal);
    initModalBehavior(globalModal);
    return globalModal;
  }

  function initModalBehavior(modal) {
    const closeBtn = modal.querySelector(".nb-modal-close");
    closeBtn?.addEventListener("click", () => closeModal());
    // click outside
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    // ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function openModal(contentHtmlOrNode) {
    const modal = ensureModal();
    const body = modal.querySelector("#nb-modal-body");
    if (typeof contentHtmlOrNode === "string") body.innerHTML = contentHtmlOrNode;
    else {
      body.innerHTML = "";
      body.appendChild(contentHtmlOrNode);
    }
    modal.classList.add("active");
    return modal;
  }
  function closeModal() {
    const modal = ensureModal();
    modal.classList.remove("active");
  }

  // ------------------ CONFIRMATION (returns Promise) ------------------
  function showConfirm(message, opts = {}) {
    // returns a promise that resolves true/false
    return new Promise((resolve) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <h2>Confirm</h2>
        <p>${escapeHtml(message)}</p>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
          <button class="btn btn-ghost cancel">Cancel</button>
          <button class="btn btn-primary confirm">${escapeHtml(opts.confirmText || "Confirm")}</button>
        </div>
      `;
      const modal = openModal(wrapper);
      wrapper.querySelector(".cancel").onclick = () => {
        closeModal();
        resolve(false);
      };
      wrapper.querySelector(".confirm").onclick = () => {
        closeModal();
        resolve(true);
      };
    });
  }

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
      $("#logout-btn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const ok = await showConfirm("Are you sure you want to logout?", { confirmText: "Logout" });
        if (ok) {
          logoutUser();
          location.reload();
        }
      });
    } else {
      loginLink.style.display = "inline-block";
      userInfo.style.display = "none";
    }
  };

  // ------------------ CARDS ------------------
  const canDelete = (p) => isAdmin() || (getCurrentUser() && getCurrentUser() === p.seller);

  function buildCard(p, compact = false) {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";
    div.dataset.id = p.id;

    // actions depending on compact/full and permissions
    let actions = document.createElement("div");
    actions.className = "actions";

    const thumbHtml = `<div class="thumb"><img src="${escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG)}" /></div>`;
    const titleHtml = `<div class="title">${escapeHtml(p.title)} ${p.pinned ? "📌" : ""}</div>`;
    const priceHtml = `<div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>`;

    // View button (always present)
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn view-btn";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => showViewModal(p));
    actions.appendChild(viewBtn);

    if (!compact) {
      // Delete (if allowed)
      if (canDelete(p)) {
        const del = document.createElement("button");
        del.className = "btn delete";
        del.textContent = "Delete";
        del.addEventListener("click", async () => {
          const ok = await showConfirm("Delete this ad? This action cannot be undone.", { confirmText: "Delete" });
          if (!ok) return;
          const list = getAllProducts().filter((x) => x.id !== p.id);
          saveProducts(list);
          renderAll();
        });
        actions.appendChild(del);
      }
      // Pin/Unpin (admin only)
      if (isAdmin()) {
        const pinBtn = document.createElement("button");
        pinBtn.className = "btn " + (p.pinned ? "unpin" : "pin");
        pinBtn.textContent = p.pinned ? "Unpin" : "Pin";
        pinBtn.addEventListener("click", async () => {
          if (p.pinned) {
            const ok = await showConfirm("Unpin this ad?", { confirmText: "Unpin" });
            if (!ok) return;
            updateProduct(p.id, { pinned: false, pinnedAt: null });
            renderAll();
          } else {
            // check pin limit
            const pinnedCount = getActiveProducts().filter((x) => x.pinned).length;
            if (pinnedCount >= PIN_LIMIT) {
              showPinLimitModal(p);
              return;
            }
            const ok = await showConfirm("Pin this ad to hero? (Pinned ads appear first)", { confirmText: "Pin" });
            if (!ok) return;
            // set pinned and pinnedAt so newest pinned move first
            updateProduct(p.id, { pinned: true, pinnedAt: nowIso() });
            renderAll();
          }
        });
        actions.appendChild(pinBtn);
      }
    } else {
      // compact - make view button full width maybe styled in CSS
    }

    div.innerHTML = thumbHtml + titleHtml + priceHtml;
    div.appendChild(actions);
    return div;
  }

  // ------------------ VIEW MODAL (gallery + details) ------------------
  function showViewModal(p) {
    const modal = ensureModal();
    const body = document.createElement("div");
    body.className = "view-modal-body";

    // images
    const imgs = p.images && p.images.length ? p.images.slice(0, MAX_IMAGES) : [PLACEHOLDER_IMG];
    let idx = 0;

    const carousel = document.createElement("div");
    carousel.className = "carousel";
    const imgEl = document.createElement("img");
    imgEl.src = imgs[idx];

    const prev = document.createElement("button");
    prev.className = "arrow left";
    prev.innerHTML = "&#10094;";
    prev.addEventListener("click", () => {
      idx = (idx - 1 + imgs.length) % imgs.length;
      imgEl.src = imgs[idx];
      updateIndex();
    });

    const next = document.createElement("button");
    next.className = "arrow right";
    next.innerHTML = "&#10095;";
    next.addEventListener("click", () => {
      idx = (idx + 1) % imgs.length;
      imgEl.src = imgs[idx];
      updateIndex();
    });

    const idxIndicator = document.createElement("div");
    idxIndicator.style.marginTop = "8px";
    idxIndicator.style.fontSize = "0.95rem";
    idxIndicator.style.color = "var(--muted)";
    function updateIndex() {
      idxIndicator.textContent = `${idx + 1} / ${imgs.length}`;
    }
    updateIndex();

    carousel.appendChild(prev);
    carousel.appendChild(imgEl);
    carousel.appendChild(next);

    // details
    const titleEl = document.createElement("h2");
    titleEl.textContent = p.title;
    const desc = document.createElement("p");
    desc.textContent = p.description || "";
    const contact = document.createElement("p");
    contact.innerHTML = `<b>Contact:</b> ${escapeHtml(p.contact || "N/A")}`;
    const meta = document.createElement("p");
    meta.className = "muted small";
    meta.textContent = `Posted by ${p.seller || "N/A"} on ${p.createdAt ? p.createdAt.split(" ")[0] : "N/A"}`;

    const content = document.createElement("div");
    content.appendChild(titleEl);
    content.appendChild(carousel);
    content.appendChild(idxIndicator);
    content.appendChild(desc);
    content.appendChild(contact);
    content.appendChild(meta);

    // render body (with close button kept in modal header)
    body.appendChild(content);
    openModal(body);
  }

  // ------------------ PIN LIMIT MODAL ------------------
  function showPinLimitModal(newProduct) {
    const pinned = getActiveProducts().filter((p) => p.pinned).sort((a, b) => new Date(b.pinnedAt || b.createdAt) - new Date(a.pinnedAt || a.createdAt)).slice(0, PIN_LIMIT);
    const container = document.createElement("div");
    container.innerHTML = `<h2>Pin limit reached (${PIN_LIMIT})</h2><p>Unpin one of the pinned ads to replace it with "${escapeHtml(newProduct.title)}":</p>`;
    const list = document.createElement("div");
    list.style.display = "grid";
    list.style.gap = "8px";
    list.style.marginTop = "12px";

    pinned.forEach((p) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.background = "rgba(255,255,255,0.03)";
      row.style.padding = "8px";
      row.style.borderRadius = "8px";
      row.innerHTML = `<div style="display:flex;gap:10px;align-items:center">
                        <img src="${escapeHtml((p.images||[PLACEHOLDER_IMG])[0])}" style="width:56px;height:40px;object-fit:cover;border-radius:6px" />
                        <div>
                          <div style="font-weight:700">${escapeHtml(p.title)}</div>
                          <div class="muted small">${escapeHtml(p.seller || "")}</div>
                        </div>
                      </div>`;
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.textContent = "Unpin & Replace";
      btn.addEventListener("click", async () => {
        const ok = await showConfirm(`Unpin "${p.title}" and pin "${newProduct.title}"?`, { confirmText: "Unpin & Replace" });
        if (!ok) return;
        updateProduct(p.id, { pinned: false, pinnedAt: null });
        // pin new product (ensure it exists in storage - if not add it)
        const existing = getAllProducts().some((x) => x.id === newProduct.id);
        if (!existing) {
          // add product (shouldn't normally happen)
          addProduct({ ...newProduct, pinned: true, pinnedAt: nowIso() });
        } else {
          updateProduct(newProduct.id, { pinned: true, pinnedAt: nowIso() });
        }
        closeModal();
        renderAll();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });

    container.appendChild(list);
    openModal(container);
  }

  // ------------------ RENDERERS ------------------
  const renderGrid = (sel, list, compact = false) => {
    $$(sel).forEach((grid) => {
      grid.innerHTML = "";
      list.forEach((p) => grid.appendChild(buildCard(p, compact)));
    });
  };

  const renderHeroPinned = () => {
    const pinnedWrap = $("#pinned-ads");
    if (!pinnedWrap) return;
    const pinned = getActiveProducts()
      .filter((p) => p.pinned)
      .sort((a, b) => new Date(b.pinnedAt || b.createdAt) - new Date(a.pinnedAt || a.createdAt))
      .slice(0, PIN_LIMIT);
    pinnedWrap.innerHTML = "";
    pinned.forEach((p) => pinnedWrap.appendChild(buildCard(p, true)));
  };

  const renderAll = () => {
    // pinned first (pinned ordered by pinnedAt desc), then rest by createdAt desc
    const products = getActiveProducts().sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.pinned && b.pinned) {
        return new Date(b.pinnedAt || b.createdAt) - new Date(a.pinnedAt || a.createdAt);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    renderGrid("#home-grid, .home-grid, #products-grid", products);
    renderHeroPinned();
  };

  // ------------------ SELL FORM HANDLER ------------------
  const initSellForm = () => {
    const form = $("#sell-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // require login
      if (!getCurrentUser()) {
        alert("You must log in to post a listing.");
        window.location.href = "login.html";
        return;
      }

      const confirmed = await showConfirm("Post this ad?", { confirmText: "Post" });
      if (!confirmed) return;

      const fd = new FormData(form);
      const files = fd.getAll("images").slice(0, MAX_IMAGES);
      const images = [];
      let processed = 0;

      if (!files.length) {
        finalize([]);
      } else {
        files.forEach((f) => {
          if (f && f.type && f.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              images.push(ev.target.result);
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
          pinnedAt: null,
          createdAt: nowIso(),
          id: "p-" + Date.now(),
        };
        addProduct(product);

        const msg = $("#sell-msg");
        if (msg) {
          msg.textContent = "✅ Listing published!";
          msg.style.color = "limegreen";
        }

        // show success modal
        openModal(`<h2>Listing Published 🎉</h2><p>Your item has been listed successfully.</p><div style="text-align:right;margin-top:12px"><button class="btn btn-primary close-ok">Done</button></div>`);
        $("#nb-modal").querySelector(".close-ok").onclick = closeModal;

        form.reset();
        renderAll();
      }
    });
  };

  // ------------------ PROFILE RENDER (exposed) ------------------
  function renderProfilePage() {
    const username = getCurrentUser();
    if (!username) return;
    const wrap = $("#profile-listings");
    if (!wrap) return;
    const my = getActiveProducts().filter((p) => p.seller === username);
    wrap.innerHTML = "";
    my.forEach((p) => {
      const card = buildCard(p, false);
      // delete handler already present in buildCard
      wrap.appendChild(card);
    });
  }
  window.renderProfilePage = renderProfilePage;

  // ------------------ SEARCH HOOK (products page) ------------------
  function initSearchHooks() {
    // index.html search form stores nb_search_query and navigates to products.html (your HTML already does this)
    // here we read nb_search_query on products page and apply filter
    const q = localStorage.getItem("nb_search_query");
    if (!q) return;

    // apply filter on products grid (if present)
    const searchBox = $("#search-box") || $("#filter-search") || $("#home-search");
    if (searchBox) {
      // set value if input exists
      if (searchBox.tagName === "INPUT" || searchBox.tagName === "TEXTAREA") searchBox.value = q;
    }

    // filter products and display
    const all = getActiveProducts();
    const qq = q.toLowerCase();
    const filtered = all.filter((p) => {
      return (
        (p.title && p.title.toLowerCase().includes(qq)) ||
        (p.category && p.category.toLowerCase().includes(qq)) ||
        (p.description && p.description.toLowerCase().includes(qq)) ||
        (p.city && p.city.toLowerCase().includes(qq)) ||
        (p.province && p.province.toLowerCase().includes(qq)) ||
        (p.seller && p.seller.toLowerCase().includes(qq))
      );
    });
    // render filtered results on products grid (override)
    if ($("#products-grid")) {
      renderGrid("#products-grid", filtered, false);
    }
    // clear stored query so it doesn't persist repeatedly
    localStorage.removeItem("nb_search_query");
  }

  // ------------------ MODAL BEHAVIOUR INIT ------------------
  const initModalClose = () => {
    ensureModal(); // create and init handlers
  };

  // ------------------ PAGE SPECIFIC: ensure hero pinned click doesn't open on hover
  // (all view opening is triggered by view button only - implemented above)

  // ------------------ INIT ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers();
    initAuthUI();
    initSellForm();
    initModalClose();
    renderAll();
    initSearchHooks();

    // wire header year if present
    const yr = $("#year");
    if (yr) yr.textContent = new Date().getFullYear();

    // expose logout helper for console / other uses
    window.NB_LOGOUT = async () => {
      const ok = await showConfirm("Are you sure you want to logout?", { confirmText: "Logout" });
      if (ok) {
        logoutUser();
        location.reload();
      }
    };
  });
})();
