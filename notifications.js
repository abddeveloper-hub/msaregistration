import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, doc, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper function to dispatch a new notification to Firestore
export async function sendAppNotification({ recipient = "all", title, message, body, type = "announcement", link = "#" }) {
    const textMsg = message || body || title;
    const isoNow = new Date().toISOString();
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
        console.warn("Failed to send notification:", err);
    }
}

// Global Toast Popup Launcher
export function showToast(title, message, type = "info") {
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
    else if (type === "approval") icon = "✅";

    const displayMsg = message || title;
    const displayTitle = message ? title : "Notification";

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

    // Native Web Notification Fallback
    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            try { new Notification(displayTitle, { body: displayMsg, icon: "logo.png" }); } catch (e) {}
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// Global window assignments for non-module usage
if (typeof window !== "undefined") {
    window.sendAppNotification = sendAppNotification;
    window.showToast = showToast;
}

// DOM Setup & Listener
let currentNotifications = [];
let initialLoadDone = false;

document.addEventListener("DOMContentLoaded", () => {
    // Request notification permissions gracefully on user interaction or load
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
    }

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

    // 3. Inject Bell Button into existing headers if present
    injectBellIcon();
});

function injectBellIcon() {
    const navMenus = document.querySelectorAll(".nav-menu, .portal-header, .login-dropdown-menu");
    navMenus.forEach(nav => {
        if (!nav.querySelector(".notif-bell-wrapper")) {
            const bellWrap = document.createElement("div");
            bellWrap.className = "notif-bell-wrapper";
            bellWrap.innerHTML = `
                <button class="notif-bell-btn" id="globalNotifBell" title="Notifications" aria-label="Notifications">
                    🔔
                    <span class="notif-badge" id="globalNotifBadge" style="display:none;">0</span>
                </button>
            `;
            nav.prepend(bellWrap);

            const bellBtn = bellWrap.querySelector("#globalNotifBell");
            bellBtn?.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
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
onAuthStateChanged(auth, (user) => {
    const notifRef = collection(db, "notifications");
    const q = query(notifRef, limit(30));

    onSnapshot(q, (snapshot) => {
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
                        showToast(newItem.title, msgText, newItem.type || "info");
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
    });
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

