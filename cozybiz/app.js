/* ============================================
   CozyBiz — app.js (COMPLETE FIXED CLOUD VERSION)
   ============================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  onSnapshot,
  increment 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
function formatDateShort(dateStr) { 
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); 
}
function getProduct(id) { return state.products.find(p => p.id === id); }
function escapeHtml(str) { 
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&")
    .replace(//g, ">")
    .replace(/"/g, """)
    .replace(/'/g, "'");
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

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

document.getElementById('forgotPasswordLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    document.getElementById('loginError').textContent = "Enter your email above first, then click 'Forgot password?'";
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    document.getElementById('loginError').style.color = 'var(--sage-deep)';
    document.getElementById('loginError').textContent = "Reset link sent! Check your inbox.";
  } catch (error) {
    document.getElementById('loginError').style.color = '';
    document.getElementById('loginError').textContent = "Couldn't send reset email. Check the address and try again.";
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  signOut(auth);
});

/* ---------- REAL-TIME DATA SYNC ---------- */

function setupRealtimeListeners() {
  if (!currentUser) return;

  if (unsubscribeProducts) unsubscribeProducts();
  if (unsubscribeSales) unsubscribeSales();
  if (unsubscribeExpenses) unsubscribeExpenses();

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
    const pCat = (p.category || '').toLowerCase();
    const matchesCat = category === 'all' || pCat === category || (category === 'other' && !['food','drinks','crafts','clothing'].includes(pCat));
    return (!search || p.name.toLowerCase().includes(search)) && matchesCat;
  });

  if (rows.length === 0) {
    tbody.innerHTML = `
