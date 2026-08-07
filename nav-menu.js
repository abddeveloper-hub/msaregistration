import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function initToggleMenu() {
    const toggleBtn = document.getElementById("loginMenuToggleBtn");
    const drawer   = document.getElementById("loginDropdownMenu");
    const closeBtn = document.getElementById("closeLoginDrawerBtn") || document.getElementById("closeDrawerBtn");

    // Move drawer to body so it escapes the navbar's transform context
    // (transform on parent breaks position:fixed child anchoring)
    if (drawer && drawer.parentElement !== document.body) {
        document.body.appendChild(drawer);
    }

    // Create overlay once
    let overlay = document.getElementById("nav-drawer-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "nav-drawer-overlay";
        document.body.appendChild(overlay);
    }

    function openDrawer() {
        drawer.classList.add("open");
        drawer.classList.remove("hidden");
        overlay.classList.add("active");
        document.body.style.overflow = "hidden";
        toggleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>`;
    }

    function closeDrawer() {
        drawer.classList.remove("open");
        drawer.classList.add("hidden");
        overlay.classList.remove("active");
        document.body.style.overflow = "";
        toggleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
            </svg>`;
    }

    if (toggleBtn && drawer) {
        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            drawer.classList.contains("open") ? closeDrawer() : openDrawer();
        });

        if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

        overlay.addEventListener("click", closeDrawer);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
        });
    }

    initCommandPalette();
    initScrollToTop();
    initGlobalAudioPlayer();
}

function initScrollToTop() {
    if (typeof document === "undefined") return;
    let btn = document.getElementById("scrollToTopBtn");
    if (!btn) {
        btn = document.createElement("button");
        btn.id = "scrollToTopBtn";
        btn.className = "scroll-to-top-btn";
        btn.setAttribute("aria-label", "Scroll to top");
        btn.setAttribute("title", "Scroll to top");
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
        document.body.appendChild(btn);
    }

    btn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    window.addEventListener("scroll", () => {
        if (window.scrollY > 300) {
            btn.classList.add("visible");
        } else {
            btn.classList.remove("visible");
        }

        const bar = document.getElementById("scrollProgressBar");
        if (bar) {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
            bar.style.width = scrolled + "%";
        }
    }, { passive: true });
}

