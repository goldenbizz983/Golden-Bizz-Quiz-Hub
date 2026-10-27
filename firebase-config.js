// ===== Firebase setup for QuizHub =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5WwwAsyGb6AEHChfBu2Xd6kz0oQmWLVc",
  authDomain: "quizhub-10d04.firebaseapp.com",
  projectId: "quizhub-10d04",
  storageBucket: "quizhub-10d04.firebasestorage.app",
  messagingSenderId: "917079322856",
  appId: "1:917079322856:web:166bc156027eb26139195d"
};

// Start Firebase and open the two lines we need
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Share them with the other files
export { app, auth, db };