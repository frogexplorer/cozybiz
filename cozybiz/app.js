/* ============================================
   CozyBiz — app.js (CLOUD VERSION)
   ============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, query, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKdKhpjJPzoL_c8mzPvCy7-u0fLX_xk44",
  authDomain: "cozybiz-app.firebaseapp.com",
  projectId: "cozybiz-app",
  storageBucket: "cozybiz-app.firebasestorage.app",
  messagingSenderId: "300023446498",
  appId: "1:300023446498:web:ee86f0a407c01ec386d7bb",
  measurementId: "G-3LBVJ3EV7Z"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let state = { products: [], sales: [], expenses: [] };
let earningsChart = null;
let currentProductImage = null;

let unsubscribeProducts = null;
let unsubscribeSales = null;
let unsubscribeExpenses = null;

/* ---------- HELPERS ---------- */
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function peso(amount) { return '₱' + Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatDateShort(dateStr) { return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
function getProduct(id) { return state.products.find(p => p.id === id); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

/* ---------- AUTHENTICATION ---------- */

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'grid';
    setupRealtimeListeners();
  } else {
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    state = { products: [], sales: [], expenses: [] };
    if (unsubscribeProducts) unsubscribeProducts();
    if (unsubscribeSales) unsubscribeSales();
    if (unsubscribeExpenses) unsubscribeExpenses();
  }
});

document.getElementById('tabLogin').addEventListener('click', () => {
  document.getElementById('tabLogin').classList.add('active');
  document.getElementById('tabSignup').classList.remove('active');
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('signupForm').style.display = 'none';
});

document.getElementById('tabSignup').addEventListener('click', () => {
  document.getElementById('tabSignup').classList.add('active');
  document.getElementById('tabLogin').classList.remove('active');
  document.getElementById('signupForm').style.display = 'block';
  document.getElementById('loginForm').style.display = 'none';
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    document.getElementById('loginError').textContent = "Invalid email or password.";
  }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    document.getElementById('signupError').textContent = error.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  signOut(auth);
});

/* ---------- REAL-TIME DATA SYNC ---------- */

function setupRealtimeListeners() {
  if (!currentUser) return;
  const userRef = `users/${currentUser.uid}`;
  
  unsubscribeProducts = onSnapshot(query(collection(db, `${userRef}/products`)), (snapshot) => {
    state.products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderInventory();
    renderDashboard();
    populateSaleProductSelect();
  });

  unsubscribeSales = onSnapshot(query(collection(db, `${userRef}/sales`)), (snapshot) => {
    state.sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderRecentSales();
    renderDashboard();
    renderReports();
  });

  unsubscribeExpenses = onSnapshot(query(collection(db, `${userRef}/expenses`)), (snapshot) => {
    state.expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderRecentExpenses();
    renderDashboard();
    renderReports();
  });
}

/* ---------- NAVIGATION ---------- */

function switchPage(pageId, navPageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  if (navPageId) {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === navPageId);
    });
  }
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      switchPage(page, page);
      if (page === 'dashboard') renderDashboard();
      if (page === 'reports') renderReports();
    });
  });
}

/* ============================================
   INVENTORY
   ============================================ */

