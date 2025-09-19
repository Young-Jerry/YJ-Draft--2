// Product data and localStorage bootstrap
(function(){
  const initial = [
    {
      id: "p-1001",
      title: "Gaming Laptop — RTX 2060",
      price: 85000,
      currency: "Rs.",
      category: "Electronics",
      location: "Kathmandu",
      seller: "Rajan",
      contact: "9801234567",
      description: "Well maintained gaming laptop, 16GB RAM, RTX 2060, 512GB SSD.",
      images: ["assets/images/sample-1.jpg"],
      createdAt: "2025-07-01",
      expiryDate: "2025-07-08"
    },
    {
      id: "p-1002",
      title: "Mountain Bike — 26 inch",
      price: 18000,
      currency: "Rs.",
      category: "Vehicles",
      location: "Pokhara",
      seller: "Sita",
      contact: "9812345678",
      description: "Good condition, replaced tires recently.",
      images: ["assets/images/sample-2.jpg"],
      createdAt: "2025-07-08",
      expiryDate: "2025-07-15"
    },
    {
      id: "p-1003",
      title: "Engineering Textbooks Set",
      price: 3500,
      currency: "Rs.",
      category: "Books",
      location: "Dhulikhel",
      seller: "CampusStore",
      contact: "campus@store.test",
      description: "Semester books: Engineering Mathematics, Physics, Mechanics",
      images: ["assets/images/sample-3.jpg"],
      createdAt: "2025-06-22",
      expiryDate: "2025-06-29"
    }
  ];

  // storage keys
  const key = window.LOCAL_STORAGE_KEY || "nb_products_v1";
  const pinKey = "nb_pinned_ad";

  let products = [];

  // helper: remove expired ads
  function filterExpired(list){
    const today = new Date();
    return list.filter(p => {
      if (!p.expiryDate) return true;
      return new Date(p.expiryDate) >= today;
    });
  }

  // Load from storage
  try {
    const raw = localStorage.getItem(key);
    if (raw) products = JSON.parse(raw);
  } catch (e){
    console.warn("Failed reading local products", e);
  }

  // If none, initialize with sample
  if (!products || !Array.isArray(products) || products.length === 0) {
    products = initial;
    try { localStorage.setItem(key, JSON.stringify(products)); } catch(e){}
  }

  // Always clean expired ads
  products = filterExpired(products);
  try { localStorage.setItem(key, JSON.stringify(products)); } catch(e){}

  // Save products to storage
  function saveProducts() {
    try { localStorage.setItem(key, JSON.stringify(products)); } catch(e){}
  }

  // Refresh products
  function getProducts() {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        products = JSON.parse(raw);
        products = filterExpired(products);
      }
    } catch(e){
      console.warn("Failed to reload products", e);
    }
    return products;
  }

  // Generate new ID
  function generateId() {
    return "p-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  }

  // --- PINNED AD FUNCTIONS ---
  function getPinnedAd() {
    try {
      const raw = localStorage.getItem(pinKey);
      if (raw) return JSON.parse(raw);
    } catch(e){
      console.warn("Failed to read pinned ad", e);
    }
    return null;
  }

  function setPinnedAd(product) {
    try {
      localStorage.setItem(pinKey, JSON.stringify(product));
    } catch(e){}
  }

  function clearPinnedAd() {
    try {
      localStorage.removeItem(pinKey);
    } catch(e){}
  }

  // Expose globally
  window.NB_PRODUCTS = products;
  window.NB_SAVE_PRODUCTS = saveProducts;
  window.NB_GENERATE_ID = generateId;
  window.NB_GET_PRODUCTS = getProducts;

  window.NB_GET_PINNED = getPinnedAd;
  window.NB_SET_PINNED = setPinnedAd;
  window.NB_CLEAR_PINNED = clearPinnedAd;
})();