// Global Command Palette (Ctrl+K / Cmd+K)
function initCommandPalette() {
    if (typeof document === "undefined") return;

    // Injects Command Palette Modal DOM if missing
    if (!document.getElementById("globalCmdPaletteModal")) {
        const modal = document.createElement("div");
        modal.id = "globalCmdPaletteModal";
        modal.className = "cmd-palette-backdrop hidden";
        modal.innerHTML = `
            <div class="cmd-palette-box">
                <div class="cmd-palette-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="cmdPaletteInput" placeholder="Type a command or search page (e.g. Library, Events, Admin)..." autocomplete="off">
                    <span class="cmd-palette-badge">ESC</span>
                </div>
                <div id="cmdPaletteList" class="cmd-palette-list">
                    <!-- Dynamic navigation options -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Inject Command Palette Styles
        if (!document.getElementById("cmdPaletteStyles")) {
            const style = document.createElement("style");
            style.id = "cmdPaletteStyles";
            style.textContent = `
                .cmd-palette-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    z-index: 99999;
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    padding-top: 15vh;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.2s ease;
                }
                .cmd-palette-backdrop:not(.hidden) {
                    opacity: 1;
                    pointer-events: auto;
                }
                .cmd-palette-box {
                    width: 90%;
                    max-width: 580px;
                    background: var(--surface-solid, #0f172a);
                    border: 1px solid var(--border, rgba(255,255,255,0.15));
                    border-radius: 18px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                    overflow: hidden;
                }
                .cmd-palette-header {
                    display: flex;
                    align-items: center;
                    padding: 1rem 1.25rem;
                    border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
                    gap: 0.75rem;
                    color: var(--text-dim, #94a3b8);
                }
                .cmd-palette-header input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    outline: none;
                    color: var(--text-main, #f8fafc);
                    font-size: 1rem;
                    font-family: inherit;
                }
                .cmd-palette-badge {
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 3px 7px;
                    border-radius: 6px;
                    background: rgba(255,255,255,0.1);
                    color: var(--text-dim, #94a3b8);
                }
                .cmd-palette-list {
                    max-height: 320px;
                    overflow-y: auto;
                    padding: 0.5rem;
                }
                .cmd-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem 1rem;
                    border-radius: 10px;
                    color: var(--text-main, #f8fafc);
                    text-decoration: none;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: background 0.15s ease;
                }
                .cmd-item:hover, .cmd-item.selected {
                    background: rgba(37, 99, 235, 0.2);
                    color: #60a5fa;
                }
                .cmd-item-title {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .cmd-item-category {
                    font-size: 0.75rem;
                    color: var(--text-dim, #94a3b8);
                }
            `;
            document.head.appendChild(style);
        }
    }

    const modal = document.getElementById("globalCmdPaletteModal");
    const input = document.getElementById("cmdPaletteInput");
    const list = document.getElementById("cmdPaletteList");

    const commands = [
        { icon: "🌐", title: "Home Page", url: "index.html", cat: "Navigation" },
        { icon: "🏛️", title: "Campus Network & Portals", url: "campus.html", cat: "Campuses" },
        { icon: "📚", title: "Digital Library & Audio Archive", url: "library.html", cat: "Resources" },
        { icon: "📅", title: "News & Upcoming Events", url: "events.html", cat: "Information" },
        { icon: "🖼️", title: "Photo & Media Gallery", url: "gallery.html", cat: "Media" },
        { icon: "🎥", title: "Video Portal & Lectures", url: "videos.html", cat: "Media" },
        { icon: "🏆", title: "Student Achievements & Honors", url: "achievements.html", cat: "Honors" },
        { icon: "🎓", title: "Alumni Directory", url: "alumni.html", cat: "Directory" },
        { icon: "🔑", title: "Student / Faculty Portal Login", url: "login.html", cat: "Authentication" }
    ];

    function renderCmds(query = "") {
        if (!list) return;
        const q = query.toLowerCase().trim();
        const filtered = commands.filter(c => !q || c.title.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q));

        if (filtered.length === 0) {
            list.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-dim); font-size:0.85rem;">No matching page commands found</div>`;
            return;
        }

        list.innerHTML = filtered.map((c, idx) => `
            <a href="${c.url}" class="cmd-item ${idx === 0 ? 'selected' : ''}">
                <span class="cmd-item-title">
                    <span>${c.icon}</span>
                    <span>${c.title}</span>
                </span>
                <span class="cmd-item-category">${c.cat}</span>
            </a>
        `).join("");
    }

    function toggleCmdPalette(show) {
        if (!modal) return;
        if (show) {
            modal.classList.remove("hidden");
            renderCmds("");
            setTimeout(() => input?.focus(), 50);
        } else {
            modal.classList.add("hidden");
            if (input) input.value = "";
        }
    }

    // Keydown listener for Ctrl+K / Cmd+K and Esc
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            const isHidden = modal?.classList.contains("hidden");
            toggleCmdPalette(isHidden);
        } else if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
            toggleCmdPalette(false);
        }
    });

    if (input) {
        input.addEventListener("input", (e) => renderCmds(e.target.value));
    }

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) toggleCmdPalette(false);
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
    
    const loginLink = links.find(a => {
        const href = a.getAttribute("href") || "";
        return href.includes("login.html") && !href.includes("signup=true");
    }) || loginDropdownMenu.querySelector("#dropdownLoginBtn");

    const signupLink = links.find(a => {
        const href = a.getAttribute("href") || "";
        return href.includes("signup=true");
    }) || loginDropdownMenu.querySelector("#dropdownSignupBtn");

    if (!user) {
        if (loginLink) {
            loginLink.setAttribute("href", "login.html");
            loginLink.style.display = "flex";
            loginLink.style.cursor = "pointer";
            loginLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                <span>Login</span>
            `;
            loginLink.onclick = null;
        }
        if (signupLink) {
            signupLink.setAttribute("href", "login.html?signup=true");
            signupLink.style.display = "flex";
            signupLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>New Registration</span>
            `;
            signupLink.onclick = null;
        }
    } else {
        const currentPath = window.location.pathname.toLowerCase();
        const isAlreadyOnDashboard = currentPath.includes("student.html") || 
                                     currentPath.includes("teacher.html") || 
                                     currentPath.includes("admin.html") || 
                                     currentPath.includes("portal.html");

        // Position 8: My Dashboard (hidden if already on dashboard page)
        if (loginLink) {
            if (isAlreadyOnDashboard) {
                loginLink.style.display = "none";
            } else {
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
                loginLink.setAttribute("href", targetPage);
                loginLink.style.display = "flex";
                loginLink.style.cursor = "pointer";
                loginLink.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    <span>My Dashboard</span>
                `;
                loginLink.onclick = null;
            }
        }

        // Position 9: Log Out (Always the LAST item in the menu)
        if (signupLink) {
            signupLink.removeAttribute("href");
            signupLink.style.display = "flex";
            signupLink.style.cursor = "pointer";
            signupLink.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span style="color: var(--danger, #ef4444); font-weight: 600;">Log Out</span>
            `;
            signupLink.onclick = (e) => {
                e.preventDefault();
                signOut(auth).then(() => {
                    window.location.reload();
                }).catch(err => console.error("Logout error:", err));
            };
        }
    }
});