function renderInventory() {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;
  const search = document.getElementById('inventorySearch').value.trim().toLowerCase();
  const category = document.getElementById('inventoryCategoryFilter').value;

  let rows = state.products.filter(p => {
    const pCat = p.category.toLowerCase();
    const matchesCat = category === 'all' || pCat === category || (category === 'other' && !['food','drinks','crafts','clothing'].includes(pCat));
    return (!search || p.name.toLowerCase().includes(search)) && matchesCat;
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No products match. Add your first product!</div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => {
    let statusClass = 'status-ok', statusLabel = 'In stock';
    if (p.stock <= 0) { statusClass = 'status-out'; statusLabel = 'Out of stock'; } 
    else if (p.stock <= p.lowStockThreshold) { statusClass = 'status-low'; statusLabel = 'Low stock'; }

    const thumb = p.image ? `<img class="product-thumb" src="${p.image}" alt="">` : `<div class="product-thumb"></div>`;
    return `<tr>
      <td><div class="product-cell">${thumb}<span>${escapeHtml(p.name)}</span></div></td>
      <td>${capitalize(p.category)}</td><td>${p.stock}</td>
      <td>${peso(p.price)}</td><td>${peso(p.cost)}</td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td><div class="row-actions">
        <button onclick="window.openProductForm('${p.id}')">Edit</button>
        <button class="delete-row-btn" onclick="window.deleteProduct('${p.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

window.openProductForm = function(productId) {
  document.getElementById('productForm').reset();
  currentProductImage = null;
  document.getElementById('imagePreview').innerHTML = `<div><span>️</span><p>No image</p></div>`;
  document.getElementById('customCategoryWrapper').style.display = 'none';
  document.getElementById('customCategory').required = false;

  if (productId) {
    const p = getProduct(productId);
    if (!p) return;
    document.getElementById('productFormTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productStock').value = p.stock;
    document.getElementById('productLowStockThreshold').value = p.lowStockThreshold;
    document.getElementById('productPrice').value = p.price;
    document.getElementById('productCost').value = p.cost;
    
    // Handle Category (Standard vs Custom)
    const standardCats = ['food', 'drinks', 'crafts', 'clothing', 'other'];
    const isStandard = standardCats.includes(p.category.toLowerCase());
    
    if (isStandard) {
      document.getElementById('productCategory').value = p.category.toLowerCase();
      document.getElementById('customCategoryWrapper').style.display = 'none';
      document.getElementById('customCategory').required = false;
    } else {
      document.getElementById('productCategory').value = 'other';
      document.getElementById('customCategoryWrapper').style.display = 'flex';
      document.getElementById('customCategory').value = p.category;
      document.getElementById('customCategory').required = true;
    }

    if (p.image) {
      currentProductImage = p.image;
      document.getElementById('imagePreview').innerHTML = `<img src="${p.image}" alt="">`;
    }
  } else {
    document.getElementById('productFormTitle').textContent = 'Add Product';
    document.getElementById('productId').value = '';
    document.getElementById('productCategory').value = 'food';
  }
  switchPage('productFormPage', null); 
}

window.deleteProduct = async function(productId) {
  const p = getProduct(productId);
  if (!p || !confirm(`Delete "${p.name}"?`)) return;
  try {
    await deleteDoc(doc(db, `users/${currentUser.uid}/products`, productId));
  } catch (err) {
    console.error("Error deleting:", err);
    alert("Failed to delete product.");
  }
}

function setupProductForm() {
  const addBtn = document.getElementById('addProductBtn');
  if (addBtn) addBtn.addEventListener('click', () => window.openProductForm(null));
  
  const cancelBtn = document.getElementById('cancelProductFormBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => switchPage('inventory', 'inventory'));

  // Show/Hide Custom Category Input
  const categorySelect = document.getElementById('productCategory');
  const customCategoryWrapper = document.getElementById('customCategoryWrapper');
  const customCategoryInput = document.getElementById('customCategory');

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === 'other') {
      customCategoryWrapper.style.display = 'flex';
      customCategoryInput.required = true;
    } else {
      customCategoryWrapper.style.display = 'none';
      customCategoryInput.required = false;
      customCategoryInput.value = ''; 
    }
  });

  const imgInput = document.getElementById('productImageInput');
  if (imgInput) {
    imgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 300 * 1024) { alert('Image too large! Max 300KB.'); e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => {
        currentProductImage = reader.result;
        document.getElementById('imagePreview').innerHTML = `<img src="${reader.result}" alt="">`;
      };
      reader.readAsDataURL(file);
    });
  }

  const prodForm = document.getElementById('productForm');
  if (prodForm) {
    prodForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('productId').value;
      
      // Determine final category
      let finalCategory = document.getElementById('productCategory').value;
      if (finalCategory === 'other') {
        finalCategory = document.getElementById('customCategory').value.trim();
        if (!finalCategory) {
          alert("Please enter a custom category name.");
          return;
        }
      }

      const productData = {
        name: document.getElementById('productName').value.trim(),
        category: finalCategory,
        stock: Number(document.getElementById('productStock').value),
        lowStockThreshold: Number(document.getElementById('productLowStockThreshold').value) || 0,
        price: Number(document.getElementById('productPrice').value),
        cost: Number(document.getElementById('productCost').value),
        image: currentProductImage
      };
      
      try {
        if (id) {
          await updateDoc(doc(db, `users/${currentUser.uid}/products`, id), productData);
        } else {
          await addDoc(collection(db, `users/${currentUser.uid}/products`), productData);
        }
        switchPage('inventory', 'inventory');
      } catch (err) {
        console.error("Error saving product:", err);
        alert("Failed to save product.");
      }
    });
  }
  
  const searchInput = document.getElementById('inventorySearch');
  if (searchInput) searchInput.addEventListener('input', renderInventory);
  const catFilter = document.getElementById('inventoryCategoryFilter');
  if (catFilter) catFilter.addEventListener('change', renderInventory);
}

/* ============================================
   SALES
   ============================================ */

function populateSaleProductSelect() {
  const select = document.getElementById('saleProductSelect');
  if (!select) return;
  select.innerHTML = state.products.map(p => `<option value="${p.id}" data-price="${p.price}">${escapeHtml(p.name)} (${peso(p.price)}) — ${p.stock} in stock</option>`).join('') || `<option value="">No products yet</option>`;
  updateSaleTotal();
}

function updateSaleTotal() {
  const select = document.getElementById('saleProductSelect');
  const qty = Number(document.getElementById('saleQuantity').value) || 0;
  const price = select.options[select.selectedIndex] ? Number(select.options[select.selectedIndex].dataset.price || 0) : 0;
  document.getElementById('saleTotalDisplay').textContent = peso(price * qty);
}

function renderRecentSales() {
  const container = document.getElementById('recentSalesList');
  if (!container) return;
  const sorted = [...state.sales].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state">No sales recorded yet.</div>`;
    return;
  }
  container.innerHTML = sorted.slice(0, 15).map(s => `
    <div class="list-row">
      <div>
        <div class="list-row-title">${escapeHtml(s.productName)} × ${s.quantity}</div>
        <div class="list-row-sub">${formatDateShort(s.date)}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="list-row-value">${peso(s.total)}</div>
        <button onclick="window.deleteSale('${s.id}')" class="delete-row-btn" style="margin-left: 8px;">Delete</button>
      </div>
    </div>
  `).join('');
}

window.deleteSale = async function(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) return;
  if (!confirm(`Delete this sale of ${sale.productName} (${peso(sale.total)})? Stock will be restored.`)) return;
  
  const product = getProduct(sale.productId);
  if (product) {
    await updateDoc(doc(db, `users/${currentUser.uid}/products`, product.id), {
      stock: product.stock + sale.quantity
    });
  }
  await deleteDoc(doc(db, `users/${currentUser.uid}/sales`, saleId));
}

function setupSalesForm() {
  const dateInput = document.getElementById('saleDate');
  if (dateInput) dateInput.value = todayStr();
  
  const prodSelect = document.getElementById('saleProductSelect');
  if (prodSelect) prodSelect.addEventListener('change', updateSaleTotal);
  
  const qtyInput = document.getElementById('saleQuantity');
  if (qtyInput) qtyInput.addEventListener('input', updateSaleTotal);

  const saleForm = document.getElementById('saleForm');
  if (saleForm) {
    saleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const product = getProduct(document.getElementById('saleProductSelect').value);
      const quantity = Number(document.getElementById('saleQuantity').value);
      
      if (!product) { alert('Add a product first.'); return; }
      if (quantity > product.stock && !confirm(`Only ${product.stock} in stock. Continue?`)) return;

      const saleData = { 
        productId: product.id, 
        productName: product.name, 
        quantity, 
        unitPrice: product.price, 
        unitCost: product.cost, 
        total: product.price * quantity, 
        date: document.getElementById('saleDate').value 
      };

      try {
        await addDoc(collection(db, `users/${currentUser.uid}/sales`), saleData);
        await updateDoc(doc(db, `users/${currentUser.uid}/products`, product.id), {
          stock: Math.max(0, product.stock - quantity)
        });
        
        // Reset form
        e.target.reset(); 
        document.getElementById('saleDate').value = todayStr(); 
        document.getElementById('saleQuantity').value = 1;
        updateSaleTotal();
        
        // FIX: Jump to dashboard after recording
        switchPage('dashboard', 'dashboard');
        
      } catch (err) {
        console.error("Error recording sale:", err);
        alert("Failed to record sale.");
      }
    });
  }
}

