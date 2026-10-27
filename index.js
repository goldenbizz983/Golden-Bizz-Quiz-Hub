import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

// ===== Find all six screens =====
const screens = {
  login: document.getElementById("login-screen"),
  register: document.getElementById("register-screen"),
  home: document.getElementById("home-screen"),
  instructions: document.getElementById("instructions-screen"),
  quiz: document.getElementById("quiz-screen"),
  results: document.getElementById("results-screen")
};

// Screens that need a signed-in user
const protectedScreens = ["home", "instructions", "quiz", "results"];

// ===== The stagehand: show one screen, hide the rest =====
function showScreen(name) {
  // Guard: a signed-out person is sent to Login instead
  if (protectedScreens.includes(name) && !auth.currentUser) {
    name = "login";
  }

  Object.values(screens).forEach(function (screen) {
    screen.hidden = true;
  });
  screens[name].hidden = false;
}

// ===== Switch between Login and Register =====
document.getElementById("go-to-register").addEventListener("click", function () {
  showScreen("register");
});

document.getElementById("go-to-login").addEventListener("click", function () {
  showScreen("login");
});

// ===== Turn Firebase error codes into friendly sentences =====
function getFriendlyError(error) {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Your password is too weak. Use at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Wrong email or password. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your internet and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window was closed before finishing. Please try again.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
    case "auth/unauthorized-domain":
      return "This website is not allowed to use Google sign-in yet.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not turned on yet.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email. Log in with your email and password instead.";
    case "permission-denied":
      return "Your account was created, but we could not save your profile. Please contact support.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// ===== Get the user's saved name from Firestore =====
async function getUserName(user) {
  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (snapshot.exists()) {
      return snapshot.data().displayName;
    }
  } catch (error) {
    console.error("Could not read the profile:", error);
  }
  return user.displayName || user.email;
}

// ===== The homepage: load the quizzes from Firestore =====
const quizList = document.getElementById("quiz-list");
const quizLoading = document.getElementById("quiz-loading");
const emptyQuizzes = document.getElementById("empty-quizzes");

// Remembers which quiz the user picked
let selectedQuiz = null;

// Build one quiz card (using the quiz's category for the class names)
function createQuizCard(quiz) {
  const key = quiz.category.toLowerCase();

  const card = document.createElement("article");
  card.className = "home-" + key + "-card";

  const title = document.createElement("h2");
  title.className = "home-" + key + "-title";
  title.textContent = quiz.title;

  const description = document.createElement("p");
  description.className = "home-" + key + "-description";
  description.textContent = quiz.description;

  const count = document.createElement("p");
  count.className = "home-" + key + "-count";
  count.textContent = quiz.questionCount + " questions";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "home-" + key + "-start-button";
  button.textContent = "Start quiz";
  button.addEventListener("click", function () {
    openInstructions(quiz);
  });

  card.append(title, description, count, button);
  return card;
}

async function loadQuizzes() {
  quizList.innerHTML = "";
  emptyQuizzes.hidden = true;
  quizLoading.textContent = "Loading quizzes...";
  quizLoading.hidden = false;

  try {
    const quizQuery = query(collection(db, "quizzes"), where("active", "==", true));
    const snapshot = await getDocs(quizQuery);

    quizLoading.hidden = true;

    if (snapshot.empty) {
      emptyQuizzes.hidden = false;
      return;
    }

    snapshot.forEach(function (quizDoc) {
      const quiz = { id: quizDoc.id, ...quizDoc.data() };
      quizList.appendChild(createQuizCard(quiz));
    });
  } catch (error) {
    console.error("Could not load quizzes:", error);
    quizLoading.textContent = "Could not load the quizzes. Check your internet and try again.";
  }
}

// ===== The instructions screen =====
function openInstructions(quiz) {
  selectedQuiz = quiz;
  document.getElementById("instructions-title").textContent = quiz.title;
  document.getElementById("instructions-question-count").textContent = quiz.questionCount;
  document.getElementById("instructions-error").textContent = "";
  showScreen("instructions");
}

