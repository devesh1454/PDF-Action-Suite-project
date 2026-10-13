// ── FIREBASE SETUP ────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDptoEwAw703H07ihBb7lNoRB2OUbug8xA",
  authDomain: "cattlecare-register.firebaseapp.com",
  projectId: "cattlecare-register",
  storageBucket: "cattlecare-register.firebasestorage.app",
  messagingSenderId: "882467181127",
  appId: "1:882467181127:web:0b101f73d38faaf56f1762",
  measurementId: "G-WGKZDNVD3E"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── AUTH GUARD & USER INFO ────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not logged in — redirect to login
    window.location.href = "auth/login.html";
    return;
  }

  // Fetch name from Firestore
  let initials = "U";
  let displayName = "User";
  let displayEmail = user.email || "";

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      const first = data.firstName || "";
      const last  = data.lastName  || "";
      displayName = [first, last].filter(Boolean).join(" ") || displayEmail;
      initials = ((first[0] || "") + (last[0] || "")).toUpperCase() || displayEmail[0].toUpperCase();
    }
  } catch (_) {
    // fallback to email initials
    initials = displayEmail[0]?.toUpperCase() || "U";
    displayName = displayEmail;
  }

  // Populate UI
  document.getElementById("avatarEl").textContent    = initials;
  document.getElementById("dropAvatarEl").textContent = initials;
  document.getElementById("dropName").textContent     = displayName;
  document.getElementById("dropEmail").textContent    = displayEmail;
});

// ── DROPDOWN TOGGLE ───────────────────────────────
function toggleDropdown() {
  const dd = document.getElementById("profileDropdown");
  dd.classList.toggle("open");
}

// Close dropdown on outside click
document.addEventListener("click", (e) => {
  const wrap = document.getElementById("profileWrap");
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById("profileDropdown").classList.remove("open");
  }
});

// ── LOGOUT ────────────────────────────────────────
function handleLogout() {
  signOut(auth).then(() => {
    localStorage.removeItem("loggedInUserId");
    window.location.href = "../index.html";
  }).catch((err) => {
    console.error("Logout error:", err);
  });
}

// ── NAVIGATE TO SEARCH ────────────────────────────
function goToSearch() {
  window.location.href = "semantic/semantic-search.html";
}

// Expose to HTML onclick attributes
window.toggleDropdown = toggleDropdown;
window.handleLogout   = handleLogout;
window.goToSearch     = goToSearch;
