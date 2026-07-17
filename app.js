import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, enableMultiTabIndexedDbPersistence, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence error:", err.code));

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const statEnrollment = $("#statEnrollment");
const statInstitutions = $("#statInstitutions");
const statFaculty = $("#statFaculty");
const authModal = $("#authModal");
const loginMenuToggleBtn = $("#loginMenuToggleBtn");
const loginDropdownMenu = $("#loginDropdownMenu");
const dropStudentBtn = $("#dropStudentBtn");
const dropFacultyBtn = $("#dropFacultyBtn");
const heroLoginBtn = $("#heroLoginBtn");
const closeAuthBtn = $("#closeAuthBtn");
const navLogoutBtn = $("#navLogoutBtn");
const navAdminBtn = $("#navAdminBtn");
const themeToggleBtn = $("#themeToggleBtn");
const themeToggleLabel = $("#themeToggleLabel");
const installAppBtn = $("#installAppBtn");
const studentCard = $("#studentCard");
const facultyCard = $("#facultyCard");
const mobileStudentLink = $("#mobileStudentLink");
const mobileFacultyLink = $("#mobileFacultyLink");

const tabSignIn = $("#tabSignIn");
const tabSignUp = $("#tabSignUp");
const roleStudent = $("#roleStudent");
const roleFaculty = $("#roleFaculty");
const roleSelector = $("#roleSelector");
const nameFieldContainer = $("#nameField");
const authTitle = $("#authTitle");
const authSubtitle = $("#authSubtitle");
const authSubmitBtn = $("#authSubmitBtn");
const authError = $("#authError");
const authForm = $("#authForm");
const authName = $("#authName");
const authEmail = $("#authEmail");
const authPassword = $("#authPassword");
const passwordToggleBtn = $("#passwordToggleBtn");
const passwordStrength = $("#passwordStrength"); // legacy
const passwordStrengthContainer = $("#passwordStrengthContainer");
const strengthBar1 = $("#strengthBar1");
const strengthBar2 = $("#strengthBar2");
const strengthBar3 = $("#strengthBar3");
const strengthBar4 = $("#strengthBar4");
const strengthText = $("#strengthText");
const forgotPasswordLink = $("#forgotPasswordLink");

let isSignUpMode = false;
let selectedRole = localStorage.getItem("msaukkuda:lastRole") || "student";
let userDocUnsubscribe = null;
let deferredInstallPrompt = null;
const pwaModal = $("#pwaModal");
const closePwaBtn = $("#closePwaBtn");
const mobileInstallBtn = $("#mobileInstallBtn");
const pwaAndroidInst = $("#pwaAndroidInst");
const pwaIosInst = $("#pwaIosInst");
const pwaGenericInst = $("#pwaGenericInst");
const pwaInstallActionBtn = $("#pwaInstallActionBtn");