document.getElementById("instructions-back-button").addEventListener("click", function () {
  showScreen("home");
});

// ===== Taking the quiz =====
const beginButton = document.getElementById("begin-quiz-button");
const instructionsError = document.getElementById("instructions-error");

const quizTitle = document.getElementById("quiz-title");
const quizCurrentNumber = document.getElementById("quiz-current-number");
const quizTotalNumber = document.getElementById("quiz-total-number");
const quizProgressTrack = document.getElementById("quiz-progress-track");
const quizProgressFill = document.getElementById("quiz-progress-fill");
const quizQuestionText = document.getElementById("quiz-question-text");
const quizForm = document.getElementById("quiz-form");
const quizPreviousButton = document.getElementById("quiz-previous-button");
const quizNextButton = document.getElementById("quiz-next-button");
const quizSubmitButton = document.getElementById("quiz-submit-button");

// The four radio buttons and the four pieces of option text, in order A, B, C, D
const optionInputs = [
  document.getElementById("quiz-option-a"),
  document.getElementById("quiz-option-b"),
  document.getElementById("quiz-option-c"),
  document.getElementById("quiz-option-d")
];

const optionTexts = [
  document.getElementById("quiz-option-a-text"),
  document.getElementById("quiz-option-b-text"),
  document.getElementById("quiz-option-c-text"),
  document.getElementById("quiz-option-d-text")
];

let questions = [];     // the questions of the chosen quiz
let currentIndex = 0;   // which question we are on (0 is the first)
let answers = [];       // the answer sheet: answers[0] is the choice for question 1

// Fetch the questions of one quiz and put them in order
async function loadQuestions(quizId) {
  const questionQuery = query(collection(db, "questions"), where("quizId", "==", quizId));
  const snapshot = await getDocs(questionQuery);

  const list = [];
  snapshot.forEach(function (questionDoc) {
    list.push({ id: questionDoc.id, ...questionDoc.data() });
  });

  list.sort(function (a, b) {
    return a.order - b.order;
  });

  return list;
}

// Show the current question on the screen
function renderQuestion() {
  const question = questions[currentIndex];

  quizQuestionText.textContent = question.text;

  for (let i = 0; i < 4; i++) {
    optionTexts[i].textContent = question.options[i];
    optionInputs[i].checked = answers[currentIndex] === i;
  }

  // Progress text and bar
  const total = questions.length;
  const percent = Math.round(((currentIndex + 1) / total) * 100);
  quizCurrentNumber.textContent = currentIndex + 1;
  quizTotalNumber.textContent = total;
  quizProgressFill.style.width = percent + "%";
  quizProgressTrack.setAttribute("aria-valuenow", percent);

  // Which buttons to show
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;
  quizPreviousButton.hidden = isFirst;
  quizNextButton.hidden = isLast;
  quizSubmitButton.hidden = !isLast;
}

// Begin quiz: load the questions, then show the first one
beginButton.addEventListener("click", async function () {
  instructionsError.textContent = "";
  beginButton.disabled = true;
  beginButton.textContent = "Loading questions...";

  try {
    const loaded = await loadQuestions(selectedQuiz.id);

    if (loaded.length === 0) {
      instructionsError.textContent = "This quiz has no questions yet.";
      return;
    }

    // Make sure every question is complete
    const badQuestion = loaded.find(function (q) {
      return !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctIndex !== "number";
    });

    if (badQuestion) {
      console.error("Problem with this question:", badQuestion.id, badQuestion);
      instructionsError.textContent = "One question in this quiz has a problem. Please tell your teacher.";
      return;
    }

    questions = loaded;
    answers = new Array(questions.length).fill(null);
    currentIndex = 0;

    quizTitle.textContent = selectedQuiz.title;
    renderQuestion();
    showScreen("quiz");
  } catch (error) {
    console.error("Could not load the questions:", error);
    instructionsError.textContent = "Could not load the questions. Check your internet and try again.";
  } finally {
    beginButton.disabled = false;
    beginButton.textContent = "Begin quiz";
  }
});

