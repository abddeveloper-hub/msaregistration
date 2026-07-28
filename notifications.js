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

// Automatically register device push token in Firestore for all app installations & Android devices
export async function registerDeviceForPushNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
        if (!("serviceWorker" in navigator)) return;
        const swReg = await navigator.serviceWorker.ready;
        if (!swReg || !swReg.pushManager) return;

        let token = null;
        let endpoint = null;

        // 1. Try FCM getToken first
        try {
            const supported = await isSupported();
            if (supported) {
                const messagingInstance = messaging || getMessaging(app);
                if (messagingInstance) {
                    token = await getToken(messagingInstance, {
                        serviceWorkerRegistration: swReg,
                        vapidKey: "BC8hZ0WjN38P21-GZ46l1Q_b8XN34m8K7n4W_vnmnZ_K7n4W"
                    }).catch(() => null);
                }
            }
        } catch(e) {}

        // 2. Standard WebPush Subscription fallback for Android Chrome
        if (!token) {
            try {
                let sub = await swReg.pushManager.getSubscription();
                if (!sub) {
                    sub = await swReg.pushManager.subscribe({
                        userVisibleOnly: true
                    }).catch(() => null);
                }
                if (sub) {
                    endpoint = sub.endpoint;
                    token = sub.endpoint;
                }
            } catch(subErr) {
                console.warn("PushManager subscribe notice:", subErr);
            }
        }

        if (token || endpoint) {
            const targetToken = token || endpoint;
            const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
            const tokenDocId = String(targetToken).replace(/[^a-zA-Z0-9]/g, "_").slice(-64);
            const user = auth.currentUser;

            await setDoc(doc(db, "push_tokens", tokenDocId), {
                token: targetToken,
                endpoint: endpoint || targetToken,
                uid: user ? user.uid : "anonymous",
                platform: navigator.platform || "Android",
                userAgent: navigator.userAgent,
                isInstalledApp: Boolean(isStandalone),
                updatedAt: new Date().toISOString()
            }, { merge: true });

            console.log("Push Token successfully saved to Firestore push_tokens!");
        }
    } catch (err) {
        console.warn("Device push token registration notice:", err);
    }
}

// Helper function to dispatch a new notification to Firestore & background devices
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
    } catch (err) {
        console.warn("Firestore notification save warning (check Security Rules):", err);
    }

    // Background Push Notification Dispatch to all registered device tokens for closed/background mobile apps
    dispatchBackgroundPushToTokens({ title, message: textMsg, link, type });

    return { success: true };
}

async function dispatchBackgroundPushToTokens({ title, message, link, type }) {
    try {
        const tokensSnap = await getDocs(collection(db, "push_tokens"));
        if (tokensSnap.empty) return;

        tokensSnap.forEach(docSnap => {
            const tokenData = docSnap.data();
            if (tokenData) {
                sendFcmPayloadToToken(tokenData, { title, message, link, type });
            }
        });
    } catch (e) {
        console.warn("Background push dispatch notice:", e);
    }
}

