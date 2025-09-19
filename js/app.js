/* app.js - full site controller
   Replaces previous app.js; restores all features, seeds demo data, fixes hero, ads, modal, auth, search, filters, sell form, profile.
*/
(function(){
  // ---------- CONFIG ----------
  const STORAGE_KEY = window.LOCAL_STORAGE_KEY || 'nb_products_v1';
  const USERS_KEY = window.LOCAL_USERS_KEY || 'nb_users_v1';
  const LOGGED_IN_KEY = window.CURRENT_USER_KEY || 'nb_logged_in_user';
  const MAX_EXPIRY_DAYS = 7;
  const PLACEHOLDER_IMG = 'assets/images/placeholder.jpg';
  const MAX_PRICE = 100000000;

  // ---------- DOM helpers ----------
  const el = (s) => document.querySelector(s);
  const els = (s) => Array.from(document.querySelectorAll(s));
  const isProfilePage = () => /profile\.html$/i.test(window.location.pathname) || !!el('#profile-page');

  function escapeHtml(s){ return s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]) : ''; }
  function numberWithCommas(x){ try{ return Number(x).toLocaleString('en-IN'); }catch(e){ return x; } }

  function nowIsoDateTime(){
    const d = new Date();
    const Y = d.getFullYear();
    const M = String(d.getMonth()+1).padStart(2,'0');
    const D = String(d.getDate()).padStart(2,'0');
    const h = String(d.getHours()).padStart(2,'0');
    const m = String(d.getMinutes()).padStart(2,'0');
    return `${Y}-${M}-${D} ${h}:${m}`;
  }

  function dateOnlyToLocalMidnight(dateStr){
    try{
      const parts = dateStr.split('T')[0].split(' ')[0];
      return new Date(parts + 'T00:00:00');
    }catch(e){
      return new Date(dateStr);
    }
  }

  function readJSON(key, fallback){
    try {
      const raw = localStorage.getItem(key);
      if(!raw) return fallback;
      return JSON.parse(raw);
    } catch(e){
      console.warn('readJSON parse failed', e);
      return fallback;
    }
  }
  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){ console.warn('writeJSON failed', e); }
  }

  // ---------- Users helper ----------
  function ensureDefaultUsers(){
    const users = readJSON(USERS_KEY, null);
    if(users && Array.isArray(users) && users.length) return;
    const defaultUsers = [
      { username: 'sohaum', password: 'sohaum', role: 'admin' },
      { username: 'sneha', password: 'sneha', role: 'user' }
    ];
    writeJSON(USERS_KEY, defaultUsers);
    return defaultUsers;
  }
  window.NB_CREATE_DEFAULT_USERS = ensureDefaultUsers;

  // ---------- Products storage helpers ----------
  function getProductsRaw(){ return readJSON(STORAGE_KEY, []); }
  function saveProductsRaw(list){ writeJSON(STORAGE_KEY, list); }

  function getProducts(){
    const raw = getProductsRaw();
    const today = new Date(); const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return (raw||[]).filter(p => {
      if(!p) return false;
      if(!p.expiryDate) return true;
      const exp = dateOnlyToLocalMidnight(p.expiryDate);
      return exp >= todayMid;
    });
  }

  // ---------- Auth helpers ----------
  function getCurrentUser(){ try { return localStorage.getItem(LOGGED_IN_KEY) || null; } catch(e){ return null; } }
  function setCurrentUser(username){ try{ localStorage.setItem(LOGGED_IN_KEY, username); }catch(e){} }
  function logoutCurrentUser(){ try{ localStorage.removeItem(LOGGED_IN_KEY); }catch(e){} }

  function isAdmin(){
    const user = getCurrentUser();
    if(!user) return false;
    const users = readJSON(USERS_KEY, []);
    const u = (users||[]).find(x => x.username === user);
    return !!(u && u.role === 'admin');
  }

  function canDelete(product){
    const user = getCurrentUser();
    if(!user) return false;
    const users = readJSON(USERS_KEY, []);
    const u = (users||[]).find(x => x.username === user);
    if(u && u.role === 'admin') return true;
    if(product && product.seller === user && isProfilePage()) return true;
    return false;
  }

  // ---------- Demo product seeding ----------
  function seedDemoProducts(){
    const raw = getProductsRaw();
    if(raw && raw.length) return;
    const demo = [
      { id:'p-'+Date.now()+'-1', title:'iPhone 14 (Demo)', description:'128GB, like new', price:120000, currency:'Rs.', category:'Electronics', location:'Kathmandu', seller:'sohaum', contact:'9800000000', images:['assets/images/iphone.jpg'], createdAt: nowIsoDateTime(), expiryDate: new Date(Date.now()+3*24*3600*1000).toISOString() },
      { id:'p-'+(Date.now()+1)+'-2', title:'Mountain Bike', description:'Hardtail, 26in', price:25000, currency:'Rs.', category:'Sports', location:'Pokhara', seller:'sneha', contact:'9811111111', images:['assets/images/bike.jpg'], createdAt: nowIsoDateTime(), expiryDate: new Date(Date.now()+5*24*3600*1000).toISOString() },
      { id:'p-'+(Date.now()+2)+'-3', title:'Textbook: Physics', description:'Used, good condition', price:1200, currency:'Rs.', category:'Books', location:'Dharan', seller:'demo', contact:'demo@nb.local', images:['assets/images/book.jpg'], createdAt: nowIsoDateTime(), expiryDate: new Date(Date.now()+7*24*3600*1000).toISOString() }
    ];
    saveProductsRaw(demo);
  }

  // ---------- Pin helpers ----------
  function pinProduct(id){
    if(!isAdmin()){ alert('Only admin can pin ads'); return; }
    const list = getProductsRaw();
    list.forEach(p => { if(p) p.pinned = false; });
    const found = list.find(p => p.id === id);
    if(!found) { alert('Listing not found'); return; }
    found.pinned = true;
    found.pinnedBy = getCurrentUser();
    found.pinnedAt = (new Date()).toISOString();
    saveProductsRaw(list);
    renderPinnedHero(); renderAll();
  }
  function unpinProduct(id){
    if(!isAdmin()){ alert('Only admin can unpin ads'); return; }
    const list = getProductsRaw();
    const found = list.find(p => p.id === id);
    if(!found) { alert('Listing not found'); return; }
    found.pinned = false; delete found.pinnedBy; delete found.pinnedAt;
    saveProductsRaw(list);
    renderPinnedHero(); renderAll();
  }

  // ---------- Card creation ----------
  function createCard(product, opts = {}){
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = product.id;

    const img = (product.images && product.images[0]) ? product.images[0] : PLACEHOLDER_IMG;
    const priceDisplay = (Number(product.price) === 0) ? 'FREE' : (product.currency || 'Rs.') + ' ' + numberWithCommas(product.price);
    const created = product.createdAt || '';
    const expires = product.expiryDate || '';
    const pinnedBadge = product.pinned ? `<span title="Pinned">📌</span>` : '';

    card.innerHTML = `
      <div class="thumb"><img src="${escapeHtml(img)}" alt="${escapeHtml(product.title)}" onerror="this.src='${PLACEHOLDER_IMG}'"/></div>
      <div class="title">${escapeHtml(product.title)} ${pinnedBadge}</div>
      <div class="meta"><div class="price">${priceDisplay}</div><div class="muted small">${escapeHtml(product.location||'')}</div></div>
      <div class="desc small muted" style="margin-top:6px">${escapeHtml((product.description||'').slice(0,160))}</div>
      <div class="actions" style="margin-top:auto;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn view-btn" data-id="${escapeHtml(product.id)}">View</button>
        ${ canDelete(product) ? `<button class="btn btn-danger delete-btn" data-id="${escapeHtml(product.id)}" title="Delete">🗑️</button>` : '' }
        ${ isAdmin() ? (product.pinned ? `<button class="btn" data-pin-action="unpin" data-id="${escapeHtml(product.id)}">📌 Unpin</button>` : `<button class="btn" data-pin-action="pin" data-id="${escapeHtml(product.id)}">📌 Pin</button>`) : '' }
      </div>
      <div style="margin-top:6px;font-size:12px;color:var(--muted)">Posted: ${escapeHtml(created)} ${expires ? ` | Expires: ${escapeHtml(expires)}` : ''}</div>
    `;

    // event handlers
    const viewBtn = card.querySelector('.view-btn');
    if(viewBtn) viewBtn.addEventListener('click', () => showModal(buildModalHtml(product)));

    const delBtn = card.querySelector('.delete-btn');
    if(delBtn) delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(!confirm('Delete this listing?')) return;
      deleteProduct(product.id);
    });

    const pinBtns = card.querySelectorAll('[data-pin-action]');
    pinBtns.forEach(pb => {
      pb.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = pb.dataset.id;
        if(pb.dataset.pinAction === 'pin') pinProduct(id);
        else unpinProduct(id);
      });
    });

    // hover visual via inline fallback
    card.style.transition = 'transform .16s ease, box-shadow .16s ease';
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-6px)'; card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.6)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = ''; });

    return card;
  }

  // ---------- Delete ----------
  function deleteProduct(id){
    let raw = getProductsRaw();
    const product = raw.find(p => p.id === id);
    if(!product){ alert('Listing not found'); return; }
    if(!canDelete(product)){ alert('Not authorized to delete'); return; }
    raw = raw.filter(p => p.id !== id);
    // if deleted was pinned -> unpin state cleared automatically
    saveProductsRaw(raw);
    renderPinnedHero(); renderAll();
  }

  // ---------- Modal ----------
  function showModal(html){
    const builtin = el('#nb-modal');
    if (builtin && builtin.querySelector('#nb-modal-body')){
      const body = builtin.querySelector('#nb-modal-body');
      body.innerHTML = html;
      builtin.style.display = 'flex';
      // close wiring
      const closeBtn = builtin.querySelector('.modal-close') || builtin.querySelector('.nb-modal-close');
      if(closeBtn) closeBtn.onclick = ()=> { builtin.style.display = 'none'; body.innerHTML = ''; };
      builtin.onclick = (ev)=>{ if(ev.target === builtin){ builtin.style.display = 'none'; body.innerHTML = ''; } };
      const esc = (ev)=>{ if(ev.key === 'Escape'){ builtin.style.display='none'; body.innerHTML=''; document.removeEventListener('keydown', esc); } };
      document.addEventListener('keydown', esc);
      return;
    }
    // fallback overlay
    const existing = el('.nb-modal-overlay'); if(existing) existing.remove();
    const overlay = document.createElement('div'); overlay.className = 'nb-modal-overlay';
    overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div'); box.className = 'nb-modal';
    box.style = 'max-width:800px;width:92%;background:#071027;color:#fff;padding:18px;border-radius:12px;position:relative;border:1px solid rgba(255,255,255,0.06);';
    box.innerHTML = `<button class="nb-modal-close" aria-label="Close" style="position:absolute;right:10px;top:10px;background:transparent;border:0;color:inherit;font-size:20px;">✕</button><div id="nb-modal-body">${html}</div>`;
    overlay.appendChild(box); document.body.appendChild(overlay);
    box.querySelector('.nb-modal-close').addEventListener('click', ()=> overlay.remove());
    overlay.addEventListener('click', (ev)=> { if(ev.target === overlay) overlay.remove(); });
    const esc2 = (ev)=>{ if(ev.key === 'Escape'){ overlay.remove(); document.removeEventListener('keydown', esc2); } };
    document.addEventListener('keydown', esc2);
  }

  function buildModalHtml(product){
    const img = (product.images && product.images[0]) ? product.images[0] : PLACEHOLDER_IMG;
    return `
      <div style="display:flex;gap:16px;flex-wrap:wrap;color:inherit;">
        <div style="flex:0 0 320px;"><img src="${escapeHtml(img)}" style="width:320px;height:220px;object-fit:cover;border-radius:8px;" onerror="this.src='${PLACEHOLDER_IMG}'"/></div>
        <div style="flex:1;min-width:220px;">
          <h2 style="margin:0 0 8px 0">${escapeHtml(product.title)}</h2>
          <div style="font-weight:700;margin-bottom:8px;">${(Number(product.price)===0)?'FREE':(product.currency||'Rs.') + ' ' + numberWithCommas(product.price)}</div>
          <div class="muted small">Location: ${escapeHtml(product.location||'')}</div>
          <div class="muted small">Seller: ${escapeHtml(product.seller||'')}</div>
          <hr style="opacity:0.06;margin:8px 0"/>
          <p style="max-height:240px;overflow:auto;margin:0;padding-right:6px">${escapeHtml(product.description||'')}</p>
          <p style="margin-top:10px;"><strong>Contact:</strong> ${escapeHtml(product.contact||'')}</p>
          <p style="margin-top:8px;font-size:13px;color:var(--muted)">Posted: ${escapeHtml(product.createdAt || '')} ${product.expiryDate ? ` | Expires: ${escapeHtml(product.expiryDate)}` : ''}</p>
        </div>
      </div>
    `;
  }

  function openProductModalById(id){ const prod = getProductsRaw().find(p => p.id === id); if(!prod) return alert('Listing not found'); showModal(buildModalHtml(prod)); }

  // ---------- Hero rendering ----------
  function renderPinnedHero(){
    const heroSection = el('.hero');
    if(!heroSection) return;
    if(isProfilePage()){ heroSection.style.display = 'none'; return; } else heroSection.style.display = '';

    let heroInner = heroSection.querySelector('.hero-inner');
    if(!heroInner){
      heroInner = document.createElement('div'); heroInner.className = 'container hero-inner';
      // keep existing hero content if present: move it into heroInner
      // If hero already has content that looks like hero-left/hero-right, keep it.
      heroSection.innerHTML = ''; heroSection.appendChild(heroInner);
    }

    // left (static)
    let left = heroInner.querySelector('.hero-left');
    if(!left){
      left = document.createElement('div'); left.className = 'hero-left';
      left.innerHTML = `
        <h1 class="hero-title"><span class="accent site-name"></span><br>Buy • Sell • Connect — Locally</h1>
        <p class="hero-sub">A neon-lit marketplace for students & creators. Upload your item, add contact and photos — buyers contact you directly.</p>
        <div class="hero-cta"><a class="btn btn-primary" href="products.html">Browse Items</a> <a class="btn btn-ghost" href="sell.html">List an Item</a></div>
      `;
      heroInner.appendChild(left);
    } else {
      // ensure site-name present
      left.querySelectorAll('.site-name').forEach(n => n.textContent = window.SITE_NAME || 'NEPALI BAZAR');
    }

    // right (pinned card)
    let right = heroInner.querySelector('.hero-right');
    if(!right){ right = document.createElement('div'); right.className = 'hero-right'; heroInner.appendChild(right); }

    const raw = getProductsRaw();
    const pinned = raw.find(p => p && p.pinned) || null;
    if(!pinned){
      right.innerHTML = `<div class="hero-card neon-card"><img src="assets/images/hero-1.jpg" alt="hero image" onerror="this.style.display='none'"/><div class="meta">Featured: Browse current listings</div></div>`;
      return;
    }

    right.innerHTML = `<div class="hero-card neon-card pinned-hero" style="cursor:pointer;position:relative;">
      <div style="position:absolute;left:12px;top:12px;background:linear-gradient(90deg,var(--neon-1),var(--neon-2));color:#041026;padding:6px 8px;border-radius:10px;font-weight:700;display:flex;align-items:center;gap:8px;">📌 Pinned</div>
      <img src="${escapeHtml((pinned.images && pinned.images[0]) ? pinned.images[0] : PLACEHOLDER_IMG)}" alt="${escapeHtml(pinned.title)}" style="width:100%;height:240px;object-fit:cover;border-radius:10px;" onerror="this.style.display='none'"/>
      <div class="meta" style="margin-top:10px">${escapeHtml(pinned.title)} — ${(Number(pinned.price)===0)?'FREE':(pinned.currency||'Rs.')+' '+numberWithCommas(pinned.price)}</div>
    </div>`;

    const heroCard = right.querySelector('.pinned-hero');
    if(heroCard){
      heroCard.addEventListener('click', ()=> openProductModalById(pinned.id));
      heroCard.style.transition = 'transform .16s ease, box-shadow .16s ease';
      heroCard.addEventListener('mouseenter', ()=> { heroCard.style.transform = 'translateY(-6px)'; heroCard.style.boxShadow = '0 18px 60px rgba(0,0,0,0.6)'; });
      heroCard.addEventListener('mouseleave', ()=> { heroCard.style.transform = ''; heroCard.style.boxShadow = ''; });
    }
  }

  // ---------- Categories population ----------
  function initCategories(){
    const products = getProductsRaw();
    const cats = [...new Set((products||[]).map(p => p.category).filter(Boolean))].sort();
    const selects = document.querySelectorAll('#filter-category, select#filter-category');
    selects.forEach(sel => {
      if(!sel) return;
      const prev = sel.value || '';
      sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if(prev) sel.value = prev;
      sel.addEventListener('change', ()=> { if(el('#home-grid')) renderHomeGrid(); if(el('#products-grid')) renderProductsPage(); if(el('#profile-listings')) renderProfilePage(); });
    });
  }

  // ---------- Ads in sidebar ----------
  function initAds(){
    // populate any .ad-slot elements
    const adSlots = document.querySelectorAll('.ad-slot');
    if(!adSlots || adSlots.length===0) return;
    const imgs = ['assets/images/ad1.jpg', 'assets/images/ad2.jpg'];
    adSlots.forEach((slot, idx) => {
      // if it's an anchor already (we suggested using anchor in HTML), just ensure hover behaviour
      let a = slot.tagName === 'A' ? slot : slot.querySelector('a');
      if(!a){
        a = document.createElement('a');
        a.href = 'https://www.google.com';
        a.target = '_blank';
        a.rel = 'noopener';
        // move existing content (img) if present
        const imgInside = slot.querySelector('img');
        if(imgInside){ a.appendChild(imgInside); slot.innerHTML = ''; slot.appendChild(a); }
        else { const img = document.createElement('img'); img.src = imgs[idx % imgs.length]; img.alt = 'ad'; a.appendChild(img); slot.innerHTML = ''; slot.appendChild(a); }
      }
      const img = a.querySelector('img');
      if(img){
        img.style.transition = 'transform .18s ease, box-shadow .18s ease';
        a.addEventListener('mouseenter', ()=> { img.style.transform = 'translateY(-6px) scale(1.03)'; img.style.boxShadow = '0 18px 60px rgba(0,0,0,0.6)'; });
        a.addEventListener('mouseleave', ()=> { img.style.transform = ''; img.style.boxShadow = ''; });
      }
    });
  }

  // ---------- Sell form init (expiry date + validation) ----------
  function initSellForm(){
    const form = el('#sell-form') || el('form#sell');
    if(!form) return;

    // Add expiryDate if missing
    if(!form.querySelector('[name="expiryDate"]')){
      const wrap = document.createElement('label');
      wrap.style.display = 'block';
      wrap.style.marginTop = '8px';
      wrap.innerHTML = `Expiry Date (max ${MAX_EXPIRY_DAYS} day(s) from today)
        <input type="date" name="expiryDate" required class="input" />`;
      const actions = form.querySelector('.form-actions');
      if(actions) form.insertBefore(wrap, actions);
      else form.appendChild(wrap);

      const inp = wrap.querySelector('input[name="expiryDate"]');
      const today = new Date();
      inp.min = today.toISOString().split('T')[0];
      inp.max = new Date(today.getTime() + MAX_EXPIRY_DAYS*24*60*60*1000).toISOString().split('T')[0];
      inp.value = inp.max;
    }

    // sanitize contact input
    const contactEl = form.querySelector('[name="contact"]');
    if(contactEl){
      contactEl.setAttribute('placeholder', '10 digit phone number or email');
      contactEl.addEventListener('input', ()=> { contactEl.value = contactEl.value.replace(/[^\d@.\-_a-zA-Z]/g, '').slice(0,140); });
    }

    // intercept submit
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const title = (fd.get('title') || '').trim();
      let price = Number(fd.get('price') || 0);
      const location = (fd.get('location') || fd.get('province') || '').trim();
      const contact = (fd.get('contact') || '').trim();
      const expiryDate = fd.get('expiryDate');

      if(!title) return alert('Please provide a title');
      const phoneOk = /^\d{10}$/.test(contact);
      const emailOk = contact.includes('@');
      if(!phoneOk && !emailOk) return alert('Please enter a 10-digit phone number or an email');
      if(price < 0) price = 0;
      if(price > MAX_PRICE) return alert('Price exceeds allowed maximum.');
      if(!expiryDate) return alert('Please select an expiry date');

      // validate expiry window
      const today = new Date(); const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const chosen = dateOnlyToLocalMidnight(expiryDate);
      const max = new Date(todayMid.getTime() + MAX_EXPIRY_DAYS*24*60*60*1000);
      if(chosen < todayMid || chosen > max) return alert(`Expiry must be between today and ${MAX_EXPIRY_DAYS} days from today.`);

      // generate id
      const id = ('p-' + Date.now() + '-' + Math.floor(Math.random()*1000));
      const product = {
        id,
        title,
        price,
        currency: 'Rs.',
        category: fd.get('category') || 'Other',
        location: location || fd.get('city') || '',
        seller: getCurrentUser() || fd.get('seller') || 'Anonymous',
        contact,
        description: fd.get('description') || '',
        images: ['assets/images/placeholder.jpg'],
        createdAt: nowIsoDateTime(),
        expiryDate: expiryDate
      };

      const list = getProductsRaw();
      list.push(product);
      saveProductsRaw(list);
      alert(price === 0 ? 'Listing published as FREE!' : 'Listing published!');
      window.location.href = 'products.html';
    });
  }

  // ---------- Search init ----------
  function initGlobalSearch(){
    const ids = ['#global-search','#global-search-top','#global-search-product','#global-search-sell','#search-products','#search-products-top','#search-products-global'];
    let s = null;
    for(const id of ids){ const n = document.querySelector(id); if(n){ s = n; break; } }
    if(!s) return;
    s.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); const q = s.value.trim(); if(!q) return; window.location.href = 'products.html?q=' + encodeURIComponent(q); }
    });
  }

  function prefillSearchFromQuery(){
    const url = new URL(window.location.href);
    const q = url.searchParams.get('q') || '';
    if(!q) return;
    const ids = ['#search-products','#search-products-top','#search-products-global','#global-search-top','#global-search'];
    ids.forEach(id => { const n = document.querySelector(id); if(n) n.value = q; });
  }

  // ---------- Renderers ----------
  function renderHomeGrid(limit = 8){
    const grid = el('#home-grid'); if(!grid) return;
    let list = getProducts().slice();

    // category filter if present
    const catSel = el('#filter-category'); const catVal = catSel ? catSel.value : '';
    if(catVal) list = list.filter(p => p.category === catVal);

    // sort newest first by createdAt
    list.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    grid.innerHTML = '';
    const slice = list.slice(0, limit);
    slice.forEach(p => grid.appendChild(createCard(p)));
  }

  function renderProductsPage(){
    const grid = el('#products-grid'); if(!grid) return;
    const q = (el('#search-products') && el('#search-products').value) || (new URL(window.location.href).searchParams.get('q') || '');
    const cat = el('#filter-category') ? el('#filter-category').value : '';

    let list = getProducts().slice();
    if(q){ const ql = q.toLowerCase(); list = list.filter(p => (((p.title||'') + ' ' + (p.description||'') + ' ' + (p.seller||'') + ' ' + (p.location||'')).toLowerCase().includes(ql))); }
    if(cat) list = list.filter(p => p.category === cat);

    // optional sorting
    const sortVal = el('#filter-sort') ? el('#filter-sort').value : 'new';
    if(sortVal === 'price-asc') list.sort((a,b) => Number(a.price||0) - Number(b.price||0));
    else if(sortVal === 'price-desc') list.sort((a,b) => Number(b.price||0) - Number(a.price||0));
    else list.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    grid.innerHTML = '';
    if(list.length === 0){ grid.innerHTML = '<div class="muted">No listings found.</div>'; return; }
    list.forEach(p => grid.appendChild(createCard(p)));
  }

  function renderProfilePage(){
    const container = el('#profile-listings');
    const hero = el('.hero'); if(hero) hero.style.display = 'none';
    if(!container) return;
    const user = getCurrentUser();
    if(!user){ window.location.href = 'login.html'; return; }
    const list = getProducts().filter(p => p.seller === user);
    container.innerHTML = '';
    if(list.length === 0){ container.innerHTML = '<div class="muted">You have not listed any items yet.</div>'; return; }
    list.forEach(p => container.appendChild(createCard(p)));
  }

  // expose for HTML/global usage
  window.renderHomeGrid = renderHomeGrid;
  window.renderProductsPage = renderProductsPage;
  window.renderProfilePage = renderProfilePage;
  window.NB_PIN_PRODUCT = pinProduct;
  window.NB_UNPIN_PRODUCT = unpinProduct;
  window.NB_DELETE_PRODUCT = deleteProduct;
  window.NB_VIEW_PRODUCT = openProductModalById;

  // ---------- Header / auth UI ----------
  function initAuthUI(){
    const nav = document.querySelector('.nav');
    if(!nav) return;
    // ensure profile link exists and is next to login
    let profileLink = document.getElementById('profile-link');
    if(!profileLink){
      profileLink = document.createElement('a');
      profileLink.id = 'profile-link'; profileLink.className = 'nav-link'; profileLink.href = 'profile.html'; profileLink.textContent = 'Profile';
      const loginLink = document.getElementById('login-link');
      if(loginLink && loginLink.parentNode) loginLink.parentNode.insertBefore(profileLink, loginLink.nextSibling);
      else nav.appendChild(profileLink);
    }

    const loggedUser = getCurrentUser();
    const loginLink = document.getElementById('login-link');
    const userInfo = document.getElementById('user-info');
    const usernameDisplay = document.getElementById('username-display');
    const logoutBtn = document.getElementById('logout-btn');

    if(loggedUser){
      if(loginLink) loginLink.style.display = 'none';
      if(userInfo){ userInfo.style.display = 'inline'; if(usernameDisplay) usernameDisplay.textContent = loggedUser; }
      profileLink.style.display = 'inline';
    } else {
      if(loginLink) loginLink.style.display = 'inline';
      if(userInfo) userInfo.style.display = 'none';
      profileLink.style.display = 'none';
    }

    if(logoutBtn){
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); logoutCurrentUser(); location.reload();
      });
    }
  }

  // ---------- Filters init ----------
  function initFilters(){
    const ids = ['#search-box','#search-products','#filter-category','#filter-min','#filter-max','#filter-sort'];
    ids.forEach(id => {
      const elmt = document.querySelector(id);
      if(elmt) elmt.addEventListener('input', renderProductsPage);
      if(elmt && id === '#filter-sort') elmt.addEventListener('change', renderProductsPage);
    });
  }

  // ---------- Initialization ----------
  document.addEventListener('DOMContentLoaded', () => {
    // seed users & products
    ensureDefaultUsers();
    seedDemoProducts();

    // wire UI
    initAuthUI();
    initAds();
    initCategories();
    initFilters();
    initGlobalSearch();
    prefillSearchFromQuery();
    initSellForm();

    // render
    renderPinnedHero();
    renderHomeGrid();
    renderProductsPage();
    renderProfilePage();

    // load more (if #load-more-btn present)
    const loadBtn = el('#load-more-btn');
    if(loadBtn){
      let homeLimit = 8;
      loadBtn.addEventListener('click', ()=> { homeLimit += 8; renderHomeGrid(homeLimit); });
    }
  });

  // ---------- end ----------
})();
