/* Fixed app.js - prevents hero flicker, keeps all features */
(function(){
  // ---------- CONFIG ----------
  const STORAGE_KEY = window.LOCAL_STORAGE_KEY || 'nb_products_v1';
  const USERS_KEY = window.LOCAL_USERS_KEY || 'nb_users_v1';
  const MAX_EXPIRY_DAYS = 7;
  const MAX_PRICE = 100000000;

  // ---------- DOM helpers ----------
  const el = (s) => document.querySelector(s);
  const els = (s) => Array.from(document.querySelectorAll(s));
  const isProfilePage = () => /profile\.html$/i.test(window.location.pathname) || !!el('#profile-page');

  function escapeHtml(s){ return s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]) : ''; }
  function numberWithCommas(x){ try{ return Number(x).toLocaleString('en-IN'); }catch(e){ return x; } }
  function nowIsoDateTime(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function dateOnlyToLocalMidnight(dateStr){ try{ const parts=dateStr.split('T')[0].split(' ')[0]; return new Date(parts+'T00:00:00'); }catch(e){ return new Date(dateStr);} }
  function readJSON(key, fallback){ try{ const raw=localStorage.getItem(key); if(!raw) return fallback; return JSON.parse(raw);}catch(e){return fallback;} }
  function writeJSON(key,val){ try{ localStorage.setItem(key,JSON.stringify(val));}catch(e){} }

  // ---------- Users ----------
  function ensureDefaultUsers(){ const users=readJSON(USERS_KEY,null); if(users&&Array.isArray(users)&&users.length) return; const defaults=[{username:'sohaum',password:'sohaum',role:'admin'},{username:'sneha',password:'sneha',role:'user'}]; writeJSON(USERS_KEY,defaults); return defaults; }

  // ---------- Products ----------
  const getProductsRaw=()=>readJSON(STORAGE_KEY,[]);
  const saveProductsRaw=(l)=>writeJSON(STORAGE_KEY,l);
  function getProducts(){ const raw=getProductsRaw(); const todayMid=new Date(new Date().toDateString()); return (raw||[]).filter(p=>{ if(!p) return false; if(!p.expiryDate) return true; return dateOnlyToLocalMidnight(p.expiryDate)>=todayMid; }); }

  // ---------- Auth ----------
  const getCurrentUser=()=>{try{return localStorage.getItem('nb_logged_in_user')||null;}catch(e){return null;}};
  const setCurrentUser=(u)=>{try{localStorage.setItem('nb_logged_in_user',u);}catch(e){}};
  const logoutCurrentUser=()=>{try{localStorage.removeItem('nb_logged_in_user');}catch(e){}};

  function isAdmin(){ const u=getCurrentUser(); if(!u) return false; const users=readJSON(USERS_KEY,[]); const match=users.find(x=>x.username===u); return !!(match&&match.role==='admin'); }
  function canDelete(product){ const u=getCurrentUser(); if(!u) return false; const users=readJSON(USERS_KEY,[]); const me=users.find(x=>x.username===u); if(me&&me.role==='admin') return true; return product&&product.seller===u&&isProfilePage(); }

  // ---------- Pin helpers ----------
  function pinProduct(id){ if(!isAdmin()) return alert('Only admin can pin'); const list=getProductsRaw(); list.forEach(p=>p.pinned=false); const found=list.find(p=>p.id===id); if(found){ found.pinned=true; found.pinnedBy=getCurrentUser(); found.pinnedAt=new Date().toISOString(); saveProductsRaw(list); renderPinnedHero(); renderHomeGrid(); renderProductsPage(); renderProfilePage(); }}
  function unpinProduct(id){ if(!isAdmin()) return alert('Only admin can unpin'); const list=getProductsRaw(); const f=list.find(p=>p.id===id); if(f){ f.pinned=false; delete f.pinnedBy; delete f.pinnedAt; saveProductsRaw(list); renderPinnedHero(); renderHomeGrid(); renderProductsPage(); renderProfilePage(); }}

  // ---------- Card creation ----------
  function createCard(p){ const card=document.createElement('div'); card.className='card'; const img=(p.images&&p.images[0])||'assets/images/placeholder.jpg'; const price=(+p.price===0)?'FREE':(p.currency||'Rs.')+' '+numberWithCommas(p.price);
    card.innerHTML=`<div class="thumb"><img src="${escapeHtml(img)}"/></div><div class="title">${escapeHtml(p.title)} ${p.pinned?'<span>📌</span>':''}</div>`;
    return card; }

  // ---------- Delete ----------
  function deleteProduct(id){ let list=getProductsRaw(); const f=list.find(p=>p.id===id); if(!f) return; if(!canDelete(f)) return; list=list.filter(p=>p.id!==id); saveProductsRaw(list); renderPinnedHero(); renderHomeGrid(); renderProductsPage(); renderProfilePage(); }

  // ---------- Modal ----------
  function showModal(html){ const m=el('#nb-modal'); if(m){ m.querySelector('#nb-modal-body').innerHTML=html; m.style.display='flex'; return; } alert('modal placeholder'); }

  function buildModalHtml(p){ return `<h2>${escapeHtml(p.title)}</h2>`; }
  function openProductModalById(id){ const p=getProductsRaw().find(x=>x.id===id); if(p) showModal(buildModalHtml(p)); }

  // ---------- Hero rendering (FIXED) ----------
  function renderPinnedHero(){ const hero=el('.hero'); if(!hero) return;
    if(isProfilePage()){ hero.style.display='none'; return; } else { hero.style.display=''; }

    let heroInner=hero.querySelector('.hero-inner');
    if(!heroInner){ heroInner=document.createElement('div'); heroInner.className='container hero-inner'; hero.appendChild(heroInner); }

    // left side (static)
    let left=heroInner.querySelector('.hero-left');
    if(!left){ left=document.createElement('div'); left.className='hero-left'; left.innerHTML=`<h1 class="hero-title"><span class="accent site-name"></span><br>Buy • Sell • Connect — Locally</h1>`; heroInner.appendChild(left); }

    // right side (dynamic)
    let right=heroInner.querySelector('.hero-right');
    if(!right){ right=document.createElement('div'); right.className='hero-right'; heroInner.appendChild(right); }

    const pinned=getProductsRaw().find(p=>p&&p.pinned);
    if(!pinned){ right.innerHTML=`<div class="hero-card">No pinned ad</div>`; return; }

    right.innerHTML=`<div class="hero-card pinned-hero"><img src="${escapeHtml((pinned.images&&pinned.images[0])||'assets/images/placeholder.jpg')}"/><div>${escapeHtml(pinned.title)} - ${pinned.price}</div></div>`;
    right.querySelector('.pinned-hero').onclick=()=>openProductModalById(pinned.id);
  }

  // ---------- Renderers ----------
  function renderHomeGrid(){ const grid=el('#home-grid'); if(!grid) return; grid.innerHTML=''; getProducts().slice(0,8).forEach(p=>grid.appendChild(createCard(p))); }
  function renderProductsPage(){ const grid=el('#products-grid'); if(!grid) return; grid.innerHTML=''; getProducts().forEach(p=>grid.appendChild(createCard(p))); }
  function renderProfilePage(){ const cont=el('#profile-listings'); if(!cont) return; cont.innerHTML=''; getProducts().filter(p=>p.seller===getCurrentUser()).forEach(p=>cont.appendChild(createCard(p))); }

  window.renderHomeGrid=renderHomeGrid;
  window.renderProductsPage=renderProductsPage;
  window.renderProfilePage=renderProfilePage;
  window.NB_PIN_PRODUCT=pinProduct;
  window.NB_UNPIN_PRODUCT=unpinProduct;
  window.NB_DELETE_PRODUCT=deleteProduct;

  // ---------- Auth UI ----------
  function initAuthUI(){ const nav=el('.nav'); if(!nav) return; }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded',()=>{
    ensureDefaultUsers();
    renderPinnedHero();
    renderHomeGrid();
    renderProductsPage();
    renderProfilePage();
  });
})();