/* ============================================
   EXPENSES
   ============================================ */

function renderRecentExpenses() {
  const container = document.getElementById('recentExpensesList');
  if (!container) return;
  const sorted = [...state.expenses].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state">No expenses logged yet.</div>`;
    return;
  }
  container.innerHTML = sorted.slice(0, 15).map(x => `
    <div class="list-row">
      <div>
        <div class="list-row-title">${escapeHtml(x.description)}</div>
        <div class="list-row-sub">${formatDateShort(x.date)}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="list-row-value">${peso(x.amount)}</div>
        <button onclick="window.deleteExpense('${x.id}')" class="delete-row-btn" style="margin-left: 8px;">Delete</button>
      </div>
    </div>
  `).join('');
}

window.deleteExpense = async function(expenseId) {
  if (!confirm(`Delete this expense?`)) return;
  await deleteDoc(doc(db, `users/${currentUser.uid}/expenses`, expenseId));
}

function setupExpensesForm() {
  const dateInput = document.getElementById('expenseDate');
  if (dateInput) dateInput.value = todayStr();
  
  const expForm = document.getElementById('expenseForm');
  if (expForm) {
    expForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const expenseData = { 
        description: document.getElementById('expenseDescription').value.trim(), 
        amount: Number(document.getElementById('expenseAmount').value), 
        date: document.getElementById('expenseDate').value 
      };
      
      try {
        await addDoc(collection(db, `users/${currentUser.uid}/expenses`), expenseData);
        
        // Reset form
        e.target.reset(); 
        document.getElementById('expenseDate').value = todayStr();
        
        // FIX: Jump to dashboard after recording
        switchPage('dashboard', 'dashboard');
        
      } catch (err) {
        console.error("Error adding expense:", err);
        alert("Failed to add expense.");
      }
    });
  }
}