function setText(node, text) {
    if (node) node.textContent = text;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

function animateStat(node, nextValue) {
    if (!node) return;
    node.classList.remove("skeleton");
    const next = Number(nextValue) || 0;
    const previous = Number(node.dataset.value || node.textContent.replace(/\D/g, "")) || 0;
    node.dataset.value = String(next);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || previous === next) {
        node.textContent = formatNumber(next);
        return;
    }

    const start = performance.now();
    const duration = 700;

    const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(previous + (next - previous) * eased);
        node.textContent = formatNumber(current);
        if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

function isStudentApplication(data) {
    if (!data || (data.role && data.role !== "student")) return false;
    const status = String(data.status || "").trim().toLowerCase();
    return Boolean(data.parentUid || data.campus || data.campusId || ["pending", "admitted", "rejected"].includes(status));
}

function loadPublicStats() {
    if (!statEnrollment || !statInstitutions || !statFaculty) return;

    onSnapshot(collection(db, "users"), (snap) => {
        let students = 0;
        let faculty = 0;

        snap.forEach((entry) => {
            const data = entry.data();
            if (isStudentApplication(data)) students += 1;
            if (data.role === "faculty") faculty += 1;
        });

        animateStat(statEnrollment, students);
        animateStat(statFaculty, faculty);
    }, (error) => {
        console.warn("Unable to load public user stats:", error);
    });

    onSnapshot(collection(db, "institutions"), (snap) => {
        animateStat(statInstitutions, snap.size);
    }, (error) => {
        console.warn("Unable to load institution stats:", error);
    });

    const banner = document.getElementById('globalAnnouncementBanner');
    const textEl = document.getElementById('globalAnnouncementText');
    if (banner && textEl) {
        onSnapshot(doc(db, "settings", "announcements"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().active && docSnap.data().text) {
                textEl.innerHTML = docSnap.data().text;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        });
        
        onSnapshot(doc(db, 'settings', 'liveStream'), (docSnap) => {
            if (docSnap.exists() && docSnap.data().isLive) {
                if (!banner.classList.contains('hidden')) {
                    textEl.innerHTML += ` <span style="margin: 0 10px;">|</span> <a href="live.html" style="color:var(--bg); background:var(--primary); padding:2px 8px; border-radius:4px; text-decoration:none; font-weight:bold; font-size:0.85rem;"><span style="display:inline-block; width:6px; height:6px; background:#ef4444; border-radius:50%; margin-right:4px; animation: pulseLogo 2s infinite;"></span> LIVE NOW</a>`;
                } else {
                    textEl.innerHTML = `<a href="live.html" style="color:var(--bg); background:var(--primary); padding:2px 8px; border-radius:4px; text-decoration:none; font-weight:bold; font-size:0.85rem;"><span style="display:inline-block; width:6px; height:6px; background:#ef4444; border-radius:50%; margin-right:4px; animation: pulseLogo 2s infinite;"></span> LIVE NOW: ${docSnap.data().title || 'Special Event'}</a>`;
                    banner.classList.remove('hidden');
                }
            }
        });
    }
}

function applyTheme(theme) {
    const nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("msaukkuda:theme", nextTheme);
    setText(themeToggleLabel, nextTheme === "light" ? "Light" : "Dark");
    themeToggleBtn?.setAttribute("aria-pressed", String(nextTheme === "light"));
}

function initTheme() {
    const storedTheme = localStorage.getItem("msaukkuda:theme");
    applyTheme(storedTheme || "dark");

    themeToggleBtn?.addEventListener("click", () => {
        const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
        applyTheme(current === "light" ? "dark" : "light");
    });
}

// Global Toast Utility
window.showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : '⚠'}</span><span class="toast-message">${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);

    // Trigger Confetti on Success
    if(type === 'success' && window.confetti) {
        confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.9 },
            colors: ['#D4AF37', '#1E4620', '#FFFFFF']
        });
    }
};

// Scroll Reveal Observer
document.addEventListener("DOMContentLoaded", () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));

    document.querySelectorAll('.faq-item').forEach((item) => {
        const button = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        if (!button || !answer) return;

        button.addEventListener('click', () => {
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item.open').forEach((openItem) => {
                openItem.classList.remove('open');
                const openButton = openItem.querySelector('.faq-question');
                if (openButton) openButton.setAttribute('aria-expanded', 'false');
            });

            if (!isOpen) {
                item.classList.add('open');
                button.setAttribute('aria-expanded', 'true');
            }
        });
    });
});

function showAuthError(message) {
    if (!authError) return;
    authError.textContent = message;
    authError.classList.remove("hidden");
}

function clearAuthError() {
    if (!authError) return;
    authError.textContent = "";
    authError.classList.add("hidden");
}

function friendlyAuthError(error) {
    const code = error?.code || "";
    const map = {
        "auth/email-already-in-use": "An account already exists with this email. Please sign in instead.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/invalid-credential": "The email or password is not correct.",
        "auth/user-not-found": "No account was found for this email.",
        "auth/wrong-password": "The email or password is not correct.",
        "auth/weak-password": "Use a stronger password with at least 6 characters.",
        "auth/network-request-failed": "Network connection failed. Please check your internet and try again."
    };
    return map[code] || error?.message || "Something went wrong. Please try again.";
}