// Write the choice on the answer sheet whenever the user picks an option
optionInputs.forEach(function (input) {
  input.addEventListener("change", function () {
    answers[currentIndex] = Number(input.value);
  });
});

// Next and Previous
quizNextButton.addEventListener("click", function () {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderQuestion();
  }
});

quizPreviousButton.addEventListener("click", function () {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
});

// The quiz form must never reload the page
quizForm.addEventListener("submit", function (event) {
  event.preventDefault();
});

// ===== Submit the quiz =====
const submitDialog = document.getElementById("submit-dialog");
const submitAnsweredCount = document.getElementById("submit-answered-count");
const submitTotalCount = document.getElementById("submit-total-count");
const submitDialogWarning = document.getElementById("submit-dialog-warning");
const submitCancelButton = document.getElementById("submit-cancel-button");
const submitConfirmButton = document.getElementById("submit-confirm-button");

const resultsScore = document.getElementById("results-score");
const resultsTotal = document.getElementById("results-total");
const resultsPercentage = document.getElementById("results-percentage");
const resultsFeedback = document.getElementById("results-feedback");
const resultsRetakeButton = document.getElementById("results-retake-button");
const resultsHomeButton = document.getElementById("results-home-button");
const resultsSaveStatus = document.getElementById("results-save-status");

// Save one finished attempt in the records book
async function saveAttempt(score, total, percent) {
  resultsSaveStatus.textContent = "Saving your result...";

  try {
    await addDoc(collection(db, "quizAttempts"), {
      userId: auth.currentUser.uid,
      quizId: selectedQuiz.id,
      quizTitle: selectedQuiz.title,
      score: score,
      totalQuestions: total,
      percentage: percent,
      completedAt: serverTimestamp()
    });
    resultsSaveStatus.textContent = "Your result has been saved.";
  } catch (error) {
    console.error("Could not save the result:", error);
    resultsSaveStatus.textContent = "We could not save this result, but your score is shown above.";
  }
}

// How many questions have an answer on the answer sheet
function countAnswered() {
  return answers.filter(function (answer) {
    return answer !== null;
  }).length;
}

// The marker: count how many answers match the correct ones
function calculateScore() {
  let score = 0;

  questions.forEach(function (question, index) {
    if (answers[index] === question.correctIndex) {
      score++;
    }
  });

  return score;
}

// A short comment for each score range
function getFeedback(percent) {
  if (percent === 100) {
    return "Perfect score! Outstanding work.";
  }
  if (percent >= 80) {
    return "Excellent work! You really know this topic.";
  }
  if (percent >= 60) {
    return "Good job! Keep practicing.";
  }
  if (percent >= 40) {
    return "Not bad, but there is room to improve. Try again.";
  }
  return "Keep learning and try again. You can do it!";
}

// Step 1: pressing Submit opens the pop-up
quizSubmitButton.addEventListener("click", function () {
  const answered = countAnswered();

  submitAnsweredCount.textContent = answered;
  submitTotalCount.textContent = questions.length;
  submitDialogWarning.hidden = answered === questions.length;

  submitDialog.showModal();
});

// Step 2a: "Keep answering" closes the pop-up
submitCancelButton.addEventListener("click", function () {
  submitDialog.close();
});

// Step 2b: "Yes, submit" marks the quiz and shows the results
submitConfirmButton.addEventListener("click", function () {
  submitDialog.close();

  const total = questions.length;
  const score = calculateScore();
  const percent = Math.round((score / total) * 100);

  resultsScore.textContent = score;
  resultsTotal.textContent = total;
  resultsPercentage.textContent = percent + "%";
  resultsFeedback.textContent = getFeedback(percent);

  showScreen("results");
  saveAttempt(score, total, percent);
});

// Retake the same quiz with a fresh answer sheet
resultsRetakeButton.addEventListener("click", function () {
  answers = new Array(questions.length).fill(null);
  currentIndex = 0;
  renderQuestion();
  showScreen("quiz");
});

