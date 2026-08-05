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
    initTasbeehWidget();
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

// Global Digital Tasbeeh & Adhkar Widget
function initTasbeehWidget() {
    if (typeof document === "undefined") return;

    // Inject Floating Button if missing
    if (!document.getElementById("tasbeehFloatingBtn")) {
        const btn = document.createElement("button");
        btn.id = "tasbeehFloatingBtn";
        btn.className = "tasbeeh-floating-btn";
        btn.setAttribute("aria-label", "Open Digital Tasbeeh Counter");
        btn.setAttribute("title", "Digital Tasbeeh & Adhkar Counter");
        btn.innerHTML = `<span style="font-size: 1.25rem; line-height: 1;">📿</span>`;
        document.body.appendChild(btn);
    }

    // Inject Modal DOM if missing
    if (!document.getElementById("tasbeehModal")) {
        const modal = document.createElement("div");
        modal.id = "tasbeehModal";
        modal.className = "tasbeeh-modal-backdrop hidden";
        modal.innerHTML = `
            <div class="tasbeeh-modal-box">
                <div class="tasbeeh-header">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.4rem;">📿</span>
                        <div>
                            <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0; color: var(--text-main, #f8fafc); font-family: var(--font-display, inherit);">Digital Tasbeeh</h3>
                            <p style="font-size: 0.75rem; color: var(--text-dim, #94a3b8); margin: 0;">Daily Remembrance Counter</p>
                        </div>
                    </div>
                    <button id="closeTasbeehModalBtn" class="tasbeeh-close-btn" aria-label="Close">✕</button>
                </div>

                <div class="tasbeeh-body">
                    <!-- Dhikr Selector -->
                    <div class="tasbeeh-select-wrap">
                        <select id="tasbeehDhikrSelect" class="tasbeeh-select">
                            <option value="subhanallah">سُبْحَانَ ٱللَّٰهِ — SubhanAllah</option>
                            <option value="alhamdulillah">ٱلْحَمْدُ لِلَّٰهِ — Alhamdulillah</option>
                            <option value="allahuakbar">ٱللَّٰهُ أَكْبَرُ — Allahu Akbar</option>
                            <option value="astaghfirullah">أَسْتَغْفِرُ ٱللَّٰهَ — Astaghfirullah</option>
                            <option value="lailahaillallah">لَا إِلَٰهَ إِلَّا ٱللَّٰهُ — La ilaha illallah</option>
                            <option value="salawat">اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ — Salawat</option>
                        </select>
                    </div>

                    <!-- Arabic Display -->
                    <div class="tasbeeh-arabic-display" id="tasbeehArabicText">
                        سُبْحَانَ ٱللَّٰهِ
                    </div>

                    <!-- Target Chips -->
                    <div class="tasbeeh-target-chips">
                        <span class="target-chip active" data-target="33">Target: 33</span>
                        <span class="target-chip" data-target="100">Target: 100</span>
                        <span class="target-chip" data-target="0">Unlimited</span>
                    </div>

                    <!-- Main Counter Button -->
                    <div class="tasbeeh-counter-area">
                        <button id="tasbeehCountBtn" class="tasbeeh-count-btn">
                            <span id="tasbeehCurrentCount" class="tasbeeh-num">0</span>
                            <span class="tasbeeh-tap-hint">TAP TO COUNT</span>
                        </button>
                    </div>

                    <!-- Progress Bar -->
                    <div class="tasbeeh-progress-bar-wrap">
                        <div id="tasbeehProgressBar" class="tasbeeh-progress-fill" style="width: 0%;"></div>
                    </div>

                    <!-- Controls: Reset & Sound Toggle -->
                    <div class="tasbeeh-actions">
                        <button id="tasbeehResetBtn" class="tasbeeh-action-btn">
                            🔄 Reset
                        </button>
                        <button id="tasbeehSoundToggleBtn" class="tasbeeh-action-btn">
                            🔊 Click Sound: ON
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Inject Tasbeeh Styles
        if (!document.getElementById("tasbeehWidgetStyles")) {
            const style = document.createElement("style");
            style.id = "tasbeehWidgetStyles";
            style.textContent = `
                .tasbeeh-floating-btn {
                    position: fixed;
                    bottom: 5.5rem;
                    right: 1.5rem;
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: var(--surface-solid, #0f4c3a);
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 8px 24px rgba(15, 76, 58, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 9998;
                    transition: transform 0.25s ease, box-shadow 0.25s ease;
                }
                .tasbeeh-floating-btn:hover {
                    transform: scale(1.1);
                    box-shadow: 0 12px 30px rgba(15, 76, 58, 0.6);
                }
                .tasbeeh-modal-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.65);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.25s ease;
                }
                .tasbeeh-modal-backdrop:not(.hidden) {
                    opacity: 1;
                    pointer-events: auto;
                }
                .tasbeeh-modal-box {
                    width: 100%;
                    max-width: 420px;
                    background: var(--surface, #1e293b);
                    border: 1px solid var(--border, rgba(255,255,255,0.15));
                    border-radius: 24px;
                    box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                    overflow: hidden;
                    animation: tasbeehPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                @keyframes tasbeehPop {
                    from { transform: scale(0.85); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .tasbeeh-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid var(--border, rgba(255,255,255,0.1));
                    background: rgba(15, 76, 58, 0.15);
                }
                .tasbeeh-close-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-dim, #94a3b8);
                    font-size: 1.2rem;
                    cursor: pointer;
                    padding: 0.25rem 0.5rem;
                    border-radius: 8px;
                    transition: color 0.15s;
                }
                .tasbeeh-close-btn:hover {
                    color: var(--text-main, #fff);
                }
                .tasbeeh-body {
                    padding: 1.5rem;
                    text-align: center;
                }
                .tasbeeh-select-wrap {
                    margin-bottom: 1.25rem;
                }
                .tasbeeh-select {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    border: 1px solid var(--border, rgba(255,255,255,0.2));
                    background: var(--bg, #0f172a);
                    color: var(--text-main, #f8fafc);
                    font-size: 0.9rem;
                    font-weight: 600;
                    outline: none;
                    cursor: pointer;
                }
                .tasbeeh-arabic-display {
                    font-family: 'Amiri', 'Aref Ruqaa', serif;
                    font-size: 1.8rem;
                    color: var(--primary, #10b981);
                    min-height: 50px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 1.25rem;
                    line-height: 1.4;
                }
                .tasbeeh-target-chips {
                    display: flex;
                    gap: 0.5rem;
                    justify-content: center;
                    margin-bottom: 1.5rem;
                }
                .target-chip {
                    font-size: 0.78rem;
                    font-weight: 700;
                    padding: 0.35rem 0.85rem;
                    border-radius: 20px;
                    border: 1px solid var(--border, rgba(255,255,255,0.15));
                    background: var(--bg, #0f172a);
                    color: var(--text-dim, #94a3b8);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .target-chip.active {
                    background: var(--primary, #0f4c3a);
                    color: #ffffff;
                    border-color: var(--primary, #0f4c3a);
                }
                .tasbeeh-counter-area {
                    margin-bottom: 1.5rem;
                    display: flex;
                    justify-content: center;
                }
                .tasbeeh-count-btn {
                    width: 140px;
                    height: 140px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--primary, #0f4c3a), #082f24);
                    border: 4px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 12px 36px rgba(15, 76, 58, 0.4);
                    color: #ffffff;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    outline: none;
                    transition: transform 0.1s ease, box-shadow 0.1s ease;
                    user-select: none;
                    -webkit-tap-highlight-color: transparent;
                }
                .tasbeeh-count-btn:active {
                    transform: scale(0.93);
                    box-shadow: 0 4px 15px rgba(15, 76, 58, 0.6);
                }
                .tasbeeh-num {
                    font-size: 2.75rem;
                    font-weight: 800;
                    font-family: 'Inter', sans-serif;
                    line-height: 1;
                }
                .tasbeeh-tap-hint {
                    font-size: 0.65rem;
                    font-weight: 700;
                    letter-spacing: 0.12em;
                    opacity: 0.75;
                    margin-top: 0.25rem;
                }
                .tasbeeh-progress-bar-wrap {
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    overflow: hidden;
                    margin-bottom: 1.25rem;
                }
                .tasbeeh-progress-fill {
                    height: 100%;
                    background: var(--primary, #10b981);
                    transition: width 0.2s ease;
                }
                .tasbeeh-actions {
                    display: flex;
                    gap: 0.75rem;
                    justify-content: center;
                }
                .tasbeeh-action-btn {
                    flex: 1;
                    padding: 0.6rem;
                    border-radius: 12px;
                    border: 1px solid var(--border, rgba(255,255,255,0.15));
                    background: var(--bg, #0f172a);
                    color: var(--text-main, #f8fafc);
                    font-size: 0.82rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .tasbeeh-action-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `;
            document.head.appendChild(style);
        }
    }

    const floatingBtn = document.getElementById("tasbeehFloatingBtn");
    const modal       = document.getElementById("tasbeehModal");
    const closeBtn   = document.getElementById("closeTasbeehModalBtn");
    const selectEl    = document.getElementById("tasbeehDhikrSelect");
    const arabicEl    = document.getElementById("tasbeehArabicText");
    const countBtn    = document.getElementById("tasbeehCountBtn");
    const currentNum  = document.getElementById("tasbeehCurrentCount");
    const progressBar = document.getElementById("tasbeehProgressBar");
    const resetBtn    = document.getElementById("tasbeehResetBtn");
    const soundBtn    = document.getElementById("tasbeehSoundToggleBtn");
    const targetChips = document.querySelectorAll(".target-chip");

    // Arabic Map
    const dhikrArabicMap = {
        subhanallah: "سُبْحَانَ ٱللَّٰهِ",
        alhamdulillah: "ٱلْحَمْدُ لِلَّٰهِ",
        allahuakbar: "ٱللَّٰهُ أَكْبَرُ",
        astaghfirullah: "أَسْتَغْفِرُ ٱللَّٰهَ",
        lailahaillallah: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ",
        salawat: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ"
    };

    let count = parseInt(localStorage.getItem("msaukkuda:tasbeeh_count") || "0", 10);
    let target = parseInt(localStorage.getItem("msaukkuda:tasbeeh_target") || "33", 10);
    let soundOn = localStorage.getItem("msaukkuda:tasbeeh_sound") !== "false";

    function updateUI() {
        if (currentNum) currentNum.textContent = count;
        
        if (target > 0) {
            const pct = Math.min(100, Math.round((count / target) * 100));
            if (progressBar) progressBar.style.width = `${pct}%`;
        } else {
            if (progressBar) progressBar.style.width = `100%`;
        }

        if (soundBtn) {
            soundBtn.textContent = `🔊 Sound: ${soundOn ? 'ON' : 'OFF'}`;
        }
    }

    // Audio click sound synthesizer (Web Audio API - no external file needed)
    function playClickSound() {
        if (!soundOn || typeof window === "undefined") return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
        } catch (e) {
            // Ignore audio context autoplay restrictions
        }
    }

    // Tap action
    function incrementCount() {
        count++;
        localStorage.setItem("msaukkuda:tasbeeh_count", count.toString());

        // Haptic feedback for mobile devices
        if (navigator.vibrate) {
            navigator.vibrate(count % target === 0 && target > 0 ? [50, 50, 50] : 15);
        }

        playClickSound();
        updateUI();

        // Completion flash
        if (target > 0 && count === target) {
            if (currentNum) {
                currentNum.style.color = "#F4C430";
                setTimeout(() => { currentNum.style.color = ""; }, 1000);
            }
        }
    }

    // Event listeners
    if (floatingBtn && modal) {
        floatingBtn.addEventListener("click", () => {
            modal.classList.remove("hidden");
            updateUI();
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.classList.add("hidden");
        });
    }

    if (selectEl) {
        selectEl.addEventListener("change", (e) => {
            const val = e.target.value;
            if (arabicEl) arabicEl.textContent = dhikrArabicMap[val] || "";
        });
    }

    targetChips.forEach(chip => {
        chip.addEventListener("click", () => {
            targetChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            target = parseInt(chip.dataset.target, 10);
            localStorage.setItem("msaukkuda:tasbeeh_target", target.toString());
            updateUI();
        });
    });

    if (countBtn) countBtn.addEventListener("click", incrementCount);

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            count = 0;
            localStorage.setItem("msaukkuda:tasbeeh_count", "0");
            updateUI();
        });
    }

    if (soundBtn) {
        soundBtn.addEventListener("click", () => {
            soundOn = !soundOn;
            localStorage.setItem("msaukkuda:tasbeeh_sound", soundOn.toString());
            updateUI();
        });
    }

    // Set initial target chip
    targetChips.forEach(c => {
        if (parseInt(c.dataset.target, 10) === target) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });

    updateUI();
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