/* ============================================
   DASHBOARD & REPORTS
   ============================================ */

function renderDashboard() {
  const today = todayStr();
  const now = new Date();
  const todayEarnings = state.sales.filter(s => s.date === today).reduce((sum, s) => sum + s.total, 0);
  const totalStock = state.products.reduce((sum, p) => sum + Number(p.stock), 0);
  const monthExpenses = state.expenses.filter(x => { const d = new Date(x.date + 'T00:00:00'); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((sum, x) => sum + x.amount, 0);

  const el1 = document.getElementById('statTodayEarnings'); if (el1) el1.textContent = peso(todayEarnings);
  const el2 = document.getElementById('statTotalStock'); if (el2) el2.textContent = totalStock;
  const el3 = document.getElementById('statMonthExpenses'); if (el3) el3.textContent = peso(monthExpenses);

  renderLowStockList();
  renderEarningsChart();
}

function renderLowStockList() {
  const container = document.getElementById('lowStockList');
  if (!container) return;
  const low = state.products.filter(p => p.stock <= p.lowStockThreshold).sort((a, b) => a.stock - b.stock);
  container.innerHTML = low.length === 0 ? `<div class="empty-state">Everything's well stocked. 🌿</div>` : low.slice(0, 10).map(p => `<div class="list-row"><div><div class="list-row-title">${escapeHtml(p.name)}</div><div class="list-row-sub">Reorder at ${p.lowStockThreshold}</div></div><div class="list-row-value" style="color: var(--peach-deep);">${p.stock} left</div></div>`).join('');
}

function renderEarningsChart() {
  const canvas = document.getElementById('earningsChartCanvas');
  if (!canvas || typeof Chart === 'undefined') return;
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  const totals = days.map(day => state.sales.filter(s => s.date === day).reduce((sum, s) => sum + s.total, 0));
  const labels = days.map(d => formatDateShort(d));
  if (earningsChart) earningsChart.destroy();
  earningsChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Earnings', data: totals, borderColor: '#7C9473', backgroundColor: 'rgba(124, 148, 115, 0.12)', tension: 0.35, fill: true, pointRadius: 3, pointBackgroundColor: '#7C9473' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => '₱' + v } } } }
  });
}

