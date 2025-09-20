/* ==========================================================================
   app.js – Nepali Bazar Controller (FINAL)
   Features: products, pins, modals, gallery, filters, search, profile, auth,
             sell-form image handling, draft save/load, load-more, etc.
   ========================================================================== */
(function () {
  "use strict";

  // ------------------ CONFIG ------------------
  const STORAGE_KEY = "nb_products_v1";
  const USERS_KEY = "nb_users_v1";
  const LOGGED_IN_KEY = "nb_logged_in_user";
  const PINS_KEY = "nb_pins";
  const DRAFT_KEY = "nb_sell_draft_v1";
  const PLACEHOLDER_IMG = "assets/images/placeholder.jpg";
  const PIN_LIMIT = 5;
  const MAX_IMAGES = 6;
  const MAX_IMAGE_BYTES = 600 * 1024; // 600 KB soft warning for localStorage

  // ------------------ HELPERS ------------------
  const $ = (sel, p = document) => (p || document).querySelector(sel);
  const $$ = (sel, p = document) => Array.from((p || document).querySelectorAll(sel));
  const uid = () => "p-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  const escapeHtml = (str = "") =>
    String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const numberWithCommas = (x) => (isNaN(x) ? x : Number(x).toLocaleString("en-IN"));

  // ------------------ STORAGE ------------------
  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("readJSON", key, e);
      return fallback;
    }
  };
  const writeJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("writeJSON", key, e);
      alert("⚠️ Local storage error (maybe quota). Try removing old listings or images.");
    }
  };

  // ------------------ USERS ------------------
  const ensureDefaultUsers = () => {
    const users = readJSON(USERS_KEY, []);
    if (!users || !users.length) {
      writeJSON(USERS_KEY, [
        { username: "sohaum", password: "sohaum", role: "admin" },
        { username: "sneha", password: "sneha", role: "user" },
      ]);
    }
  };
  const currentUser = () => {
    const u = localStorage.getItem(LOGGED_IN_KEY);
    return u ? { username: u } : null;
  };
  const logoutUser = () => {
    localStorage.removeItem(LOGGED_IN_KEY);
  };

  // ------------------ PRODUCTS ------------------
  const getAllProducts = () => readJSON(STORAGE_KEY, []);
  const saveProducts = (list) => writeJSON(STORAGE_KEY, list);
  const getActiveProducts = () => {
    // Optionally filter by expiry if expiryDate exists (YYYY-MM-DD)
    const now = new Date();
    return getAllProducts().filter((p) => {
      if (!p.expiryDate) return true;
      try {
        const ed = new Date(p.expiryDate + "T23:59:59");
        return ed >= now;
      } catch {
        return true;
      }
    });
  };

  const addProduct = (p) => {
    const list = getAllProducts();
    if (!p.id) p.id = uid();
    if (!p.createdAt) p.createdAt = new Date().toISOString();
    list.push(p);
    saveProducts(list);
  };

  const updateProduct = (id, changes) => {
    const list = getAllProducts().map((x) => (x.id === id ? { ...x, ...changes } : x));
    saveProducts(list);
  };

  const deleteProduct = (id) => {
    const list = getAllProducts().filter((x) => x.id !== id);
    saveProducts(list);
  };

  // ------------------ PINS ------------------
  const getPinnedIds = () => readJSON(PINS_KEY, []);
  const savePinnedIds = (ids) => writeJSON(PINS_KEY, ids);
  const isPinned = (id) => getPinnedIds().includes(id);
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

  // ------------------ MODAL & CONFIRM ------------------
  const Modal = {
    ensure() {
      let modal = $("#nb-modal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "nb-modal";
        modal.className = "nb-modal-overlay";
        modal.innerHTML = `<div class="nb-modal"><div class="nb-modal-content"></div><div class="nb-modal-actions"></div></div>`;
        document.body.appendChild(modal);
      }
      return modal;
    },
    show(html, opts = {}) {
      const modal = this.ensure();
      $(".nb-modal-content", modal).innerHTML = html;
      const actions = $(".nb-modal-actions", modal);
      actions.innerHTML = "";
      const ok = document.createElement("button");
      ok.className = "btn btn-primary";
      ok.textContent = opts.okText || "OK";
      ok.addEventListener("click", () => this.hide());
      actions.appendChild(ok);
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
      modal.innerHTML = `<div class="nb-modal"><div class="nb-modal-content"></div><div class="nb-modal-actions"></div></div>`;
      document.body.appendChild(modal);
    }
    $(".nb-modal-content", modal).innerHTML = `<p>${escapeHtml(msg)}</p>`;
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

  // ------------------ RENDERING CARDS ------------------
  const card = (p, compact = false) => {
    const div = document.createElement("div");
    div.className = compact ? "card compact" : "card";
    div.dataset.id = p.id;

    let actions = "";
    if (!compact) {
      actions = `
        <div class="actions">
          <button class="btn view-btn">View</button>
          <button class="btn delete-btn">Delete</button>
          <button class="btn ${isPinned(p.id) ? "unpin" : "pin"}">${isPinned(p.id) ? "Unpin" : "Pin"}</button>
        </div>
      `;
    } else {
      actions = `<div class="actions"><button class="btn view-btn">View</button></div>`;
    }

    const thumb = escapeHtml((p.images || [])[0] || PLACEHOLDER_IMG);

    div.innerHTML = `
      <div class="thumb"><img src="${thumb}" alt="${escapeHtml(p.title)}" /></div>
      <div class="title">${escapeHtml(p.title)} ${isPinned(p.id) ? "📌" : ""}</div>
      <div class="meta">by ${escapeHtml(p.owner || "guest")}</div>
      <div class="price">${p.price ? "Rs. " + numberWithCommas(p.price) : "FREE"}</div>
      ${actions}
    `;

    // events
    div.querySelector(".view-btn")?.addEventListener("click", () => showGallery(p));
    div.querySelector(".delete-btn")?.addEventListener("click", () => {
      Confirm("Delete this ad?", (ok) => {
        if (ok) {
          deleteProduct(p.id);
          renderAllProducts();
        }
      });
    });
    div.querySelector(".pin")?.addEventListener("click", () => togglePin(p.id));
    div.querySelector(".unpin")?.addEventListener("click", () => togglePin(p.id));

    return div;
  };

  const renderGrid = (selector, list, compact = false) => {
    $$(selector).forEach((grid) => {
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

  // ------------------ HOME / PRODUCTS RENDER ------------------
  let itemsToShow = 10;
  const renderHomeProducts = (limit = itemsToShow) => {
    const products = getActiveProducts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const slice = products.slice(0, limit);
    renderGrid("#home-grid", slice);
    // hide load more if no more
    const loadBtn = $("#load-more-btn");
    if (loadBtn) loadBtn.style.display = products.length > slice.length ? "inline-block" : "none";
  };

  const renderAllProducts = () => {
    const products = getActiveProducts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderGrid("#products-grid", products);
    renderHomeProducts(itemsToShow);
    renderHeroPinned();
  };

  // ------------------ GALLERY ------------------
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

    const imgs = p.images && p.images.length ? p.images : [PLACEHOLDER_IMG];
    let idx = 0;
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

  // ------------------ SELL FORM (hook for enhanced sell.html) ------------------
  // Handles:
  //  - reading image files as data URLs
  //  - draft save/load
  //  - creating product object and saving to storage
  const initSellForm = () => {
    const form = $("#sell-form");
    if (!form) return;

    // elements used by enhanced sell.html
    const imageInput = $("#image-input");
    const thumbPreview = $("#thumb-preview");
    const saveDraftBtn = $("#save-draft");
    const expiryInput = $("#expiryDate");

    // hold data URLs of images
    let imageDataUrls = [];

    // Load draft if exists (fills basic fields only)
    const loadDraft = () => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        Object.keys(d).forEach((k) => {
          if (form[k]) form[k].value = d[k];
        });
      } catch (e) {
        console.warn("Failed to load draft", e);
      }
    };

    // Save draft (simple textual fields only)
    const saveDraft = () => {
      const fd = new FormData(form);
      const out = {};
      fd.forEach((v, k) => {
        // don't store files in draft
        if (k !== "images") out[k] = v;
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(out));
      alert("Draft saved locally.");
    };

    // Render thumbnails from imageDataUrls
    const renderThumbs = () => {
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
    };

    // Read File objects to data URLs (returns Promise)
    const filesToDataUrls = (files) =>
      Promise.all(
        Array.from(files).slice(0, MAX_IMAGES).map(
          (file) =>
            new Promise((resolve, reject) => {
              if (file.size > MAX_IMAGE_BYTES) {
                // a warning: still convert but warn
                console.warn(`Image ${file.name} is large (${Math.round(file.size / 1024)}KB). May hit storage limits.`);
              }
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );

    // On file input change
    imageInput?.addEventListener("change", async (e) => {
      const files = e.target.files;
      if (!files) return;
      if (files.length > MAX_IMAGES) {
        alert(`You can upload up to ${MAX_IMAGES} images.`);
      }
      try {
        const dataUrls = await filesToDataUrls(files);
        imageDataUrls = dataUrls.slice(0, MAX_IMAGES);
        renderThumbs();
      } catch (err) {
        console.error("Image read error", err);
        alert("Failed to read one or more images.");
      }
    });

    // Save draft button
    saveDraftBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      saveDraft();
    });

    // expiry default (if field exists)
    if (expiryInput) {
      const today = new Date();
      const max = new Date();
      max.setDate(today.getDate() + 7);
      expiryInput.min = today.toISOString().split("T")[0];
      expiryInput.max = max.toISOString().split("T")[0];
      expiryInput.value = expiryInput.value || expiryInput.max;
    }

    // On submit -> gather fields, images (data URLs), save product
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // require login
      const user = currentUser();
      if (!user) {
        alert("You must be logged in to post a listing.");
        window.location.href = "login.html";
        return;
      }

      if (!confirm("Are you sure you want to publish this listing?")) return;

      // If user selected files but imageDataUrls is empty (because they selected then navigated), try converting now
      if (imageInput && imageInput.files && imageInput.files.length && imageDataUrls.length === 0) {
        try {
          const dataUrls = await filesToDataUrls(imageInput.files);
          imageDataUrls = dataUrls.slice(0, MAX_IMAGES);
        } catch {
          // fallthrough
        }
      }

      // Build product object
      const fd = new FormData(form);
      const product = {
        id: uid(),
        title: (fd.get("title") || "").trim(),
        description: (fd.get("description") || "").trim(),
        category: (fd.get("category") || "").trim(),
        subcategory: (fd.get("subcategory") || "").trim(),
        price: parseInt(fd.get("price") || "0") || 0,
        contact: (fd.get("contact") || "").trim(),
        images: imageDataUrls.slice(0, MAX_IMAGES),
        owner: user.username,
        createdAt: new Date().toISOString(),
        expiryDate: fd.get("expiryDate") || null,
        province: fd.get("province") || "",
        city: fd.get("city") || "",
      };

      // Save and feedback
      addProduct(product);

      // remove draft
      localStorage.removeItem(DRAFT_KEY);

      // success modal (reuse Modal)
      Modal.show(`<h2>Listing Published 🎉</h2><p>Your item has been successfully listed. <br/>You can view it in your profile or go to shop.</p>
        <div style="margin-top:12px;">
          <a href="products.html" class="btn btn-primary">Go to Shop</a>
          <a href="profile.html" class="btn btn-ghost">View My Listings</a>
        </div>`, { okText: "Close" });

      // reset form and thumbs
      form.reset();
      imageDataUrls = [];
      renderThumbs();
      renderAllProducts();
    });

    // auto-load draft into form (text fields)
    loadDraft();
  };

  // ------------------ SEARCH ------------------
  const initSearch = () => {
    const input = $("#home-search") || $("#header-search");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase();
      const results = getActiveProducts().filter((p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.subcategory || "").toLowerCase().includes(q)
      );
      renderGrid("#products-grid", results);
    });
  };

  // ------------------ FILTERS ------------------
  const initFilters = () => {
    const bar = $(".filters-bar");
    if (!bar) return;
    const catSel = $("select[name=category]", bar);
    const priceSel = $("select[name=price]", bar);

    const apply = () => {
      let list = getActiveProducts();
      if (catSel && catSel.value) {
        list = list.filter((p) => (p.category || "").toLowerCase() === catSel.value.toLowerCase());
      }
      if (priceSel && priceSel.value) {
        const [min, max] = priceSel.value.split("-").map((x) => parseInt(x) || 0);
        list = list.filter((p) => (!min || p.price >= min) && (!max || p.price <= max));
      }
      renderGrid("#products-grid", list);
    };

    catSel?.addEventListener("change", apply);
    priceSel?.addEventListener("change", apply);
  };

  // ------------------ PROFILE PAGE ------------------
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
    my.forEach((p) => wrap.appendChild(card(p)));
  };

  // ------------------ AUTH UI (header) ------------------
  const initAuthUI = () => {
    const user = currentUser();
    const loginLink = $("#login-link");
    const userInfo = $("#user-info");
    const usernameDisplay = $("#username-display");
    if (user) {
      if (loginLink) loginLink.style.display = "none";
      if (userInfo) {
        userInfo.style.display = "inline-block";
        usernameDisplay && (usernameDisplay.textContent = user.username);
      }
      $("#logout-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (!confirm("Log out?")) return;
        logoutUser();
        location.reload();
      });
    } else {
      if (loginLink) loginLink.style.display = "inline-block";
      if (userInfo) userInfo.style.display = "none";
    }
  };

  // ------------------ INIT ------------------
  document.addEventListener("DOMContentLoaded", () => {
    ensureDefaultUsers();
    initAuthUI();
    initSellForm();
    initSearch();
    initFilters();
    renderAllProducts();
    renderProfilePage();

    // Load more
    const loadBtn = $("#load-more-btn");
    if (loadBtn) {
      loadBtn.addEventListener("click", () => {
        itemsToShow += 10;
        renderHomeProducts(itemsToShow);
      });
    }

    // user dropdown (index.html variant)
    const u = currentUser();
    if (u) {
      const dd = $("#user-dropdown");
      if (dd) {
        $("#username-display").textContent = u.username;
        dd.style.display = "inline-block";
        $("#logout-btn")?.addEventListener("click", (e) => {
          e.preventDefault();
          logoutUser();
          location.reload();
        });
      }
    }

    // set dynamic year in footer if present
    const yr = $("#year");
    if (yr) yr.textContent = new Date().getFullYear();

    // expose debugging helpers
    window.NB = {
      addProduct,
      getAllProducts,
      saveProducts,
      getPinnedIds,
      togglePin,
      renderAllProducts,
      renderHomeProducts,
      deleteProduct,
    };
  });
})();
