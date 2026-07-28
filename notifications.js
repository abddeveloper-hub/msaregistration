import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, onSnapshot, query, orderBy, limit, doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getMessaging, onMessage, isSupported, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let messaging = null;
if (typeof window !== "undefined") {
    isSupported().then((supported) => {
        if (supported) {
            try {
                messaging = getMessaging(app);
                onMessage(messaging, (payload) => {
                    console.log("FCM Foreground message received:", payload);
                    const title = payload.notification?.title || payload.data?.title || "MSA Portal";
                    const body = payload.notification?.body || payload.data?.body || payload.data?.message || "";
                    showToast(title, body, payload.data?.type || "announcement");
                });
            } catch (err) {
                console.warn("FCM messaging initialization notice:", err);
            }
        }
    }).catch(err => console.warn("FCM isSupported check notice:", err));
}

// Automatically register device push token in Firestore for all app installations
export async function registerDeviceForPushNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
        const supported = await isSupported();
        if (!supported) return;

        const messagingInstance = messaging || getMessaging(app);
        if (!messagingInstance) return;

        let swReg = null;
        if ("serviceWorker" in navigator) {
            swReg = await navigator.serviceWorker.ready;
        }

        const currentToken = await getToken(messagingInstance, {
            serviceWorkerRegistration: swReg || undefined
        });

        if (currentToken) {
            const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
            const tokenDocId = currentToken.replace(/[^a-zA-Z0-9]/g, "_").slice(-64);
            const user = auth.currentUser;

            await setDoc(doc(db, "push_tokens", tokenDocId), {
                token: currentToken,
                uid: user ? user.uid : "anonymous",
                platform: navigator.platform || "Web",
                userAgent: navigator.userAgent,
                isInstalledApp: Boolean(isStandalone),
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }
    } catch (err) {
        console.warn("FCM device token registration notice:", err);
    }
}

// Helper function to dispatch a new notification to Firestore
export async function sendAppNotification({ recipient = "all", title, message, body, type = "announcement", link = "#" }) {
    const textMsg = message || body || title;
    const isoNow = new Date().toISOString();
    
    // Always trigger local notification popup on current device
    showToast(title, textMsg, type);

    try {
        await addDoc(collection(db, "notifications"), {
            recipient: recipient || "all",
            title: title,
            message: textMsg,
            body: textMsg,
            type: type, // 'announcement', 'media', 'exam', 'approval', 'system'
            link: link,
            read: false,
            createdAt: isoNow,
            timestamp: isoNow
        });
        return { success: true };
    } catch (err) {
        console.warn("Firestore notification save warning (check Security Rules):", err);
        return { success: false, error: err };
    }
}

export function triggerNativeNotification(title, message) {
    if (!("Notification" in window)) return;

    const text = message || title;
    const header = message ? title : "MSA Portal";
    
    let iconUrl = "icon-192.png";
    try {
        iconUrl = new URL("icon-192.png", window.location.href).href;
    } catch(e) {}

    const fireNotif = () => {
        try {
            const notif = new Notification(header, {
                body: text,
                icon: iconUrl,
                badge: iconUrl,
                vibrate: [300, 100, 300, 100, 300],
                tag: "msa-sys-notif-" + Date.now(),
                renotify: true,
                requireInteraction: false
            });
            notif.onclick = function() {
                try { window.focus(); } catch(e) {}
                this.close();
            };
        } catch (err) {
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(header, {
                        body: text,
                        icon: iconUrl,
                        badge: iconUrl,
                        vibrate: [300, 100, 300, 100, 300],
                        tag: "msa-sys-notif-" + Date.now(),
                        renotify: true,
                        requireInteraction: false,
                        data: { url: './' }
                    });
                }).catch(() => {});
            }
        }
    };

    if (Notification.permission === "granted") {
        fireNotif();
    } else if (Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                fireNotif();
            }
        }).catch(() => {});
    }
}

const KNOWN_TYPES = ['info', 'success', 'error', 'warning', 'media', 'photo', 'video', 'exam', 'approval', 'announcement', 'system'];