function initGlobalAudioPlayer() {
    if (typeof document === "undefined" || document.getElementById("globalAudioWidget")) return;

    const widget = document.createElement("div");
    widget.id = "globalAudioWidget";
    widget.className = "global-audio-widget collapsed";
    widget.innerHTML = `
        <button id="audioWidgetToggleBtn" class="audio-widget-badge" aria-label="Toggle Audio Player">
            <span class="audio-pulse-dot"></span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            <span style="font-weight:700; font-size:0.78rem;">Qira'at &amp; Speeches</span>
        </button>
        
        <div class="audio-widget-panel">
            <div class="audio-panel-header">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:1.1rem;">📖</span>
                    <div>
                        <div style="font-weight:700; font-size:0.85rem; color:var(--text-main, #fff);">Dars Audio Player</div>
                        <div style="font-size:0.72rem; color:var(--text-dim, #94a3b8);">Recitations &amp; Speeches</div>
                    </div>
                </div>
                <button id="closeAudioPanelBtn" style="background:none; border:none; color:var(--text-dim, #94a3b8); cursor:pointer; font-size:1rem; padding:4px;">✕</button>
            </div>
            
            <div class="audio-track-info" style="margin-top: 0.25rem;">
                <div id="audioTrackTitle" style="font-weight:700; font-size:0.88rem; color:var(--primary, #10b981); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Surah Yaseen (Recitation)</div>
                <div id="audioTrackArtist" style="font-size:0.76rem; color:var(--text-dim, #94a3b8);">Qari Safwan Al-Hafiz - MSA Ukkuda</div>
            </div>

            <audio id="globalAudioEl" src="https://cdn.islamicfinder.org/quran/audio/128/ar.alafasy/036.mp3" preload="none"></audio>
            
            <div class="audio-controls" style="margin-top: 0.5rem;">
                <button id="audioPrevBtn" class="audio-btn" title="Previous Track">⏮</button>
                <button id="audioPlayBtn" class="audio-btn main-play" title="Play/Pause">▶</button>
                <button id="audioNextBtn" class="audio-btn" title="Next Track">⏭</button>
                <div style="flex:1; display:flex; flex-direction:column; gap:2px; min-width:0;">
                    <input type="range" id="audioProgressInput" min="0" max="100" value="0" style="width:100%; accent-color:var(--primary, #10b981); cursor:pointer; height:4px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--text-dim, #94a3b8);">
                        <span id="audioTimeCurrent">0:00</span>
                        <span id="audioTimeDuration">0:00</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(widget);

    if (!document.getElementById("globalAudioStyles")) {
        const style = document.createElement("style");
        style.id = "globalAudioStyles";
        style.textContent = `
            .global-audio-widget {
                position: fixed;
                bottom: calc(78px + env(safe-area-inset-bottom));
                left: 1.25rem;
                z-index: 9998;
                font-family: var(--font-ui, inherit);
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .audio-widget-badge {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                background: var(--surface-solid, #0f172a);
                color: var(--text-main, #fff);
                border: 1px solid var(--border, rgba(255,255,255,0.15));
                padding: 0.5rem 0.9rem;
                border-radius: 50px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                cursor: pointer;
                transition: transform 0.2s, background 0.2s;
            }
            .audio-widget-badge:hover {
                transform: translateY(-2px);
                border-color: var(--primary, #0f4c3a);
            }
            .audio-pulse-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--primary, #10b981);
                box-shadow: 0 0 0 0 rgba(16,185,129,0.4);
                animation: audioPulse 1.8s infinite;
            }
            @keyframes audioPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
                50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
            }
            .global-audio-widget.collapsed .audio-widget-panel {
                display: none;
            }
            .global-audio-widget:not(.collapsed) .audio-widget-badge {
                display: none;
            }
            .audio-widget-panel {
                width: 310px;
                background: var(--surface-solid, #0f172a);
                border: 1px solid var(--border, rgba(255,255,255,0.15));
                border-radius: 18px;
                padding: 1rem;
                box-shadow: 0 12px 32px rgba(0,0,0,0.3);
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            .audio-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
                padding-bottom: 0.5rem;
            }
            .audio-controls {
                display: flex;
                align-items: center;
                gap: 0.6rem;
            }
            .audio-btn {
                background: var(--surface-raised, rgba(255,255,255,0.08));
                border: 1px solid var(--border, rgba(255,255,255,0.1));
                color: var(--text-main, #fff);
                border-radius: 50%;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 0.8rem;
                flex-shrink: 0;
            }
            .audio-btn.main-play {
                background: var(--primary, #0f4c3a);
                color: #fff;
                width: 36px;
                height: 36px;
                font-size: 0.9rem;
            }
            @media (min-width: 769px) {
                .global-audio-widget {
                    bottom: 2rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const playlist = [
        {
            title: "Surah Yaseen (Recitation)",
            artist: "Qari Safwan Al-Hafiz - MSA Ukkuda",
            src: "https://cdn.islamicfinder.org/quran/audio/128/ar.alafasy/036.mp3"
        },
        {
            title: "Surah Al-Mulk (Night Recitation)",
            artist: "Qari Rayyan Al-Fazili",
            src: "https://cdn.islamicfinder.org/quran/audio/128/ar.alafasy/067.mp3"
        },
        {
            title: "Surah Ar-Rahman",
            artist: "Dars Students Qira'at Group",
            src: "https://cdn.islamicfinder.org/quran/audio/128/ar.alafasy/055.mp3"
        }
    ];

    let trackIdx = 0;
    const audioEl = document.getElementById("globalAudioEl");
    const playBtn = document.getElementById("audioPlayBtn");
    const prevBtn = document.getElementById("audioPrevBtn");
    const nextBtn = document.getElementById("audioNextBtn");
    const titleEl = document.getElementById("audioTrackTitle");
    const artistEl = document.getElementById("audioTrackArtist");
    const progressInput = document.getElementById("audioProgressInput");
    const timeCurrent = document.getElementById("audioTimeCurrent");
    const timeDuration = document.getElementById("audioTimeDuration");
    const toggleBtn = document.getElementById("audioWidgetToggleBtn");
    const closeBtn = document.getElementById("closeAudioPanelBtn");

    function formatSecs(sec) {
        if (isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function loadTrack(idx) {
        trackIdx = idx;
        const track = playlist[trackIdx];
        if (!track) return;
        titleEl.textContent = track.title;
        artistEl.textContent = track.artist;
        audioEl.src = track.src;
        progressInput.value = 0;
        timeCurrent.textContent = "0:00";
        timeDuration.textContent = "0:00";
    }

    toggleBtn?.addEventListener("click", () => widget.classList.remove("collapsed"));
    closeBtn?.addEventListener("click", () => widget.classList.add("collapsed"));

    playBtn?.addEventListener("click", () => {
        if (audioEl.paused) {
            audioEl.play().then(() => {
                playBtn.textContent = "⏸";
            }).catch(e => console.warn(e));
        } else {
            audioEl.pause();
            playBtn.textContent = "▶";
        }
    });

    prevBtn?.addEventListener("click", () => {
        trackIdx = (trackIdx - 1 + playlist.length) % playlist.length;
        loadTrack(trackIdx);
        audioEl.play().then(() => playBtn.textContent = "⏸").catch(e => console.warn(e));
    });

    nextBtn?.addEventListener("click", () => {
        trackIdx = (trackIdx + 1) % playlist.length;
        loadTrack(trackIdx);
        audioEl.play().then(() => playBtn.textContent = "⏸").catch(e => console.warn(e));
    });

    audioEl?.addEventListener("timeupdate", () => {
        if (audioEl.duration) {
            const pct = (audioEl.currentTime / audioEl.duration) * 100;
            progressInput.value = pct;
            timeCurrent.textContent = formatSecs(audioEl.currentTime);
            timeDuration.textContent = formatSecs(audioEl.duration);
        }
    });

    progressInput?.addEventListener("input", () => {
        if (audioEl.duration) {
            audioEl.currentTime = (progressInput.value / 100) * audioEl.duration;
        }
    });

    audioEl?.addEventListener("ended", () => {
        nextBtn?.click();
    });

    loadTrack(0);
}

