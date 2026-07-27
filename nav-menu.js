import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function initToggleMenu() {
    const loginMenuToggleBtn = document.getElementById("loginMenuToggleBtn");
    const loginDropdownMenu = document.getElementById("loginDropdownMenu");
    const closeBtn = document.getElementById("closeLoginDrawerBtn") || document.getElementById("closeDrawerBtn");

    if (loginMenuToggleBtn && loginDropdownMenu) {
        // Direct click handler to ensure reliable toggling
        loginMenuToggleBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            loginDropdownMenu.classList.toggle("hidden");
        };

        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.preventDefault();
                loginDropdownMenu.classList.add("hidden");
            };
        }

        document.addEventListener("click", (e) => {
            if (loginDropdownMenu && 
                !loginDropdownMenu.classList.contains("hidden") && 
                !loginDropdownMenu.contains(e.target) && 
                !loginMenuToggleBtn.contains(e.target)) {
                loginDropdownMenu.classList.add("hidden");
            }
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToggleMenu);
} else {
    initToggleMenu();
}

// Dynamic auth state updates for dropdown menu
onAuthStateChanged(auth, async (user) => {
    const loginDropdownMenu = document.getElementById("loginDropdownMenu");
    const loginMenuToggleBtn = document.getElementById("loginMenuToggleBtn");

    if (!loginDropdownMenu) return;

    if (loginMenuToggleBtn) {
        loginMenuToggleBtn.classList.remove("hidden");
    }

    const links = Array.from(loginDropdownMenu.querySelectorAll("a"));
    
    // Find Login link (href contains login.html, but not signup=true)
    const loginLink = links.find(a => {
        const href = a.getAttribute("href") || "";
        return href.includes("login.html") && !href.includes("signup=true");
    }) || loginDropdownMenu.querySelector("#dropdownLoginBtn");

    // Find Signup link
    const signupLink = links.find(a => {
        const href = a.getAttribute("href") || "";
        return href.includes("signup=true");
    }) || loginDropdownMenu.querySelector("#dropdownSignupBtn");

    if (!user) {
        // User is NOT logged in -> Show "Login" and "New Registration"
        if (loginLink) {
            loginLink.setAttribute("href", "login.html");
            loginLink.style.cursor = "pointer";
            loginLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                <span>Login</span>
            `;
            loginLink.onclick = null;
        }
        if (signupLink) {
            signupLink.setAttribute("href", "login.html?signup=true");
            signupLink.style.display = "";
            signupLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>New Registration</span>
            `;
            signupLink.onclick = null;
        }
    } else {
        // User IS logged in -> Turn "Login" into "Log Out"
        if (loginLink) {
            loginLink.removeAttribute("href");
            loginLink.style.cursor = "pointer";
            loginLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span style="color: var(--danger, #ef4444); font-weight: 600;">Log Out</span>
            `;
            loginLink.onclick = (e) => {
                e.preventDefault();
                signOut(auth).then(() => {
                    window.location.reload();
                }).catch(err => console.error("Logout error:", err));
            };
        }

        if (signupLink) {
            let targetPage = "student.html";
            try {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) {
                    const role = snap.data().role;
                    if (role === "admin") targetPage = "admin.html";
                    else if (role === "faculty") targetPage = "teacher.html";
                }
            } catch (e) {
                console.warn("User role fetch error:", e);
            }
            signupLink.setAttribute("href", targetPage);
            signupLink.style.display = "";
            signupLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span>My Dashboard</span>
            `;
            signupLink.onclick = null;
        }
    }
});