// Back to the homepage
resultsHomeButton.addEventListener("click", function () {
  showScreen("home");
});

// ===== Register a new user =====
const registerForm = document.getElementById("register-form");
const registerError = document.getElementById("register-error");
const registerButton = document.getElementById("register-button");

// While registering or signing in with Google, the door guard waits
let isRegistering = false;
let isGoogleSigningIn = false;

registerForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  registerError.textContent = "";

  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  // 1. Check the form before talking to Firebase
  if (name.length < 2) {
    registerError.textContent = "Please enter your full name (at least 2 letters).";
    return;
  }
  if (email === "") {
    registerError.textContent = "Please enter your email address.";
    return;
  }
  if (password.length < 6) {
    registerError.textContent = "Your password must be at least 6 characters.";
    return;
  }

  // 2. Show that we are working
  registerButton.disabled = true;
  registerButton.textContent = "Creating account...";
  isRegistering = true;

  try {
    // 3. Create the account in Firebase Authentication
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    // 4. Save the profile in Firestore, using the user's UID as the document name
    await setDoc(doc(db, "users", credential.user.uid), {
      displayName: name,
      email: email,
      createdAt: serverTimestamp()
    });

    // 5. Go to the homepage
    document.getElementById("home-user-name").textContent = name;
    registerForm.reset();
    showScreen("home");
    loadQuizzes();
  } catch (error) {
    registerError.textContent = getFriendlyError(error);
  } finally {
    isRegistering = false;
    registerButton.disabled = false;
    registerButton.textContent = "Create account";
  }
});

// ===== Log in an existing user =====
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginButton = document.getElementById("login-button");

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  loginError.textContent = "";

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (email === "") {
    loginError.textContent = "Please enter your email address.";
    return;
  }
  if (password === "") {
    loginError.textContent = "Please enter your password.";
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
    // The door guard (onAuthStateChanged below) will show the homepage
  } catch (error) {
    loginError.textContent = getFriendlyError(error);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});

// ===== Sign in with Google =====
const googleProvider = new GoogleAuthProvider();
const loginGoogleButton = document.getElementById("login-google-button");
const registerGoogleButton = document.getElementById("register-google-button");

async function signInWithGoogle(errorElement, button) {
  errorElement.textContent = "";
  button.disabled = true;
  isGoogleSigningIn = true;

  try {
    // 1. Open Google's window and wait for the user to choose an account
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // 2. Does this person already have a profile in our records?
    const profileRef = doc(db, "users", user.uid);
    const profileSnapshot = await getDoc(profileRef);

    let name;
    if (profileSnapshot.exists()) {
      name = profileSnapshot.data().displayName;
    } else {
      // First time with Google: create their profile
      name = user.displayName || user.email;
      await setDoc(profileRef, {
        displayName: name,
        email: user.email,
        createdAt: serverTimestamp()
      });
    }

    // 3. Go to the homepage
    document.getElementById("home-user-name").textContent = name;
    showScreen("home");
    loadQuizzes();
  } catch (error) {
    console.error("Google sign-in problem:", error);
    errorElement.textContent = getFriendlyError(error);
  } finally {
    isGoogleSigningIn = false;
    button.disabled = false;
  }
}

loginGoogleButton.addEventListener("click", function () {
  signInWithGoogle(loginError, loginGoogleButton);
});

registerGoogleButton.addEventListener("click", function () {
  signInWithGoogle(registerError, registerGoogleButton);
});

// ===== Log out =====
document.getElementById("logout-button").addEventListener("click", async function () {
  try {
    await signOut(auth);
    // The door guard will show the Login screen
  } catch (error) {
    console.error("Could not log out:", error);
  }
});

// ===== The door guard: runs on page load and every time sign-in changes =====
onAuthStateChanged(auth, async function (user) {
  if (isRegistering || isGoogleSigningIn) {
    return;
  }

  if (user) {
    document.getElementById("home-user-name").textContent = await getUserName(user);
    showScreen("home");
    loadQuizzes();
  } else {
    showScreen("login");
  }
});