function updatePasswordStrength() {
    if (!authPassword) return;
    const value = authPassword.value;
    let score = 0;

    if (value.length >= 6) score += 1;
    if (value.length >= 10) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1;

    score = Math.min(score, 4);
    if (passwordStrength) passwordStrength.dataset.score = String(score); // Legacy support if needed

    if (strengthBar1 && strengthBar2 && strengthBar3 && strengthBar4 && strengthText) {
        const colors = ['var(--border-strong)', 'var(--error)', 'var(--warning)', 'var(--success)', 'var(--primary)'];
        const texts = ['', 'Weak', 'Fair', 'Good', 'Strong'];
        
        strengthBar1.style.background = score >= 1 ? colors[score] : colors[0];
        strengthBar2.style.background = score >= 2 ? colors[score] : colors[0];
        strengthBar3.style.background = score >= 3 ? colors[score] : colors[0];
        strengthBar4.style.background = score >= 4 ? colors[score] : colors[0];
        
        strengthText.textContent = texts[score] || 'Weak';
        strengthText.style.color = score >= 1 ? colors[score] : colors[0];
    }
}

function updateAuthUI() {
    if (!authModal) return;
    const fixedRole = authModal.dataset.fixedRole === "true";

    tabSignIn?.classList.toggle("active", !isSignUpMode);
    tabSignUp?.classList.toggle("active", isSignUpMode);
    roleStudent?.classList.toggle("active", selectedRole === "student");
    roleFaculty?.classList.toggle("active", selectedRole === "faculty");
    nameFieldContainer?.classList.toggle("hidden", !isSignUpMode);
    passwordStrengthContainer?.classList.toggle("hidden", !isSignUpMode);
    forgotPasswordLink?.classList.toggle("hidden", isSignUpMode);

    if (authName) authName.required = isSignUpMode;
    if (authPassword) authPassword.autocomplete = isSignUpMode ? "new-password" : "current-password";
    if (roleSelector) roleSelector.classList.toggle("hidden", fixedRole);

    setText(authTitle, isSignUpMode ? "Create Account" : "Welcome Back");
    setText(authSubtitle, fixedRole
        ? `Sign ${isSignUpMode ? "up" : "in"} to your ${selectedRole} portal.`
        : "Select your role to continue.");
    setText(authSubmitBtn, isSignUpMode ? "Create Account" : "Sign In");
    clearAuthError();
    updatePasswordStrength();
}

function setRole(role) {
    selectedRole = role === "faculty" ? "faculty" : "student";
    localStorage.setItem("msaukkuda:lastRole", selectedRole);
    updateAuthUI();
}

// Auth Modal functions removed as they are now handled in login.js

function initPwaInstall() {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        installAppBtn?.classList.remove("hidden");
        // Also show in mobile bar if desired, but we have the download button there always now
    });

    const openPwaModal = () => {
        if (!pwaModal) return;
        pwaModal.classList.add("active");
        pwaModal.setAttribute("aria-hidden", "false");

        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        pwaAndroidInst?.classList.add("hidden");
        pwaIosInst?.classList.add("hidden");
        pwaGenericInst?.classList.add("hidden");

        if (deferredInstallPrompt) {
            pwaAndroidInst?.classList.remove("hidden");
        } else if (isIos) {
            pwaIosInst?.classList.remove("hidden");
        } else {
            pwaGenericInst?.classList.remove("hidden");
        }
    };

    const closePwaModal = () => {
        pwaModal?.classList.remove("active");
        pwaModal?.setAttribute("aria-hidden", "true");
    };

    installAppBtn?.addEventListener("click", () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then(() => {
                deferredInstallPrompt = null;
                installAppBtn.classList.add("hidden");
            });
        } else {
            openPwaModal();
        }
    });

    mobileInstallBtn?.addEventListener("click", openPwaModal);
    closePwaBtn?.addEventListener("click", closePwaModal);
    pwaInstallActionBtn?.addEventListener("click", () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then(() => {
                deferredInstallPrompt = null;
                closePwaModal();
                installAppBtn?.classList.add("hidden");
            });
        }
    });

    pwaModal?.addEventListener("click", (e) => {
        if (e.target === pwaModal) closePwaModal();
    });
}

