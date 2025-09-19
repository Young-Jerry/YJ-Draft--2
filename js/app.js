/* app.js - Unified, defensive controller for Nepali Bazar
   - Standardizes storage keys and migrates older keys
   - Robust header auth UI across multiple header variants
   - Demo seeding (safe, only if empty)
   - Modal support (existing #nb-modal OR overlay fallback)
   - Ads injection/hover/click behavior
   - Search/filter support across many ID variants
   - Pin/unpin: allows multiple pins, sorts pinned first (pinnedAt desc), then newest
   - Exposes render functions globally for inline page scripts
*/
(function(){
  'use strict';

  // ---------- CONFIG ----------
  const STORAGE_KEY = window.LOCAL_STORAGE_KEY || 'nb_products_v1';
  const LEGACY_STORAGE_KEYS = ['nb_products', 'nb_products_v1']; // migrate if needed
  const USERS_KEY = window.LOCAL_USERS_KEY || 'nb_users_v1';
  const LOGGED_IN_KEY = window.CURRENT_USER_KEY || 'nb_logged_in_user';
  const MAX_EXPIRY_DAYS = 7;
  const PLACEHOLDER_IMG = 'assets/images/placeholder.jpg';
  const AD_DEFS = [
    { img: 'assets/images/ad1.jpg', url: 'https://www.google.com' },
    { img: 'assets/images/ad2.jpg', url: 'https://www.google.com' }
  ];

  // ---------- DOM helpers ----------
  const el = (s) => document.querySelector(s);
  const els = (s) => Array.from(document.querySelectorAll(s));
  const isProfilePage = () => /profile\.html$/i.test(window.location.pathname) || !!el('#profile-page');

  function escapeHtml(s){ return s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]) : ''; }
  function numberWithCommas(x){ try{ return Number(x).toLocaleString('en-IN'); }catch(e){ return x; } }
  function nowIsoDateTime(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function dateOnlyToLocalMidnight(dateStr){ try{ const parts = dateStr.split('T')[0].split(' ')[0]; return new Date(parts + 'T00:00:00'); }catch(e){ return new Date(dateStr); } }

  // ---------- Storage helpers ----------
  function readJSON(key, fallback){
    try {
      const raw = localStorage.getItem(key);
      if(!raw) return fallback;
      return JSON.parse(raw);
    } catch(e){
      console.warn('readJSON parse failed', key, e);
      return fallback;
    }
  }
  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){ console.warn('writeJSON failed', e); }
  }

  // Migrate legacy product keys if present
  function migrateLegacyProducts(){
    // if current exists do nothing
    if(localStorage.getItem(STORAGE_KEY)) return;
    for (const k of LEGACY_STORAGE_KEYS){
      const raw = localStorage.getItem(k);
      if(raw){
        try{
          const parsed = JSON.parse(raw);
          if(Array.isArray(parsed)){
            writeJSON(STORAGE_KEY, parsed);
            console.info('migrated products from', k, 'to', STORAGE_KEY);
            return;
          }
        }catch(e){}
      }
    }
  }

  // ---------- Users ----------
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

  // ---------- Products storage ----------
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

  function addProduct(product){
    const list = getProductsRaw();
    const id = product.id || ('p-' + Date.now() + '-' + Math.floor(Math.random()*9000+1000));
    product.id = id;
    product.createdAt = product.createdAt || nowIsoDateTime();
    saveProductsRaw([ ...list, product ]);
  }

  // ---------- Auth ----------
  function getCurrentUser(){ try { return localStorage.getItem(LOGGED_IN_KEY) || null; } catch(e){ return null; } }
  function setCurrentUser(username){ try{ localStorage.setItem(LOGGED_IN_KEY, username); }catch(e){} }
  function logoutCurrentUser(){ try{ localStorage.removeItem(LOGGED_IN_KEY); }catch(e){} }

  function isAdmin(){
    const username = getCurrentUser();
    if(!username) return false;
    const users = readJSON(USERS_KEY, []);
    return (users.find(u => u.username === username && u.role === 'admin')) ? true : false;
  }

  function canDelete(product){
    const username = getCurrentUser();
    if(!username) return false;
    const users = readJSON(USERS_KEY, []);
    const me = users.find(u => u.username === username);
    if(me && me.role === 'admin') return true;
    if(product && product.seller === username && isProfilePage()) return true;
    return false;
  }

  // ---------- Demo seeding ----------
  function seedDemoProducts(){
    const raw = getProductsRaw();
    if(raw && raw.length) return;
    const demo = [
      { id:'p-'+Date.now()+'-1', title:'Apple iPhone (demo)', description:'128GB, demo listing', price:115000, currency:'Rs.', category:'Electronics', location:'Kathmandu', seller:'sohaum', contact:'9800000000', images:['assets/images/iphone.jpg'], createdAt: nowIsoDateTime(), expiryDate: new Date(Date.now()+3*24*3600*1000).toISOString() },
      { id:'p-'+(Date.now()+1)+'-2', title:'Mountain Bike (demo)', description:'Alloy frame', price:25000, currency:'Rs.', category:'Sports', location:'Pokhara', seller:'sneha', contact:'9811111111', images:['assets/images/bike.jpg'], createdAt: nowIsoDateTime(), expiryDate: new Date(Date.now()+5*24*3600*1000).toISOString() },
      { id:'p-'+(Date.now()+2)+'-3', title:'Used Physics Book (demo)', description:'Good condition', price:900, currency:'Rs.', category:'Books', location:'Dharan', seller:'demo', contact:'demo@nb.local', images:['assets/images/book.jpg'], createdAt: nowIsoDateTime(), expiryDate: new Date(Date.now()+7*24*3600*1000).toISOString() }
    ];
    saveProductsRaw(demo);
  }

  // ---------- Pin helpers (allow multiple pins) ----------
  function pinProduct(id){
    if(!isAdmin()){ alert('Only admin can pin ads'); return; }
    const list = getProductsRaw();
    const found = list.find(p => p && p.id === id);
    if(!found){ alert('Listing not found'); return; }
    // Allow multiple pins: set pinned true & record pinnedAt
    found.pinned = true;
    found.pinnedBy = getCurrentUser();
    found.pinnedAt = (new Date()).toISOString();
    saveProductsRaw(list);
    renderAll();
  }

  function unpinProduct(id){
    if(!isAdmin()){ alert('Only admin can unpin ads'); return; }
    const list = getProductsRaw();
    const found = list.find(p => p && p.id === id);
    if(!found){ alert('Listing not found'); return; }
    found.pinned = false;
    delete found.pinnedBy;
    delete found.pinnedAt;
    saveProductsRaw(list);
    renderAll();
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
      <div class="thumb"><img src="${escapeHtml(img)}" alt="${escapeHtml(product.title)}" onerror="this.src='${PLACEHOLDER_IMG}'" /></div>
      <div class="title">${escapeHtml(product.title)} ${pinnedBadge}</div>
      <div class="meta"><div class="price">${priceDisplay}</div><div class="muted small">${escapeHtml(product.location||'')}</div></div>
      <div class="desc small muted" style="margin-top:6px">${escapeHtml((product.description||'').slice(0,160))}</div>
      <div class="actions" style="margin-top:auto;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn view-btn" data-id="${escapeHtml(product.id)}">View</button>
        ${ canDelete(product) ? `<button class="btn btn-danger delete-btn" data-id="${escapeHtml(product.id)}" title="Delete">Delete</button>` : '' }
        ${ isAdmin() ? (product.pinned ? `<button class="btn unpin-btn" data-id="${escapeHtml(product.id)}">Unpin</button>` : `<button class="btn pin-btn" data-id="${escapeHtml(product.id)}">Pin</button>`) : '' }
      </div>
      <div style="margin-top:6px;font-size:12px;color:var(--muted)">Posted: ${escapeHtml(created)} ${expires ? ` | Expires: ${escapeHtml(expires)}` : ''}</div>
    `;

    // event handlers
    const viewBtn = card.querySelector('.view-btn');
    if(viewBtn) viewBtn.addEventListener('click', () => openProductModalById(product.id));

    const delBtn = card.querySelector('.delete-btn');
    if(delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); if(!confirm('Delete this listing?')) return; deleteProduct(product.id); });

    const pinBtn = card.querySelector('.pin-btn');
    const unpinBtn = card.querySelector('.unpin-btn');
    if(pinBtn) pinBtn.addEventListener('click', (e) => { e.stopPropagation(); pinProduct(product.id); });
    if(unpinBtn) unpinBtn.addEventListener('click', (e) => { e.stopPropagation(); unpinProduct(product.id); });

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
    saveProductsRaw(raw);
    renderAll();
  }

  // ---------- Modal ----------
  function showModal(html){
    // prefer existing #nb-modal if present
    const builtin = el('#nb-modal');
    if (builtin && builtin.querySelector) {
      const body = builtin.querySelector('#nb-modal-body') || builtin.querySelector('.modal-body') || builtin;
      if(body) {
        // If #nb-modal has inner body, fill it
        const target = builtin.querySelector('#nb-modal-body') || builtin.querySelector('.modal-body') || builtin;
        target.innerHTML = html;
        builtin.style.display = 'flex';
        // wire close if exists
        const closeBtn = builtin.querySelector('.modal-close') || builtin.querySelector('.nb-modal-close') || builtin.querySelector('.close');
        if(closeBtn) closeBtn.onclick = () => { builtin.style.display = 'none'; if(target) target.innerHTML = ''; };
        builtin.onclick = (ev) => { if(ev.target === builtin){ builtin.style.display='none'; if(target) target.innerHTML=''; } };
        const esc = (ev) => { if(ev.key === 'Escape'){ builtin.style.display='none'; if(target) target.innerHTML=''; document.removeEventListener('keydown', esc); } };
        document.addEventListener('keydown', esc);
        return;
      }
    }
    // fallback overlay
    const existing = el('.nb-modal-overlay');
    if(existing) existing.remove();
    const overlay = document.createElement('div'); overlay.className = 'nb-modal-overlay';
    overlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div'); box.className = 'nb-modal';
    box.style = 'max-width:900px;width:94%;background:linear-gradient(180deg,#071027,#041026);color:#fff;padding:18px;border-radius:12px;position:relative;border:1px solid rgba(255,255,255,0.06);';
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

  function openProductModalById(id){
    const prod = getProductsRaw().find(p => p.id === id);
    if(!prod) return alert('Listing not found');
    showModal(buildModalHtml(prod));
  }

  // ---------- Hero renderer (multiple pinned support) ----------
  function renderPinnedHero(){
    // Find all hero containers (some pages have multiple .hero accidentally)
    const heroSections = document.querySelectorAll('.hero');
    if(!heroSections || heroSections.length === 0) return;
    // Compute pinned list (pinned first sorted by pinnedAt desc)
    const raw = getProductsRaw() || [];
    const pinnedList = raw.filter(p => p && p.pinned).sort((a,b) => {
      const pa = a.pinnedAt ? new Date(a.pinnedAt) : new Date(a.createdAt || 0);
      const pb = b.pinnedAt ? new Date(b.pinnedAt) : new Date(b.createdAt || 0);
      return pb - pa;
    });

    heroSections.forEach(heroSection => {
      if(isProfilePage()) { heroSection.style.display = 'none'; return; } else { heroSection.style.display = ''; }

      // create hero-inner if missing
      let heroInner = heroSection.querySelector('.hero-inner');
      if(!heroInner){
        // preserve existing hero content by moving children into hero-inner
        heroInner = document.createElement('div'); heroInner.className = 'hero-inner container';
        while(heroSection.firstChild) heroInner.appendChild(heroSection.firstChild);
        heroSection.appendChild(heroInner);
      }

      // ensure left & right columns
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
        // ensure site-name filled
        left.querySelectorAll('.site-name').forEach(n => n.textContent = window.SITE_NAME || 'NEPALI BAZAR');
      }

      let right = heroInner.querySelector('.hero-right');
      if(!right){ right = document.createElement('div'); right.className = 'hero-right'; heroInner.appendChild(right); }

      if(pinnedList.length === 0){
        right.innerHTML = `<div class="hero-card neon-card"><img src="assets/images/hero-1.jpg" alt="hero image" onerror="this.style.display='none'"/><div class="meta">Featured: Browse current listings</div></div>`;
        return;
      }

      // Show the first pinned as large hero and small thumbnails for next pins if any
      const main = pinnedList[0];
      let otherHtml = '';
      if(pinnedList.length > 1){
        otherHtml = `<div class="other-pinned" style="display:flex;gap:8px;margin-top:10px;">` +
          pinnedList.slice(1,4).map(p => `<div style="flex:1;cursor:pointer" data-id="${escapeHtml(p.id)}"><img src="${escapeHtml((p.images&&p.images[0])||PLACEHOLDER_IMG)}" style="width:100%;height:84px;object-fit:cover;border-radius:8px"/></div>`).join('') +
          `</div>`;
      }

      right.innerHTML = `
        <div class="hero-card pinned-hero" style="cursor:pointer;position:relative;">
          <div style="position:absolute;left:12px;top:12px;background:linear-gradient(90deg,var(--neon-1),var(--neon-2));color:#041026;padding:6px 8px;border-radius:10px;font-weight:700;display:flex;align-items:center;gap:8px;">
            📌 Pinned
          </div>
          <img src="${escapeHtml((main.images && main.images[0]) ? main.images[0] : PLACEHOLDER_IMG)}" alt="${escapeHtml(main.title)}" style="width:100%;height:240px;object-fit:cover;border-radius:10px;" onerror="this.style.display='none'"/>
          <div class="meta" style="margin-top:10px">${escapeHtml(main.title)} — ${(Number(main.price)===0)?'FREE':(main.currency||'Rs.')+' '+numberWithCommas(main.price)}</div>
          ${otherHtml}
        </div>
      `;

      const heroCard = right.querySelector('.pinned-hero');
      if(heroCard){
        heroCard.addEventListener('click', ()=> openProductModalById(main.id));
        heroCard.style.transition = 'transform .16s ease, box-shadow .16s ease';
        heroCard.addEventListener('mouseenter', ()=> { heroCard.style.transform = 'translateY(-6px)'; heroCard.style.boxShadow = '0 18px 60px rgba(0,0,0,0.6)'; });
        heroCard.addEventListener('mouseleave', ()=> { heroCard.style.transform = ''; heroCard.style.boxShadow = ''; });
      }
      // small thumbnails click
      right.querySelectorAll('.other-pinned [data-id]').forEach(n => {
        n.addEventListener('click', ()=> openProductModalById(n.dataset.id));
      });
    });
  }

  // ---------- Categories ----------
  function initCategories(){
    const products = getProductsRaw();
    const cats = [...new Set((products||[]).map(p => p.category).filter(Boolean))].sort();
    const selects = document.querySelectorAll('#filter-category, select#filter-category, .filter-category');
    selects.forEach(sel => {
      if(!sel) return;
      const prev = sel.value || '';
      sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if(prev) sel.value = prev;
      sel.addEventListener('change', ()=> { renderAll(); });
    });
  }

  // ---------- Ads ----------
  function initAds(){
    const adSlots = document.querySelectorAll('.ad-slot');
    if(!adSlots || adSlots.length===0) return;
    adSlots.forEach((slot, idx) => {
      const def = AD_DEFS[idx % AD_DEFS.length];
      // If slot is an anchor we keep it; else wrap
      let anchor;
      if(slot.tagName.toLowerCase() === 'a'){ anchor = slot; }
      else {
        // if it already contains an anchor, use it
        const innerA = slot.querySelector('a');
        if(innerA) anchor = innerA;
        else {
          anchor = document.createElement('a');
          anchor.href = def.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener';
          // move existing images into anchor if present
          const existingImg = slot.querySelector('img');
          if(existingImg) { anchor.appendChild(existingImg); slot.innerHTML = ''; slot.appendChild(anchor); }
          else {
            const img = document.createElement('img');
            img.src = def.img; img.alt = 'ad';
            anchor.appendChild(img);
            slot.innerHTML = '';
            slot.appendChild(anchor);
          }
        }
      }
      // ensure img styles and hover
      const img = anchor.querySelector('img');
      if(img){
        img.style.transition = 'transform .28s ease, box-shadow .28s ease';
        // make sure it doesn't display none by default
        img.style.display = ''; 
        anchor.addEventListener('mouseenter', ()=> { img.style.transform = 'translateY(-6px) scale(1.03)'; img.style.boxShadow = '0 18px 60px rgba(0,0,0,0.6)'; });
        anchor.addEventListener('mouseleave', ()=> { img.style.transform = ''; img.style.boxShadow = ''; });
      }
      // click behavior: open specified url (anchor already has it)
      // if slot originally had no anchor we set href to def.url
      if(anchor && !anchor.href) anchor.href = def.url;
    });
  }

  // ---------- Sell form helpers ----------
  function initSellForm(){
    const form = el('#sell-form') || el('form#sell');
    if(!form) return;
    // add expiry date if missing
    if(!form.querySelector('[name="expiryDate"]')){
      const wrap = document.createElement('label');
      wrap.style.display = 'block';
      wrap.style.marginTop = '6px';
      wrap.innerHTML = `Expiry Date (max ${MAX_EXPIRY_DAYS} day(s) from today)<input type="date" name="expiryDate" required class="input" />`;
      const actions = form.querySelector('.form-actions');
      if(actions) form.insertBefore(wrap, actions);
      else form.appendChild(wrap);

      const inp = wrap.querySelector('input[name="expiryDate"]');
      const today = new Date();
      inp.min = today.toISOString().split('T')[0];
      inp.max = new Date(today.getTime() + MAX_EXPIRY_DAYS*24*60*60*1000).toISOString().split('T')[0];
      inp.value = inp.max;
    }
    // sanitize contact
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
      if(price > 100000000) return alert('Price exceeds allowed maximum.');
      if(!expiryDate) return alert('Please select an expiry date');

      // validate expiry window
      const today = new Date(); const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const chosen = dateOnlyToLocalMidnight(expiryDate);
      const max = new Date(todayMid.getTime() + MAX_EXPIRY_DAYS*24*60*60*1000);
      if(chosen < todayMid || chosen > max) return alert(`Expiry must be between today and ${MAX_EXPIRY_DAYS} days from today.`);

      // images: we won't persist file binary in demo; use placeholder or keep uploaded preview if you extend
      const images = ['assets/images/placeholder.jpg'];
      const seller = getCurrentUser() || fd.get('seller') || 'Anonymous';

      const product = {
        id: ('p-' + Date.now() + '-' + Math.floor(Math.random()*1000)),
        title,
        price,
        currency: 'Rs.',
        category: fd.get('category') || 'Other',
        location: location || fd.get('city') || '',
        seller,
        contact,
        description: fd.get('description') || '',
        images,
        createdAt: nowIsoDateTime(),
        expiryDate
      };

      addProduct(product);
      alert(price === 0 ? 'Listing published as FREE!' : 'Listing published!');
      // If we're on sell page redirect to products
      if(window.location.pathname.endsWith('sell.html')) window.location.href = 'products.html';
      else renderAll();
    });
  }

  // ---------- Search handling ----------
  function initGlobalSearch(){
    const ids = ['#global-search','#global-search-top','#global-search-product','#global-search-sell','#search-products','#search-products-top','#search-products-global','#search-box'];
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
    const ids = ['#search-products','#search-products-top','#search-products-global','#global-search-top','#global-search','#search-box'];
    ids.forEach(id => { const n = document.querySelector(id); if(n) n.value = q; });
  }

  // ---------- Renderers ----------
  // Sort prioritizes pinned (pinned true => top) ordered by pinnedAt desc then createdAt desc
  function sortByPinnedAndDate(list){
    return list.slice().sort((a,b) => {
      if((a.pinned?1:0) !== (b.pinned?1:0)) return (b.pinned?1:0) - (a.pinned?1:0);
      const pa = a.pinnedAt ? new Date(a.pinnedAt) : new Date(a.createdAt || 0);
      const pb = b.pinnedAt ? new Date(b.pinnedAt) : new Date(b.createdAt || 0);
      return pb - pa;
    });
  }

  function renderHomeGrid(limit = 8){
    // fill all #home-grid occurrences
    const grids = document.querySelectorAll('#home-grid, .home-grid');
    if(!grids || grids.length === 0) return;
    let list = getProducts().slice();
    // apply category filter if present
    const catSel = document.querySelector('#filter-category, select#filter-category, .filter-category');
    const catVal = catSel ? catSel.value : '';
    if(catVal) list = list.filter(p => p.category === catVal);
    list = sortByPinnedAndDate(list);
    grids.forEach(grid => {
      grid.innerHTML = '';
      const slice = list.slice(0, limit);
      slice.forEach(p => grid.appendChild(createCard(p)));
    });
  }

  function applyFilters(list){
    const q = (document.querySelector('#search-box')?.value || document.querySelector('#search-products')?.value || '').toLowerCase() || '';
    const category = (document.querySelector('#filter-category')?.value || '');
    const minPrice = parseInt(document.querySelector('#filter-min')?.value || '0');
    const maxPrice = parseInt(document.querySelector('#filter-max')?.value || '999999999');
    return list.filter(p => {
      if(q){
        const hay = ((p.title||'') + ' ' + (p.description||'') + ' ' + (p.seller||'') + ' ' + (p.location||'')).toLowerCase();
        if(!hay.includes(q)) return false;
      }
      if(category && p.category !== category) return false;
      const price = parseInt(p.price || '0');
      if(price < minPrice || price > maxPrice) return false;
      return true;
    });
  }

  function renderProductsPage(){
    const grid = document.querySelector('#products-grid');
    if(!grid) return;
    const qVal = (document.querySelector('#search-products')?.value || new URL(window.location.href).searchParams.get('q') || '');
    if(qVal && document.querySelector('#search-products')) document.querySelector('#search-products').value = qVal;
    let list = getProducts().slice();
    list = applyFilters(list);
    // sorting
    const sortVal = (document.querySelector('#filter-sort')?.value || 'new');
    if(sortVal === 'price-asc') list.sort((a,b) => Number(a.price||0) - Number(b.price||0));
    else if(sortVal === 'price-desc') list.sort((a,b) => Number(b.price||0) - Number(a.price||0));
    else list = sortByPinnedAndDate(list);
    grid.innerHTML = '';
    if(list.length === 0){ grid.innerHTML = '<div class="muted">No listings found.</div>'; return; }
    list.forEach(p => grid.appendChild(createCard(p)));
  }

  function renderProfilePage(){
    const container = el('#profile-listings');
    if(!container) return;
    const user = getCurrentUser();
    if(!user){ window.location.href = 'login.html'; return; }
    let list = getProducts().filter(p => p.seller === user);
    list = sortByPinnedAndDate(list);
    container.innerHTML = '';
    if(list.length === 0){ container.innerHTML = '<div class="muted">You have not listed any items yet.</div>'; return; }
    list.forEach(p => container.appendChild(createCard(p)));
  }

  function renderAll(){
    renderPinnedHero();
    renderHomeGrid();
    renderProductsPage();
    renderProfilePage();
  }

  // ---------- Filters init ----------
  function initFilters(){
    const ids = ['#search-box','#search-products','#filter-category','#filter-min','#filter-max','#filter-sort'];
    ids.forEach(id => {
      const n = document.querySelector(id);
      if(!n) return;
      const ev = (id === '#filter-sort') ? 'change' : 'input';
      n.addEventListener(ev, () => { renderProductsPage(); renderHomeGrid(); });
    });
  }

  // ---------- Auth UI (handles multiple header variants) ----------
  function initAuthUI(){
    // variants we support:
    // - #auth-links (container)
    // - #user-info + #username-display + #logout-btn + #login-link
    // - #profile-link (ensure exists)
    const user = getCurrentUser();
    // 1) #auth-links container (some pages)
    const authLinks = el('#auth-links');
    if(authLinks){
      if(user){
        authLinks.innerHTML = `<span class="muted">Hi, ${escapeHtml(user)}</span> <button id="nb-logout-small" class="btn">Logout</button>`;
        const btn = el('#nb-logout-small'); if(btn) btn.addEventListener('click', ()=> { logoutCurrentUser(); location.reload(); });
      } else {
        authLinks.innerHTML = `<a href="login.html" class="nav-link">Login</a>`;
      }
    }
    // 2) #user-info style (another variant)
    const userInfo = el('#user-info');
    const usernameDisplay = el('#username-display');
    const loginLink = el('#login-link');
    const logoutBtn = el('#logout-btn');
    if(userInfo && usernameDisplay){
      if(user){
        if(loginLink) loginLink.style.display = 'none';
        userInfo.style.display = 'inline';
        usernameDisplay.textContent = user;
      } else {
        if(loginLink) loginLink.style.display = 'inline';
        userInfo.style.display = 'none';
      }
    }
    if(logoutBtn){
      logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logoutCurrentUser(); location.reload(); });
    }

    // 3) ensure profile link exists in header
    const nav = document.querySelector('.nav');
    if(nav){
      let profileLink = el('#profile-link');
      if(!profileLink){
        profileLink = document.createElement('a');
        profileLink.id = 'profile-link';
        profileLink.className = 'nav-link';
        profileLink.href = 'profile.html';
        profileLink.textContent = 'Profile';
        // append at the end of nav (safe)
        nav.appendChild(profileLink);
      }
      if(user) profileLink.style.display = 'inline';
      else profileLink.style.display = 'none';
    }

    // 4) top-right small auth UI fallback
    const topAuth = el('#top-auth');
    if(topAuth){
      if(user) topAuth.innerHTML = `Hi, ${escapeHtml(user)} | <a href="#" id="top-logout">Logout</a>`;
      else topAuth.innerHTML = `<a href="login.html">Login</a>`;
      const tlo = el('#top-logout'); if(tlo) tlo.addEventListener('click',(e)=>{ e.preventDefault(); logoutCurrentUser(); location.reload(); });
    }
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    migrateLegacyProducts();
    ensureDefaultUsers();
    seedDemoProducts();

    initAuthUI();
    initAds();
    initCategories();
    initFilters();
    initGlobalSearch();
    prefillSearchFromQuery();
    initSellForm();

    renderAll();

    // expose globally for inline scripts/HTML
    window.renderHomeGrid = renderHomeGrid;
    window.renderProductsPage = renderProductsPage;
    window.renderProfilePage = renderProfilePage;
    window.NB_PIN_PRODUCT = pinProduct;
    window.NB_UNPIN_PRODUCT = unpinProduct;
    window.NB_DELETE_PRODUCT = deleteProduct;
    window.NB_VIEW_PRODUCT = openProductModalById;
    window.NB_SET_USER = setCurrentUser;
    window.NB_LOGOUT = function(){ logoutCurrentUser(); location.reload(); };
  });

  // ---------- End ----------
})();