// Global Toast Popup Launcher supporting all calling styles
export function showToast(arg1, arg2, arg3) {
    let displayTitle = "Notification";
    let displayMsg = "";
    let type = "info";

    if (arg3 !== undefined) {
        displayTitle = String(arg1 || "Notification");
        displayMsg = String(arg2 || "");
        type = String(arg3 || "info").toLowerCase();
    } else if (arg2 !== undefined) {
        const isArg2Type = KNOWN_TYPES.includes(String(arg2).toLowerCase());
        if (isArg2Type) {
            type = String(arg2).toLowerCase();
            displayTitle = type === "success" ? "Success" : (type === "error" ? "Error" : "Notification");
            displayMsg = String(arg1 || "");
        } else {
            displayTitle = String(arg1 || "Notification");
            displayMsg = String(arg2 || "");
            type = "info";
        }
    } else {
        displayTitle = "Notification";
        displayMsg = String(arg1 || "");
        type = "info";
    }

    let container = document.getElementById("globalToastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "globalToastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    let icon = "🔔";
    if (type === "media" || type === "photo") icon = "📸";
    else if (type === "video") icon = "🎬";
    else if (type === "exam") icon = "📊";
    else if (type === "approval" || type === "success") icon = "✅";
    else if (type === "error") icon = "⚠️";

    const toast = document.createElement("div");
    toast.className = `toast-banner toast-${type}`;
    toast.innerHTML = `
        <span style="font-size:1.3rem;">${icon}</span>
        <div style="flex:1;">
            <div style="font-weight:700; font-size:0.9rem; margin-bottom:0.15rem;">${displayTitle}</div>
            <div style="font-size:0.82rem; opacity:0.9; line-height:1.3;">${displayMsg}</div>
        </div>
    `;

    container.appendChild(toast);

    // Native Web Notification Dispatch
    triggerNativeNotification(displayTitle, displayMsg);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

export async function runNotificationDiagnostic() {
    const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let diagReport = [];

    if (!isHttps) {
        diagReport.push("Insecure HTTP: Browsers block mobile push on http://. Use https://");
    }

    if (!("Notification" in window)) {
        showToast("Diagnostic ❌", "Web Notifications API is not supported in this browser.");
        return { success: false, reason: "API Unsupported" };
    }

    let perm = Notification.permission;
    if (perm === "default") {
        try {
            perm = await Notification.requestPermission();
        } catch(e) {}
    }

    if (perm === "denied") {
        showToast("Permission Denied ❌", "Notifications blocked in browser site settings. Reset in Chrome site settings.");
        return { success: false, reason: "Permission Denied" };
    }

    if (perm !== "granted") {
        showToast("Permission Needed ⚠️", "Please grant notification permission when prompted.");
        return { success: false, reason: "Permission Not Granted" };
    }

    let notifDispatched = false;
    try {
        const notif = new Notification("Live Test Notification 🔔", {
            body: "System notifications are active and working on your device!",
            icon: "./icon-192.png"
        });
        notifDispatched = true;
    } catch(e) {
        console.warn("Direct Notification error:", e);
    }

    if (!notifDispatched && "serviceWorker" in navigator) {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification("Live Test Notification 🔔", {
                body: "System notifications are active and working on your device!",
                icon: "./icon-192.png",
                badge: "./icon-192.png",
                vibrate: [300, 100, 300, 100, 300],
                tag: "msa-diag-" + Date.now(),
                renotify: true,
                requireInteraction: true
            });
            notifDispatched = true;
        } catch(e) {
            console.warn("SW reg.showNotification error:", e);
            diagReport.push("SW Push Error: " + (e.message || e));
        }
    }

    const reportMsg = diagReport.length > 0 
        ? "Notice: " + diagReport.join(" | ") 
        : "System status bar & toast notification triggered successfully!";

    showToast("Diagnostic Check 🔔", reportMsg);
    return { success: true, details: reportMsg };
}

// Global window assignments for non-module usage
if (typeof window !== "undefined") {
    window.sendAppNotification = sendAppNotification;
    window.showToast = showToast;
    window.triggerNativeNotification = triggerNativeNotification;
    window.runNotificationDiagnostic = runNotificationDiagnostic;
    window.testNotification = runNotificationDiagnostic;
}

// DOM Setup & Listener
let currentNotifications = [];
let initialLoadDone = false;

function initNotificationDOM() {
    if (typeof document === "undefined" || !document.body) return;

    // 1. Ensure Toast Container exists
    if (!document.getElementById("globalToastContainer")) {
        const toastBox = document.createElement("div");
        toastBox.id = "globalToastContainer";
        toastBox.className = "toast-container";
        document.body.appendChild(toastBox);
    }

    // 2. Ensure Notification Drawer HTML exists
    if (!document.getElementById("globalNotifDrawer")) {
        const drawer = document.createElement("div");
        drawer.id = "globalNotifDrawer";
        drawer.className = "notif-drawer";
        drawer.innerHTML = `
            <div class="notif-drawer-header">
                <h3>🔔 Notifications</h3>
                <button id="notifClearAllBtn" class="notif-clear-btn">Mark all read</button>
            </div>
            <div id="notifPermissionBanner"></div>
            <div id="notifListContainer" class="notif-list">
                <div style="padding:1.5rem; text-align:center; color:var(--text-dim); font-size:0.85rem;">No notifications yet.</div>
            </div>
        `;
        document.body.appendChild(drawer);

        const clearBtn = document.getElementById("notifClearAllBtn");
        if (clearBtn) {
            clearBtn.addEventListener("click", markAllAsRead);
        }
    }

    // 3. Inject Bell Button & setup Mobile Permission Banners
    injectBellIcon();
    renderPermissionBanner();
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initNotificationDOM);
    } else {
        initNotificationDOM();
    }
}

