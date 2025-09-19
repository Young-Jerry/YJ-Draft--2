/* app.js - Full site controller */
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
  function nowIsoDateTime(){ const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function dateOnlyToLocalMidnight(dateStr){ try{ const parts = dateStr.split('T')[0].split(' ')[0]; return new Date(parts+'T00:00:00'); }catch(e){ return new Date(dateStr);} }

  function readJSON(key, fallback){ try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback; }catch(e){ return fallback; } }
  function writeJSON(key,value){ try{ localStorage.setItem(key,JSON.stringify(value)); }catch(e){} }

  // ---------- Users ----------
  function ensureDefaultUsers(){
    const users = readJSON(USERS_KEY, null);
    if(users && Array.isArray(users) && users.length) return;
    const defaults=[{username:'sohaum',password:'sohaum',role:'admin'},{username:'sneha',password:'sneha',role:'user'}];
    writeJSON(USERS_KEY, defaults);
    return defaults;
  }

  // ---------- Products ----------
  function getProductsRaw(){ return readJSON(STORAGE_KEY, []); }
  function saveProductsRaw(list){ writeJSON(STORAGE_KEY, list); }
  function getProducts(){
    const raw=getProductsRaw();const today=new Date();const mid=new Date(today.getFullYear(),today.getMonth(),today.getDate());
    return (raw||[]).filter(p=>!p.expiryDate || dateOnlyToLocalMidnight(p.expiryDate)>=mid);
  }

  // ---------- Auth ----------
  function getCurrentUser(){ return localStorage.getItem(LOGGED_IN_KEY)||null; }
  function setCurrentUser(u){ localStorage.setItem(LOGGED_IN_KEY,u); }
  function logoutCurrentUser(){ localStorage.removeItem(LOGGED_IN_KEY); }
  function isAdmin(){ const u=getCurrentUser(); if(!u) return false; const users=readJSON(USERS_KEY,[]); return (users.find(x=>x.username===u)?.role==='admin'); }
  function canDelete(p){ const u=getCurrentUser(); if(!u) return false; const users=readJSON(USERS_KEY,[]); const user=users.find(x=>x.username===u); return user?.role==='admin' || (p?.seller===u && isProfilePage()); }

  // ---------- Seed demo ----------
  function seedDemoProducts(){
    const raw=getProductsRaw(); if(raw.length) return;
    const demo=[
      {id:'p-'+Date.now()+'-1',title:'iPhone 14',description:'128GB, like new',price:120000,currency:'Rs.',category:'Electronics',location:'Kathmandu',seller:'sohaum',contact:'9800000000',images:['assets/images/iphone.jpg'],createdAt:nowIsoDateTime(),expiryDate:new Date(Date.now()+3*86400000).toISOString()},
      {id:'p-'+(Date.now()+1),title:'Mountain Bike',description:'Hardtail 26in',price:25000,currency:'Rs.',category:'Sports',location:'Pokhara',seller:'sneha',contact:'9811111111',images:['assets/images/bike.jpg'],createdAt:nowIsoDateTime(),expiryDate:new Date(Date.now()+5*86400000).toISOString()},
      {id:'p-'+(Date.now()+2),title:'Textbook: Physics',description:'Used, good condition',price:1200,currency:'Rs.',category:'Books',location:'Dharan',seller:'demo',contact:'demo@nb.local',images:['assets/images/book.jpg'],createdAt:nowIsoDateTime(),expiryDate:new Date(Date.now()+7*86400000).toISOString()}
    ];
    saveProductsRaw(demo);
  }

  // ---------- Pin ----------
  function pinProduct(id){ if(!isAdmin()) return alert('Only admin can pin'); const list=getProductsRaw(); list.forEach(p=>p.pinned=false); const f=list.find(p=>p.id===id); if(!f) return; f.pinned=true; saveProductsRaw(list); renderPinnedHero(); renderAll(); }
  function unpinProduct(id){ if(!isAdmin()) return alert('Only admin can unpin'); const list=getProductsRaw(); const f=list.find(p=>p.id===id); if(!f) return; f.pinned=false; saveProductsRaw(list); renderPinnedHero(); renderAll(); }

  // ---------- Card ----------
  function createCard(p){
    const card=document.createElement('div'); card.className='card'; card.dataset.id=p.id;
    const img=(p.images&&p.images[0])||PLACEHOLDER_IMG;
    const price=(+p.price===0)?'FREE':(p.currency||'Rs.')+' '+numberWithCommas(p.price);
    const pinned=p.pinned?'<span>📌</span>':'';
    card.innerHTML=`
      <div class="thumb"><img src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" onerror="this.src='${PLACEHOLDER_IMG}'"></div>
      <div class="title">${escapeHtml(p.title)} ${pinned}</div>
      <div class="meta"><div class="price">${price}</div><div class="muted small">${escapeHtml(p.location||'')}</div></div>
      <div class="desc small muted">${escapeHtml((p.description||'').slice(0,120))}</div>
      <div class="actions">
        <button class="btn view-btn" data-id="${p.id}">View</button>
        ${canDelete(p)?`<button class="btn btn-danger delete-btn" data-id="${p.id}">🗑️</button>`:''}
        ${isAdmin()?(p.pinned?`<button class="btn" data-pin-action="unpin" data-id="${p.id}">Unpin</button>`:`<button class="btn" data-pin-action="pin" data-id="${p.id}">Pin</button>`):''}
      </div>`;
    card.querySelector('.view-btn').onclick=()=>showModal(buildModalHtml(p));
    const del=card.querySelector('.delete-btn'); if(del) del.onclick=()=>{if(confirm('Delete?')) deleteProduct(p.id);};
    card.querySelectorAll('[data-pin-action]').forEach(b=>b.onclick=()=>b.dataset.pinAction==='pin'?pinProduct(p.id):unpinProduct(p.id));
    return card;
  }

  // ---------- Delete ----------
  function deleteProduct(id){ let list=getProductsRaw().filter(p=>p.id!==id); saveProductsRaw(list); renderPinnedHero(); renderAll(); }

  // ---------- Modal ----------
  function showModal(html){ const ex=el('.nb-modal-overlay'); if(ex) ex.remove(); const o=document.createElement('div'); o.className='nb-modal-overlay'; o.style='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;'; const b=document.createElement('div'); b.className='nb-modal'; b.style='max-width:800px;width:92%;background:#071027;color:#fff;padding:18px;border-radius:12px;'; b.innerHTML=`<button class="nb-modal-close">✕</button><div>${html}</div>`; o.appendChild(b); document.body.appendChild(o); b.querySelector('.nb-modal-close').onclick=()=>o.remove(); o.onclick=(e)=>{if(e.target===o) o.remove();}; }
  function buildModalHtml(p){ const img=(p.images&&p.images[0])||PLACEHOLDER_IMG; return `<h2>${escapeHtml(p.title)}</h2><img src="${escapeHtml(img)}" style="width:100%;max-height:220px;object-fit:cover"><p>${escapeHtml(p.description||'')}</p><p><b>Price:</b> ${(p.price===0)?'FREE':p.currency+' '+numberWithCommas(p.price)}</p><p><b>Seller:</b> ${escapeHtml(p.seller||'')}</p><p><b>Contact:</b> ${escapeHtml(p.contact||'')}</p>`; }

  // ---------- Hero ----------
  function renderPinnedHero(){
    const hero=el('.hero'); if(!hero) return;
    const pinned=getProductsRaw().find(p=>p.pinned);
    hero.innerHTML=pinned?`<div class="hero-card"><img src="${(pinned.images&&pinned.images[0])||PLACEHOLDER_IMG}" alt=""><div>${escapeHtml(pinned.title)} - ${(pinned.price===0)?'FREE':pinned.currency+' '+numberWithCommas(pinned.price)}</div></div>`:`<div class="hero-card"><img src="assets/images/hero-1.jpg"><div>Featured listings</div></div>`;
  }

  // ---------- Ads ----------
  function initAds(){
    const slots=document.querySelectorAll('.ad-slot'); if(!slots.length) return;
    const ads=[{img:'assets/images/ad1.jpg',url:'https://google.com'},{img:'assets/images/ad2.jpg',url:'https://google.com'}];
    slots.forEach((slot,i)=>{ slot.innerHTML=`<a href="${ads[i%ads.length].url}" target="_blank"><img src="${ads[i%ads.length].img}" alt="ad"></a>`; });
  }

  // ---------- Renderers ----------
  function renderHomeGrid(limit=8){ const g=el('#home-grid'); if(!g) return; let list=getProducts().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); g.innerHTML=''; list.slice(0,limit).forEach(p=>g.appendChild(createCard(p))); }
  function renderProductsPage(){ const g=el('#products-grid'); if(!g) return; let list=getProducts().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); g.innerHTML=''; if(!list.length) return g.innerHTML='<div class="muted">No listings</div>'; list.forEach(p=>g.appendChild(createCard(p))); }
  function renderProfilePage(){ const g=el('#profile-listings'); if(!g) return; const u=getCurrentUser(); if(!u) return location.href='login.html'; let list=getProducts().filter(p=>p.seller===u); g.innerHTML=''; list.forEach(p=>g.appendChild(createCard(p))); }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', ()=>{
    ensureDefaultUsers(); seedDemoProducts();
    initAuthUI(); initAds(); renderPinnedHero(); renderHomeGrid(); renderProductsPage(); renderProfilePage();
  });

  // ---------- Auth UI ----------
  function initAuthUI(){
    const nav=el('.nav'); if(!nav) return;
    let profile=el('#profile-link'); if(!profile){ profile=document.createElement('a'); profile.id='profile-link'; profile.href='profile.html'; profile.className='nav-link'; profile.textContent='Profile'; nav.appendChild(profile); }
    const u=getCurrentUser(); if(u){ profile.style.display='inline'; } else { profile.style.display='none'; }
  }

  // expose
  window.renderHomeGrid=renderHomeGrid; window.renderProductsPage=renderProductsPage; window.renderProfilePage=renderProfilePage;
})();
