import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence error:", err.code));

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// Elements
const form = $("#unifiedLoginForm");
const nameFieldContainer = $("#nameFieldContainer");
const nameInput = $("#loginName");
const emailInput = $("#loginEmail");
const passwordInput = $("#loginPassword");
const roleCards = $$(".role-card");
const errorDisplay = $("#loginError");
const submitBtn = $("#submitLoginBtn");
const toggleModeLink = $("#toggleModeLink");
const toggleModeText = $("#toggleModeText");
const formTitle = $("#formTitle");
const formSubtitle = $("#formSubtitle");
const roleSelectorSection = $("#roleSelectorSection");
const alumniFieldsContainer = $("#alumniFieldsContainer");
const titleInput = $("#loginTitle");
const batchInput = $("#loginBatch");
const designationInput = $("#loginDesignation");
const institutionInput = $("#loginInstitution");
const locationInput = $("#loginLocation");
const phoneInput = $("#loginPhone");
const photoInput = $("#loginPhoto");
const photoPreviewWrap = $("#loginPhotoPreviewWrap");
const photoPreview = $("#loginPhotoPreview");
const bioInput = $("#loginBio");

let currentPhotoBase64 = null;

if (photoInput) {
    photoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                currentPhotoBase64 = evt.target.result;
                if (photoPreview) photoPreview.src = currentPhotoBase64;
                if (photoPreviewWrap) photoPreviewWrap.style.display = "block";
            };
            reader.readAsDataURL(file);
        }
    });
}

// State
let isSignUpMode = false;
let selectedRole = "student"; // Default to student

// Check URL Params for mode and initial role
const urlParams = new URLSearchParams(window.location.search);
const initialRole = urlParams.get("role");
if (initialRole && ["student", "faculty", "alumni", "admin"].includes(initialRole)) {
    selectedRole = initialRole;
    roleCards.forEach(c => {
        if (c.dataset.role === selectedRole) c.classList.add("active");
        else c.classList.remove("active");
    });
}

if (urlParams.get("signup") === "true") {
    isSignUpMode = true;
    updateUIForMode();
}

// Role Selection Logic
roleCards.forEach(card => {
    card.addEventListener("click", () => {
        // Remove active class from all
        roleCards.forEach(c => c.classList.remove("active"));
        // Add to clicked
        card.classList.add("active");
        selectedRole = card.dataset.role;

        if (isSignUpMode && selectedRole === "alumni") {
            if (alumniFieldsContainer) alumniFieldsContainer.classList.remove("hidden");
        } else {
            if (alumniFieldsContainer) alumniFieldsContainer.classList.add("hidden");
        }
    });
});

// Toggle Mode
toggleModeLink.addEventListener("click", (e) => {
    e.preventDefault();
    isSignUpMode = !isSignUpMode;
    updateUIForMode();
});

        function updateUIForMode() {
            if (isSignUpMode) {
                formTitle.textContent = "Create Account";
                formSubtitle.textContent = "Sign up to begin your journey";
                nameFieldContainer.classList.remove("hidden");
                nameInput.required = true;
                submitBtn.innerHTML = "Sign Up &rarr;";
                toggleModeText.innerHTML = `Already have an account? <a href="#" id="toggleModeLink">Sign in</a>`;
                
                // Allow selecting role for sign up too, just default to student
                roleSelectorSection.classList.remove("hidden");

                if (selectedRole === "alumni") {
                    if (alumniFieldsContainer) alumniFieldsContainer.classList.remove("hidden");
                } else {
                    if (alumniFieldsContainer) alumniFieldsContainer.classList.add("hidden");
                }
            } else {
                formTitle.textContent = "Sign In";
                formSubtitle.textContent = "Enter your credentials to continue";
                nameFieldContainer.classList.add("hidden");
                nameInput.required = false;
                if (alumniFieldsContainer) alumniFieldsContainer.classList.add("hidden");
                submitBtn.innerHTML = "Sign In &rarr;";
                toggleModeText.innerHTML = `Don't have an account? <a href="#" id="toggleModeLink">Sign up</a>`;
                roleSelectorSection.classList.remove("hidden");
            }
            
            // Reattach listener since innerHTML replaced it
            $("#toggleModeLink").addEventListener("click", (e) => {
                e.preventDefault();
                isSignUpMode = !isSignUpMode;
                updateUIForMode();
            });
        }

