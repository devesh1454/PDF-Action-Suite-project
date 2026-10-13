// ── FIREBASE SETUP ────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, setDoc, doc } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDptoEwAw703H07ihBb7lNoRB2OUbug8xA",
  authDomain: "cattlecare-register.firebaseapp.com",
  projectId: "cattlecare-register",
  storageBucket: "cattlecare-register.firebasestorage.app",
  messagingSenderId: "882467181127",
  appId: "1:882467181127:web:0b101f73d38faaf56f1762",
  measurementId: "G-WGKZDNVD3E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

// ── HELPER: show status message ───────────────────
function setStatus(message, divId) {
  const el = document.getElementById(divId);
  if (!el) return;
  el.textContent = message;
  const isSuccess = message.toLowerCase().includes('success');
  el.className = 'auth-status ' + (isSuccess ? 'success' : 'error');
  el.style.display = 'block';
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 400);
  }, 5000);
}

// ── SIGN UP ───────────────────────────────────────
const signUpBtn = document.getElementById('submitSignUp');
if (signUpBtn) {
  signUpBtn.addEventListener('click', (event) => {
    event.preventDefault();

    const email     = document.getElementById('rEmail').value.trim();
    const password  = document.getElementById('rPassword').value;
    const firstName = document.getElementById('fName').value.trim();
    const lastName  = document.getElementById('lName').value.trim();

    if (!firstName || !lastName || !email || !password) {
      setStatus('Please fill in all fields.', 'signUpMessage'); return;
    }
    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.', 'signUpMessage'); return;
    }

    signUpBtn.disabled = true;
    signUpBtn.textContent = 'Please wait…';

    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        const userData = { email, firstName, lastName };
        const docRef = doc(db, "users", user.uid);
        return setDoc(docRef, userData);
      })
      .then(() => {
        setStatus('Account created successfully!', 'signUpMessage');
        setTimeout(() => { window.location.href = '../semantic-home.html'; }, 1500);
      })
      .catch((error) => {
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Create Account';
        if (error.code === 'auth/email-already-in-use') {
          setStatus('An account with this email already exists.', 'signUpMessage');
        } else {
          setStatus('Unable to create account. Please try again.', 'signUpMessage');
        }
      });
  });
}

// ── SIGN IN ───────────────────────────────────────
const signInBtn = document.getElementById('submitSignIn');
if (signInBtn) {
  signInBtn.addEventListener('click', (event) => {
    event.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      setStatus('Please fill in all fields.', 'signInMessage'); return;
    }

    signInBtn.disabled = true;
    signInBtn.textContent = 'Please wait…';

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        localStorage.setItem('loggedInUserId', user.uid);
        setStatus('Login successful! Redirecting…', 'signInMessage');
        setTimeout(() => { window.location.href = '../semantic-home.html'; }, 1000);
      })
      .catch((error) => {
        signInBtn.disabled = false;
        signInBtn.textContent = 'Log In';
        if (error.code === 'auth/invalid-credential') {
          setStatus('Incorrect email or password.', 'signInMessage');
        } else {
          setStatus('Account does not exist.', 'signInMessage');
        }
      });
  });
}