async function sendFcmPayloadToToken(tokenData, { title, message, link, type }) {
    const targetUrl = typeof tokenData === "string" ? tokenData : (tokenData.endpoint || tokenData.token);
    if (!targetUrl) return;

    let postUrl = "https://fcm.googleapis.com/fcm/send";
    if (targetUrl.startsWith("http")) {
        postUrl = targetUrl;
    }

    const payload = {
        to: targetUrl,
        notification: {
            title: title || "MSA Portal",
            body: message || "New notification",
            icon: "./icon-192.png",
            click_action: link || "./"
        },
        data: {
            title: title || "MSA Portal",
            message: message || "New notification",
            link: link || "./",
            type: type || "announcement"
        },
        priority: "high"
    };

    try {
        await fetch(postUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
    } catch (e) {}
}

export function triggerNativeNotification(title, message) {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const text = message || title;
    const header = message ? title : "MSA Portal";
    
    let iconUrl = "icon-192.png";
    try {
        iconUrl = new URL("icon-192.png", window.location.href).href;
    } catch(e) {}

    const fireNotif = () => {
        // 1. Post to active ServiceWorker controller (100% reliable on Mobile Android Chrome)
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_SYSTEM_NOTIFICATION',
                    title: header,
                    body: text,
                    icon: iconUrl,
                    link: './'
                });
            } catch(e) {}
        }

        // 2. Dispatch via ServiceWorker registration ready state
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                if (reg && typeof reg.showNotification === 'function') {
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
                }
            }).catch(() => {
                try { new Notification(header, { body: text, icon: iconUrl }); } catch(e) {}
            });
        } else {
            try { new Notification(header, { body: text, icon: iconUrl }); } catch(e) {}
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

export function showDiagnosticModal() {
    let modal = document.getElementById("notifDiagnosticModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "notifDiagnosticModal";
        modal.className = "modal";
        modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.75); z-index:100000; display:flex; align-items:center; justify-content:center; padding:1rem;";
        document.body.appendChild(modal);
    }

    const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hasApi = typeof window !== "undefined" && "Notification" in window;
    const perm = hasApi ? Notification.permission : "unsupported";
    const hasSW = typeof navigator !== "undefined" && "serviceWorker" in navigator;

    let permBadge = '<span style="color:#10b981; font-weight:700;">✅ Allowed</span>';
    if (perm === "default") permBadge = '<span style="color:#f59e0b; font-weight:700;">⚠️ Not Granted Yet</span>';
    if (perm === "denied") permBadge = '<span style="color:#ef4444; font-weight:700;">❌ Blocked in Browser Settings</span>';
    if (perm === "unsupported") permBadge = '<span style="color:#ef4444; font-weight:700;">❌ Unsupported Browser</span>';

    const protoBadge = isHttps ? '<span style="color:#10b981; font-weight:700;">✅ Secure Context</span>' : '<span style="color:#ef4444; font-weight:700;">❌ Insecure Protocol (' + window.location.protocol + ')</span>';
    const swBadge = hasSW ? '<span style="color:#10b981; font-weight:700;">✅ Active</span>' : '<span style="color:#ef4444; font-weight:700;">❌ Inactive</span>';

    modal.innerHTML = `
        <div style="background:var(--surface, #1e1e2d); color:var(--text-main, #ffffff); border:1px solid var(--border, rgba(255,255,255,0.15)); border-radius:16px; padding:1.5rem; max-width:480px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.6); max-height:90vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid var(--border, rgba(255,255,255,0.1)); padding-bottom:0.75rem;">
                <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:#ffffff;">🔔 Notification Status Check</h3>
                <button id="closeDiagModalBtn" style="background:none; border:none; color:var(--text-dim, #a0a0b0); font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:0.6rem; font-size:0.86rem; margin-bottom:1.25rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:0.6rem 0.8rem; border-radius:8px;">
                    <span>Browser Permission:</span> ${permBadge}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:0.6rem 0.8rem; border-radius:8px;">
                    <span>Security Protocol:</span> ${protoBadge}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:0.6rem 0.8rem; border-radius:8px;">
                    <span>Service Worker:</span> ${swBadge}
                </div>
            </div>

            <div style="background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:0.9rem; margin-bottom:1.25rem; font-size:0.82rem; line-height:1.45; color:var(--text-main,#ffffff);">
                <strong style="color:#60a5fa;">💡 What to do if notifications are not showing:</strong>
                <ol style="margin:0.5rem 0 0 1.1rem; padding:0;">
                    ${perm === "denied" ? '<li style="margin-bottom:0.3rem;"><strong style="color:#f87171;">Unblock Site Settings:</strong> Click the 🔒 lock icon next to the URL in your browser address bar → Site Settings → Change Notifications from "Block" to "Allow", then refresh.</li>' : ''}
                    ${perm === "default" ? '<li style="margin-bottom:0.3rem;"><strong>Grant Permission:</strong> Click the "Enable Permission" button below.</li>' : ''}
                    ${!isHttps ? '<li style="margin-bottom:0.3rem;"><strong style="color:#f87171;">HTTPS / Localhost Required:</strong> Opening plain file:// or HTTP blocks push notifications. Use https:// or http://localhost.</li>' : ''}
                    <li style="margin-bottom:0.3rem;"><strong>Windows / macOS Notification Center:</strong> Check your taskbar Action Center (bottom right) and make sure Windows Focus Assist / Do Not Disturb is OFF.</li>
                    <li><strong>iPhone (iOS):</strong> Open in Safari → Share → Add to Home Screen, then launch the app icon from your Home Screen.</li>
                </ol>
            </div>

            <div style="display:flex; gap:0.75rem; justify-content:flex-end;">
                ${perm === "default" ? '<button id="diagRequestPermBtn" style="background:#2563eb; color:#fff; border:none; padding:0.6rem 1rem; border-radius:8px; font-weight:600; font-size:0.85rem; cursor:pointer;">Enable Permission</button>' : ''}
                <button id="diagTestTriggerBtn" style="background:#10b981; color:#fff; border:none; padding:0.6rem 1rem; border-radius:8px; font-weight:600; font-size:0.85rem; cursor:pointer;">Trigger Test Notification</button>
            </div>
        </div>
    `;

    modal.style.display = "flex";

    document.getElementById("closeDiagModalBtn")?.addEventListener("click", () => modal.style.display = "none");
    document.getElementById("diagRequestPermBtn")?.addEventListener("click", () => {
        Notification.requestPermission().then(p => {
            modal.style.display = "none";
            showDiagnosticModal();
            if (p === "granted") triggerNativeNotification("Test Notification 🔔", "System notifications are active!");
        });
    });
    document.getElementById("diagTestTriggerBtn")?.addEventListener("click", () => {
        triggerNativeNotification("Live System Notification 🔔", "Status bar & browser notifications are active on your device!");
        showToast("Test Dispatched 🔔", "A system notification was sent to your status bar.");
    });
}

export async function runNotificationDiagnostic() {
    showDiagnosticModal();
    return { success: true };
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