function showError(message) {
    if (!message) {
        errorDisplay.classList.add("hidden");
        errorDisplay.textContent = "";
        return;
    }
    errorDisplay.classList.remove("hidden");
    errorDisplay.textContent = message;
}

function friendlyAuthError(error) {
    const code = error.code || "";
    if (code.includes("user-not-found") || code.includes("invalid-credential")) return "Invalid email or password.";
    if (code.includes("wrong-password")) return "Invalid email or password.";
    if (code.includes("email-already-in-use")) return "This email is already registered. Please log in.";
    if (code.includes("invalid-email")) return "Please enter a valid email address.";
    if (code.includes("weak-password")) return "Password must be at least 6 characters long.";
    if (code.includes("too-many-requests")) return "Too many failed attempts. Try again later.";
    return "Authentication failed: " + (error.message || code || "Unknown error");
}

// Form Submission
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();
    
    if (isSignUpMode && !name) {
        showError("Full Name is required for registration.");
        return;
    }
    
    if (password.length < 6) {
        showError("Password must be at least 6 characters.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";

    try {
        let userData = null;
        if (isSignUpMode) {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            const finalRole = email.toLowerCase() === "admin@msaukkuda.com" ? "admin" : selectedRole;

            const titleVal = titleInput ? titleInput.value.trim() : "";
            const batchVal = batchInput ? batchInput.value.trim() : "";
            const desigVal = designationInput ? designationInput.value.trim() : "";
            const instVal = institutionInput ? institutionInput.value.trim() : "";
            const locVal = locationInput ? locationInput.value.trim() : "";
            const phoneVal = phoneInput ? phoneInput.value.trim() : "";
            const bioVal = bioInput ? bioInput.value.trim() : "";

            userData = {
                uid: userCred.user.uid,
                email,
                fullName: name,
                role: finalRole,
                title: titleVal,
                batch: batchVal,
                designation: desigVal,
                institution: instVal,
                location: locVal,
                phone: phoneVal,
                bio: bioVal,
                status: (finalRole === "admin" || finalRole === "alumni") ? "approved" : "unsubmitted",
                createdAt: new Date().toISOString()
            };
            if (currentPhotoBase64) userData.url = currentPhotoBase64;

            await setDoc(doc(db, "users", userCred.user.uid), userData);

            if (finalRole === "alumni") {
                const alumniPayload = {
                    name: name,
                    title: titleVal || "Fazil Muhyissunnah",
                    batch: batchVal || "Graduate Scholar",
                    designation: desigVal,
                    institution: instVal,
                    location: locVal,
                    whatsapp: phoneVal,
                    phone: phoneVal,
                    bio: bioVal,
                    email: email,
                    uploadedBy: userCred.user.uid,
                    createdAt: new Date().toISOString()
                };
                if (currentPhotoBase64) alumniPayload.url = currentPhotoBase64;

                await setDoc(doc(db, "alumni", userCred.user.uid), alumniPayload);
            }
        } else {
            const userCred = await signInWithEmailAndPassword(auth, email, password);
            const userSnap = await getDoc(doc(db, "users", userCred.user.uid));
            
            if (userSnap.exists()) {
                userData = userSnap.data();
            }
        }

        submitBtn.textContent = "Opening Portal...";
        
        // Determine redirect target
        const targetRole = userData ? userData.role : selectedRole;
        
        let targetUrl = "student.html";
        if (targetRole === "admin") targetUrl = "admin.html";
        else if (targetRole === "faculty") targetUrl = "teacher.html";
        else if (targetRole === "alumni") targetUrl = "alumni.html";
        
        // If they just signed up, append mode=register so student portal knows to open the form
        if (isSignUpMode && targetRole === "student") {
            targetUrl += "?mode=register";
        }
        
        window.location.href = targetUrl;
        
    } catch (error) {
        showError(friendlyAuthError(error));
        submitBtn.disabled = false;
        submitBtn.textContent = isSignUpMode ? "Sign Up \u2192" : "Sign In \u2192";
    }
});

// Auto-redirect if already logged in
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
            const role = userSnap.data().role;
            if (role === "admin") window.location.href = "admin.html";
            else if (role === "faculty") window.location.href = "teacher.html";
            else if (role === "alumni") window.location.href = "alumni.html";
            else {
                 if (urlParams.get("signup") === "true") window.location.href = "student.html?mode=register";
                 else window.location.href = "student.html";
            }
        }
    }
});
