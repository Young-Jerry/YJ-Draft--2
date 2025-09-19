
// nb-fixes.js: ensures ads appear on index and products pages and global search behaviour enhancement
document.addEventListener('DOMContentLoaded', function(){
  // show ads on index if ad slot missing
  try {
    var ad1 = 'assets/images/ad1.jpg';
    var ad2 = 'assets/images/ad2.jpg';
    // index: add ad below hero if #ads-home missing
    if(document.getElementById('ads-home') && document.getElementById('ads-home').children.length===0){
      var ah = document.getElementById('ads-home');
      ah.innerHTML = '<a href="https://www.google.com" target="_blank"><img src="'+ad1+'" alt="ad1"></a>';
    }
    // products: ensure sidebar ad anchors to google
    var sideAd = document.querySelector('.ad-slot img');
    if(sideAd){
      var a = sideAd.parentElement;
      if(a && a.tagName.toLowerCase() !== 'a'){
        var link = document.createElement('a'); link.href='https://www.google.com'; link.target='_blank';
        sideAd.parentNode.replaceChild(link, sideAd);
        link.appendChild(sideAd);
      } else if(a && a.tagName.toLowerCase()==='a'){
        a.href='https://www.google.com'; a.target='_blank';
      }
    }
  } catch(e){ console.warn(e); }

  // enhance global search: support product id exact match -> go to product detail if match
  var gs = document.getElementById('global-search');
  if(gs){
    gs.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){
        var q = gs.value.trim();
        if(!q) return;
        // if matches id pattern p-123 or numeric only, try to find product and open product.html?id=...
        var products = JSON.parse(localStorage.getItem('nb_products_v1') || JSON.stringify(window.NB_PRODUCTS || []));
        var found = products.find(p=>p.id.toLowerCase()===q.toLowerCase());
        if(found){
          window.location.href = 'product.html?id=' + encodeURIComponent(found.id);
          return;
        }
        window.location.href = 'products.html?q=' + encodeURIComponent(q);
      }
    });
  }
});