function renderPermissionBanner() {
    const bannerBox = document.getElementById("notifPermissionBanner");
    if (!bannerBox) return;

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isIOS && !isStandalone) {
        bannerBox.innerHTML = `
            <div style="background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.3); border-radius:10px; margin:0.75rem; padding:0.8rem; font-size:0.82rem; color:var(--text-main);">
                <strong>📱 iPhone Notification Notice:</strong><br>
                To receive live push notifications on iOS, tap the <span style="font-weight:700;">Share</span> button in Safari, select <span style="font-weight:700;">'Add to Home Screen'</span>, then open the app from your Home Screen.
            </div>
        `;
        return;
    }

    if ("Notification" in window && Notification.permission === "default") {
        bannerBox.innerHTML = `
            <div style="background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#ffffff; border-radius:10px; margin:0.75rem; padding:0.85rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem; box-shadow:0 4px 14px rgba(37,99,235,0.35);">
                <div style="font-size:0.83rem; font-weight:600;">🔔 Enable Mobile Notifications</div>
                <button id="enableNotifBtn" style="background:#ffffff; color:#1d4ed8; border:none; padding:6px 12px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; white-space:nowrap;">Enable</button>
            </div>
        `;
        const enableBtn = document.getElementById("enableNotifBtn");
        enableBtn?.addEventListener("click", () => {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    bannerBox.innerHTML = "";
                    showToast("Notifications Enabled 🔔", "You will now receive live mobile push notifications.");
                    registerDeviceForPushNotifications();
                } else if (permission === "denied") {
                    bannerBox.innerHTML = `<div style="padding:0.5rem; font-size:0.8rem; color:var(--text-dim); text-align:center;">Notifications were blocked in browser settings.</div>`;
                }
            });
        });
    } else {
        bannerBox.innerHTML = "";
    }
}

function injectBellIcon() {
    const selectors = [
        ".nav-actions", 
        ".nav-links",
        ".nav-menu", 
        ".portal-header", 
        ".navbar",
        ".sidebar-header",
        ".header-container", 
        ".top-bar",
        ".brand-logo",
        "header"
    ];
    let navMenus = [];
    for (const sel of selectors) {
        const found = document.querySelectorAll(sel);
        if (found && found.length > 0) {
            navMenus = Array.from(found);
            break;
        }
    }
    if (navMenus.length === 0) navMenus = [document.body];

    navMenus.forEach(nav => {
        if (!nav.querySelector(".notif-bell-wrapper") && !document.getElementById("globalNotifBell")) {
            const bellWrap = document.createElement("div");
            bellWrap.className = "notif-bell-wrapper";
            bellWrap.style.cssText = "display:inline-flex; align-items:center; margin-left: auto;";
            bellWrap.innerHTML = `
                <button class="notif-bell-btn" id="globalNotifBell" title="Notifications" aria-label="Notifications">
                    🔔
                    <span class="notif-badge" id="globalNotifBadge" style="display:none;">0</span>
                </button>
            `;
            nav.appendChild(bellWrap);

            const bellBtn = bellWrap.querySelector("#globalNotifBell");
            bellBtn?.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Trigger touch gesture permission request if default
                if ("Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission().then(permission => {
                        if (permission === "granted") {
                            showToast("Notifications Enabled 🔔", "Mobile push notifications are active.");
                            renderPermissionBanner();
                        }
                    });
                }

                const drawer = document.getElementById("globalNotifDrawer");
                if (drawer) {
                    drawer.classList.toggle("open");
                }
            });
        }
    });

    // Close drawer when clicking outside
    document.addEventListener("click", (e) => {
        const drawer = document.getElementById("globalNotifDrawer");
        const bellBtn = document.getElementById("globalNotifBell");
        if (drawer && drawer.classList.contains("open") && !drawer.contains(e.target) && !bellBtn?.contains(e.target)) {
            drawer.classList.remove("open");
        }
    });
}