// form submmission is now handled by login.js

navLogoutBtn?.addEventListener("click", () => signOut(auth).catch(error => {
    console.error("Logout Error:", error);
}));

// Global Magnetic Buttons Effect
document.addEventListener("DOMContentLoaded", () => {
    // Only run on desktop logic
    if (window.matchMedia("(pointer: fine)").matches) {
        document.body.addEventListener('mousemove', (e) => {
            const btns = document.querySelectorAll('.btn-main');
            btns.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                
                // If within 100px of the button center
                if(Math.abs(x) < 100 && Math.abs(y) < 100) {
                    btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
                } else {
                    btn.style.transform = 'translate(0px, 0px)';
                }
            });
        });
    }
    
    // FAB Logic
    const fabContainer = document.getElementById('fabMenu');
    const fabMainBtn = document.getElementById('fabMainBtn');
    
    if(fabContainer && fabMainBtn) {
        fabMainBtn.addEventListener('click', (e) => {
            fabContainer.classList.toggle('active');
            e.stopPropagation();
        });
        
        document.addEventListener('click', (e) => {
            if(!fabContainer.contains(e.target)) {
                fabContainer.classList.remove('active');
            }
        });
        
        fabContainer.querySelectorAll('.fab-action').forEach(action => {
            action.addEventListener('click', () => {
                fabContainer.classList.remove('active');
            });
        });
    }

    // Three dots login menu logic
    if (loginMenuToggleBtn) {
        loginMenuToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            loginDropdownMenu?.classList.toggle("hidden");
        });
        document.addEventListener("click", () => {
            loginDropdownMenu?.classList.add("hidden");
        });
    }
});

onAuthStateChanged(auth, async (user) => {
    if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
    }

    if (!user) {
        loginMenuToggleBtn?.classList.remove("hidden");
        navLogoutBtn?.classList.add("hidden");
        if (heroLoginBtn) {
            heroLoginBtn.textContent = "Enter Dashboard";
            heroLoginBtn.onclick = () => window.location.href = "login.html";
        }
        return;
    }

    loginMenuToggleBtn?.classList.add("hidden");
    navLogoutBtn?.classList.remove("hidden");

    userDocUnsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        const getTarget = () => {
            if (data.role === "admin") return "admin.html";
            if (data.role === "faculty") return "teacher.html";
            return "student.html";
        };

        const redirectToPortal = () => {
            window.location.href = getTarget();
        };

        if (heroLoginBtn) {
            heroLoginBtn.onclick = redirectToPortal;
            heroLoginBtn.textContent = "Enter Portal";
        }
        
        // We removed the automatic redirection from here because it caused delays and overlaps 
        // with the much faster direct redirect in the auth form submission handler.
    }, (error) => {
        console.warn("Unable to load signed-in user profile:", error);
    });
});

initTheme();
initPwaInstall();
initAuthUI();
loadPublicStats();

// ==========================================
// ADVANCED UI/UX SUITE JAVASCRIPT
// ==========================================

// 1. Stacked Toast Notifications ("Sonner" Style)
window.showToast = (message, type = "info") => {
    let container = document.getElementById('toastContainer');
    if(!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
};

// 2. Scroll Reveal Animations (Intersection Observer)
const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if(entry.isIntersecting) {
            entry.target.classList.add('reveal-visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.page-section, .portal-card, .stat-item').forEach(el => {
        el.classList.add('reveal-hidden');
        revealObserver.observe(el);
    });
    
    // 3. 3D Hover Tilt & Spotlight Effects
    document.querySelectorAll('.portal-card, .glass-card, .stat-card, .process-card').forEach(card => {
        card.classList.add('tilt-card');
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // For Spotlight Border
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -5; // Max 5 deg tilt
            const rotateY = ((x - centerX) / centerX) * 5;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
        });
    });

    // 4. Dynamic Island Navbar Scroll
    const navWrapper = document.querySelector('.nav-wrapper');
    if (navWrapper) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navWrapper.classList.add('floating');
            } else {
                navWrapper.classList.remove('floating');
            }
        });
    }
});