function getPeriodStartDate() {
  const period = document.getElementById('reportPeriodSelect').value;
  if (period === 'all') return null;
  const d = new Date(); d.setDate(d.getDate() - Number(period)); return d.toISOString().slice(0, 10);
}

function renderReports() {
  const startDate = getPeriodStartDate();
  const salesInPeriod = state.sales.filter(s => !startDate || s.date >= startDate);
  const expensesInPeriod = state.expenses.filter(x => !startDate || x.date >= startDate);
  const revenue = salesInPeriod.reduce((sum, s) => sum + s.total, 0);
  const cogs = salesInPeriod.reduce((sum, s) => sum + (s.unitCost || 0) * s.quantity, 0);
  const expensesTotal = expensesInPeriod.reduce((sum, x) => sum + x.amount, 0);
  const profit = revenue - cogs - expensesTotal;

  const el1 = document.getElementById('reportRevenue'); if (el1) el1.textContent = peso(revenue);
  const el2 = document.getElementById('reportProfit'); if (el2) el2.textContent = peso(profit);
  const el3 = document.getElementById('reportExpenses'); if (el3) el3.textContent = peso(expensesTotal);

  const byProduct = {};
  salesInPeriod.forEach(s => { byProduct[s.productName] = (byProduct[s.productName] || 0) + s.quantity; });
  const topProducts = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const topList = document.getElementById('topProductsList');
  if (topList) {
    topList.innerHTML = topProducts.length ? topProducts.map(([name, qty]) => `<div class="list-row"><div class="list-row-title">${escapeHtml(name)}</div><div class="list-row-value">${qty} sold</div></div>`).join('') : `<div class="empty-state">No sales in this period yet.</div>`;
  }
  const breakdown = document.getElementById('reportBreakdownList');
  if (breakdown) {
    breakdown.innerHTML = `<div class="list-row"><div class="list-row-title">Revenue</div><div class="list-row-value">${peso(revenue)}</div></div><div class="list-row"><div class="list-row-title">Cost of goods sold</div><div class="list-row-value">${peso(cogs)}</div></div><div class="list-row"><div class="list-row-title">Expenses</div><div class="list-row-value">${peso(expensesTotal)}</div></div><div class="list-row"><div class="list-row-title">Net profit</div><div class="list-row-value">${peso(profit)}</div></div>`;
  }
}

function setupReports() {
  const periodSelect = document.getElementById('reportPeriodSelect');
  if (periodSelect) periodSelect.addEventListener('change', renderReports);
}

/* ============================================
   INIT
   ============================================ */

function init() {
  setupNav();
  setupProductForm();
  setupSalesForm();
  setupExpensesForm();
  setupReports();
}

document.addEventListener('DOMContentLoaded', init);
/* ============================================
   EXPORT TO EXCEL (CSV)
   ============================================ */

function downloadCSV(csvContent, fileName) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

const exportBtn = document.getElementById('exportReportsCsvBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    let csv = "CozyBiz Data Export\n\n";
    
    // 1. Export Products
    csv += "PRODUCTS\nName,Category,Stock,Price,Cost\n";
    state.products.forEach(p => {
      csv += `"${p.name}","${p.category}",${p.stock},${p.price},${p.cost}\n`;
    });
    
    // 2. Export Sales
    csv += "\nSALES\nDate,Product,Quantity,Total\n";
    state.sales.forEach(s => {
      csv += `"${s.date}","${s.productName}",${s.quantity},${s.total}\n`;
    });

    // 3. Export Expenses
    csv += "\nEXPENSES\nDate,Description,Amount\n";
    state.expenses.forEach(x => {
      csv += `"${x.date}","${x.description}",${x.amount}\n`;
    });

    // Trigger download
    downloadCSV(csv, `CozyBiz_Data_${todayStr()}.csv`);
  });
}