// Auth State & Realtime Subscription
let unsubscribeNotif = null;

function setupRealtimeListener(user) {
    if (unsubscribeNotif) {
        try { unsubscribeNotif(); } catch(e) {}
    }

    const notifRef = collection(db, "notifications");
    let q;
    try {
        q = query(notifRef, orderBy("createdAt", "desc"), limit(30));
    } catch (e) {
        q = query(notifRef, limit(30));
    }

    unsubscribeNotif = onSnapshot(q, (snapshot) => {
        const listContainer = document.getElementById("notifListContainer");
        const badge = document.getElementById("globalNotifBadge");

        currentNotifications = [];
        let unreadCount = 0;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const isForUser = !data.recipient || data.recipient === "all" || (user && data.recipient === user.uid);
            if (isForUser) {
                const textMsg = data.message || data.body || "";
                const createdTime = data.createdAt || data.timestamp || new Date().toISOString();
                const item = { 
                    id: docSnap.id, 
                    ...data, 
                    message: textMsg, 
                    body: textMsg, 
                    createdAt: createdTime 
                };
                currentNotifications.push(item);
                if (!item.read) unreadCount++;
            }
        });

        // Sort descending by date
        currentNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Trigger toast on new items (after initial load)
        if (initialLoadDone && snapshot.docChanges().length > 0) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const newItem = change.doc.data();
                    const isForUser = !newItem.recipient || newItem.recipient === "all" || (user && newItem.recipient === user.uid);
                    if (isForUser) {
                        const msgText = newItem.message || newItem.body || newItem.title;
                        showToast(newItem.title || "Notification", msgText, newItem.type || "info");
                    }
                }
            });
        }
        initialLoadDone = true;

        // Update Badge
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }

        // Render Drawer List
        if (listContainer) {
            if (currentNotifications.length === 0) {
                listContainer.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-dim); font-size:0.85rem;">No notifications yet.</div>`;
                return;
            }

            listContainer.innerHTML = currentNotifications.map(item => {
                const timeAgo = formatTimeAgo(item.createdAt);
                let icon = "📌";
                if (item.type === "media" || item.type === "photo") icon = "📸";
                if (item.type === "video") icon = "🎬";
                if (item.type === "exam") icon = "📊";
                if (item.type === "approval") icon = "✅";

                return `
                    <a href="${item.link || '#'}" class="notif-item ${item.read ? '' : 'unread'}" data-id="${item.id}">
                        <div class="notif-item-top">
                            <span class="notif-title">${icon} ${item.title}</span>
                            <span class="notif-time">${timeAgo}</span>
                        </div>
                        <p class="notif-msg">${item.message}</p>
                    </a>
                `;
            }).join('');

            // Item click listener to mark read
            listContainer.querySelectorAll('.notif-item').forEach(el => {
                el.addEventListener('click', async (e) => {
                    const id = el.getAttribute('data-id');
                    if (id) {
                        try {
                            await updateDoc(doc(db, "notifications", id), { read: true });
                        } catch (err) {
                            console.warn("Failed to mark notification read:", err);
                        }
                    }
                });
            });
        }
    }, (err) => {
        console.warn("Firestore notification snapshot notice:", err);
    });
}

// Start listener immediately for public notifications, then update on Auth change
setupRealtimeListener(null);
registerDeviceForPushNotifications();
onAuthStateChanged(auth, (user) => {
    setupRealtimeListener(user);
    registerDeviceForPushNotifications();
});

async function markAllAsRead() {
    try {
        const batch = writeBatch(db);
        currentNotifications.forEach(item => {
            if (!item.read) {
                batch.update(doc(db, "notifications", item.id), { read: true });
            }
        });
        await batch.commit();
    } catch (err) {
        console.warn("Error marking all read:", err);
    }
}

function formatTimeAgo(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

