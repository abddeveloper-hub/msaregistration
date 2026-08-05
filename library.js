import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const libraryGrid = document.getElementById('libraryGrid');
const filterBtns = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('librarySearchInput');
const resourceCountSpan = document.getElementById('visibleResourceCount');

// Pre-loaded curated library items with working PDFs, Audio, and Reference Links
const defaultLibraryItems = [
    {
        id: "def-1",
        title: "Fathul Mueen - Comprehensive Fiqh Notes",
        category: "Fiqh / Jurisprudence",
        type: "pdf",
        author: "Shaikh Zainuddin Makhdoom",
        description: "Standard jurisprudence reference and explanatory notes for advanced Dars students.",
        url: "https://ia800204.us.archive.org/11/items/FathAl-Muin/Fath_al-Muin.pdf",
        fileSize: "4.8 MB",
        createdAt: "2026-07-01T10:00:00Z"
    },
    {
        id: "def-2",
        title: "Tafseer Al-Jalalayn Study Module",
        category: "Tafseer & Quranic Studies",
        type: "pdf",
        author: "Jalaluddin Al-Mahalli & Al-Suyuti",
        description: "Complete chapter summaries and grammatical breakdown for Dars syllabus.",
        url: "https://ia800305.us.archive.org/12/items/TafseerAlJalalayn/TafseerAlJalalayn.pdf",
        fileSize: "6.2 MB",
        createdAt: "2026-06-25T10:00:00Z"
    },
    {
        id: "def-3",
        title: "Tajweed & Qira'at Recitation Masterclass",
        category: "Qira'at & Quran Audio",
        type: "audio",
        author: "Qari Faculty Team",
        description: "High-quality audio recitation for Tajweed rules and Surah Fatiha / Juz Amma practice.",
        url: "https://server8.mp3quran.net/afs/001.mp3",
        fileSize: "18.5 MB",
        createdAt: "2026-06-20T10:00:00Z"
    },
    {
        id: "def-4",
        title: "Alfiyyah Ibn Malik - Nahw & Sarf Chart",
        category: "Arabic Grammar & Morphology",
        type: "notes",
        author: "Ibn Malik",
        description: "Quick revision charts covering poetic meters and grammatical rules for Nahw.",
        url: "https://ia801308.us.archive.org/34/items/AlfiyyahIbnMalik/Alfiyyah.pdf",
        fileSize: "1.5 MB",
        createdAt: "2026-06-15T10:00:00Z"
    },
    {
        id: "def-5",
        title: "Sahih Al-Bukhari Hadith Commentary Guide",
        category: "Hadith Studies",
        type: "pdf",
        author: "Imam Al-Bukhari / Faculty Notes",
        description: "Selected Kitab Al-Eman HADITH narrations with sanad commentary and vocabulary.",
        url: "https://ia800203.us.archive.org/4/items/SahihBukhariEnglishArabic/Sahih-Bukhari-Arabic-English.pdf",
        fileSize: "3.4 MB",
        createdAt: "2026-06-10T10:00:00Z"
    },
    {
        id: "def-6",
        title: "Nukhbat al-Fikar in Hadith Terminology",
        category: "Mustalah al-Hadith",
        type: "pdf",
        author: "Ibn Hajar al-Asqalani",
        description: "Foundational text on Hadith methodology, grading, and narrator classification.",
        url: "https://ia800303.us.archive.org/14/items/NukhbatAlFikar/Nukhbat_al_Fikar.pdf",
        fileSize: "2.1 MB",
        createdAt: "2026-06-05T10:00:00Z"
    },
    {
        id: "def-7",
        title: "Digital Manuscripts & Research Archive",
        category: "Academic Archives",
        type: "link",
        author: "MSA Research Repository",
        description: "Online archive portal for historical dars manuscripts and manuscript digitizations.",
        url: "https://archive.org/details/islamicmanuscripts",
        fileSize: "External Link",
        createdAt: "2026-06-01T10:00:00Z"
    }
];

let allResources = [];
let currentFilter = 'all';
let currentSearch = '';

// Skeleton Loading State
if (libraryGrid) {
    libraryGrid.innerHTML = Array(6).fill(0).map(() => `
        <div class="skeleton-card" style="padding:1.5rem; background: var(--surface); border:1px solid var(--border); border-radius:18px;">
            <div class="skeleton-box" style="width:36px; height:36px; border-radius:8px; margin-bottom:1rem;"></div>
            <div class="skeleton-box skeleton-text title" style="width:75%; height:20px; margin-bottom:0.75rem;"></div>
            <div class="skeleton-box skeleton-text short" style="width:50%; margin-bottom:1.25rem;"></div>
            <div class="skeleton-box skeleton-text" style="height:38px; border-radius:10px; width:100%;"></div>
        </div>
    `).join('');
}

// Fetch Real-time Library Resources from Firestore
try {
    onSnapshot(collection(db, "library_resources"), (snapshot) => {
        const fetched = [];
        snapshot.forEach(doc => {
            fetched.push({ id: doc.id, ...doc.data() });
        });
        
        if (fetched.length > 0) {
            allResources = fetched;
        } else {
            allResources = defaultLibraryItems;
        }
        allResources.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        renderResources();
    }, (error) => {
        console.warn("Library Firestore load notice, displaying default curated resources:", error);
        allResources = defaultLibraryItems;
        renderResources();
    });
} catch(e) {
    allResources = defaultLibraryItems;
    renderResources();
}

function updateFilterTabCounts() {
    const counts = {
        all: allResources.length,
        pdf: allResources.filter(r => r.type === 'pdf').length,
        audio: allResources.filter(r => r.type === 'audio').length,
        link: allResources.filter(r => r.type === 'link').length,
        notes: allResources.filter(r => r.type === 'notes').length
    };

    filterBtns.forEach(btn => {
        const filter = btn.getAttribute('data-filter') || 'all';
        const count = counts[filter] !== undefined ? counts[filter] : 0;
        const labels = {
            all: 'All Items',
            pdf: '📚 PDFs & Kitabs',
            audio: '🎧 Audio & Recitations',
            link: '🔗 Reference Links',
            notes: '📝 Syllabi & Notes'
        };
        btn.textContent = `${labels[filter] || filter} (${count})`;
    });
}

function renderResources() {
    if (!libraryGrid) return;
    
    libraryGrid.innerHTML = '';
    updateFilterTabCounts();

    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = currentSearch.trim() ? 'block' : 'none';
    }
    
    const filtered = allResources.filter(r => {
        // Filter by Type
        const matchType = (currentFilter === 'all') || (r.type === currentFilter);
        
        // Filter by Search Query
        const query = currentSearch.toLowerCase().trim();
        const matchSearch = !query || 
            (r.title && r.title.toLowerCase().includes(query)) ||
            (r.category && r.category.toLowerCase().includes(query)) ||
            (r.author && r.author.toLowerCase().includes(query)) ||
            (r.description && r.description.toLowerCase().includes(query));
            
        return matchType && matchSearch;
    });

    if (resourceCountSpan) {
        resourceCountSpan.textContent = filtered.length;
    }
        
    if (filtered.length === 0) {
        libraryGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; background: var(--surface); border: 1px dashed var(--border); border-radius: 20px;">
                <div style="font-size: 2.8rem; margin-bottom: 0.75rem; opacity: 0.6;">🔍</div>
                <h3 style="font-size: 1.2rem; font-family: var(--font-display); color: var(--text-main); margin-bottom: 0.4rem;">No matching resources found</h3>
                <p style="color: var(--text-dim); font-size: 0.85rem;">Try adjusting your search terms or filter selection.</p>
            </div>
        `;
        return;
    }
    
    filtered.forEach(res => {
        const card = document.createElement('div');
        card.className = 'library-resource-card animate-on-scroll slide-up is-visible';
        card.style.cssText = `
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: var(--shadow-sm);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        `;
        
        let typeIcon = '📄';
        let typeBadgeBg = 'rgba(37,99,235,0.12)';
        let typeBadgeColor = '#2563eb';
        let formatLabel = 'PDF Document';
        let actionLabel = 'View / Download PDF 📄';

        if (res.type === 'audio') {
            typeIcon = '🎧';
            typeBadgeBg = 'rgba(245,158,11,0.12)';
            typeBadgeColor = '#f59e0b';
            formatLabel = 'Audio Recording';
            actionLabel = 'Listen Audio 🎧';
        } else if (res.type === 'link') {
            typeIcon = '🔗';
            typeBadgeBg = 'rgba(139,92,246,0.12)';
            typeBadgeColor = '#8b5cf6';
            formatLabel = 'External Link';
            actionLabel = 'Open Reference 🔗';
        } else if (res.type === 'notes') {
            typeIcon = '📝';
            typeBadgeBg = 'rgba(16,185,129,0.12)';
            typeBadgeColor = '#10b981';
            formatLabel = 'Study Notes';
            actionLabel = 'Access Notes 📝';
        }

        const categoryText = res.category || 'General Resource';
        const authorText = res.author ? `by ${res.author}` : '';
        const descText = res.description || 'Reference item for MSA Ukkuda Dars curriculum.';
        const sizeText = res.fileSize ? `• ${res.fileSize}` : '';

        // Audio Player Embed snippet for Audio type
        let audioPlayerSnippet = '';
        if (res.type === 'audio' && res.url && res.url !== '#') {
            audioPlayerSnippet = `
                <div style="margin-bottom: 1rem; background: var(--bg); padding: 0.6rem; border-radius: 12px; border: 1px solid var(--border);">
                    <audio controls style="width: 100%; height: 36px;">
                        <source src="${res.url}" type="audio/mpeg">
                        Your browser does not support the audio player.
                    </audio>
                </div>
            `;
        }

        // Dual Action Buttons: Read Online vs Direct Download
        let buttonsHtml = '';
        if (res.type === 'pdf' || res.type === 'notes') {
            buttonsHtml = `
                <div style="display: flex; gap: 0.5rem; width: 100%;">
                    <button type="button" class="btn btn-main open-pdf-btn" style="flex: 1; justify-content: center; font-size: 0.8rem; font-weight: 600; padding: 0.6rem 0.5rem; border-radius: 10px; gap: 0.35rem; white-space: nowrap;">
                        👁️ Read PDF
                    </button>
                    <a href="${res.url || '#'}" target="_blank" download class="btn btn-outline download-pdf-btn" style="flex: 1; justify-content: center; font-size: 0.8rem; font-weight: 600; padding: 0.6rem 0.5rem; border-radius: 10px; text-decoration: none; gap: 0.35rem; white-space: nowrap;">
                        📥 Download
                    </a>
                </div>
            `;
        } else if (res.type === 'audio') {
            buttonsHtml = `
                <div style="display: flex; gap: 0.5rem; width: 100%;">
                    <a href="${res.url || '#'}" target="_blank" class="btn btn-main" style="flex: 1; justify-content: center; font-size: 0.8rem; font-weight: 600; padding: 0.6rem 0.5rem; border-radius: 10px; text-decoration: none; gap: 0.35rem; white-space: nowrap;">
                        🎧 Play Audio
                    </a>
                    <a href="${res.url || '#'}" target="_blank" download class="btn btn-outline" style="flex: 1; justify-content: center; font-size: 0.8rem; font-weight: 600; padding: 0.6rem 0.5rem; border-radius: 10px; text-decoration: none; gap: 0.35rem; white-space: nowrap;">
                        📥 Download
                    </a>
                </div>
            `;
        } else {
            buttonsHtml = `
                <a href="${res.url || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-main" style="width: 100%; justify-content: center; font-size: 0.82rem; font-weight: 600; padding: 0.6rem 1rem; border-radius: 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">
                    🔗 Open External Reference
                </a>
            `;
        }

        card.innerHTML = `
            <div>
                <!-- Top Row: Icon + Format Pill -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: ${typeBadgeBg}; display: flex; align-items: center; justify-content: center; font-size: 1.35rem;">
                        ${typeIcon}
                    </div>
                    <span style="background: ${typeBadgeBg}; color: ${typeBadgeColor}; font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.03em;">
                        ${formatLabel}
                    </span>
                </div>

                <!-- Subject Category Pill -->
                <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em;">
                    ${categoryText}
                </div>

                <!-- Resource Title -->
                <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.35rem; font-family: var(--font-display); color: var(--text-main); line-height: 1.3;">
                    ${res.title}
                </h3>

                <!-- Author & Meta -->
                ${authorText ? `<p style="color: var(--text-dim); font-size: 0.78rem; font-style: italic; margin-bottom: 0.75rem;">${authorText} ${sizeText}</p>` : ''}

                <!-- Description -->
                <p style="color: var(--text-dim); font-size: 0.83rem; line-height: 1.45; margin-bottom: 1.25rem;">
                    ${descText}
                </p>

                ${audioPlayerSnippet}
            </div>

            ${buttonsHtml}
        `;

        // Attach Read PDF Modal event handler
        const openPdfBtn = card.querySelector('.open-pdf-btn');
        if (openPdfBtn) {
            openPdfBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openPdfModal(res);
            });
        }

        libraryGrid.appendChild(card);
    });
}

// PDF Reader Modal Handler
const pdfModal = document.getElementById('pdfReaderModal');
const pdfViewerContainer = document.getElementById('pdfViewerContainer');
const pdfModalTitle = document.getElementById('pdfModalTitle');
const pdfModalMeta = document.getElementById('pdfModalMeta');
const pdfOpenNewTabBtn = document.getElementById('pdfOpenNewTabBtn');
const pdfDownloadDirectBtn = document.getElementById('pdfDownloadDirectBtn');
const closePdfModalBtn = document.getElementById('closePdfModalBtn');

function openPdfModal(res) {
    if (!pdfModal) {
        window.open(res.url, '_blank');
        return;
    }

    if (pdfModalTitle) pdfModalTitle.textContent = res.title;
    if (pdfModalMeta) pdfModalMeta.textContent = `${res.category || 'Kitab'} • ${res.author || 'Author'} • ${res.fileSize || 'PDF'}`;
    if (pdfOpenNewTabBtn) pdfOpenNewTabBtn.href = res.url;
    if (pdfDownloadDirectBtn) pdfDownloadDirectBtn.href = res.url;

    // Populate Viewer with Google Docs Viewer + Direct PDF fallback bar
    if (pdfViewerContainer) {
        const directUrl = res.url;
        const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(directUrl)}&embedded=true`;

        pdfViewerContainer.innerHTML = `
            <iframe id="pdfFrame" src="${googleDocsUrl}" style="width: 100%; height: 100%; border: none;"></iframe>
            <div id="pdfFallbackBar" style="padding: 0.75rem 1rem; background: var(--surface-raised); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 0.82rem; flex-wrap: wrap;">
                <span style="color: var(--text-dim);">If preview doesn't load in iframe:</span>
                <div style="display: flex; gap: 0.5rem;">
                    <a href="${directUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-main" style="padding: 0.35rem 0.85rem; font-size: 0.78rem; text-decoration: none;">Open PDF in Full Tab ↗️</a>
                    <a href="${directUrl}" target="_blank" download class="btn btn-outline" style="padding: 0.35rem 0.85rem; font-size: 0.78rem; text-decoration: none;">Download File 📥</a>
                </div>
            </div>
        `;
    }

    pdfModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePdfModal() {
    if (pdfModal) pdfModal.classList.add('hidden');
    if (pdfViewerContainer) pdfViewerContainer.innerHTML = '';
    document.body.style.overflow = '';
}

if (closePdfModalBtn) closePdfModalBtn.addEventListener('click', closePdfModal);
if (pdfModal) {
    pdfModal.addEventListener('click', (e) => {
        if (e.target === pdfModal) closePdfModal();
    });
}


// Search Input Event Listener
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderResources();
    });
}

// Clear Search Button Event Listener
const clearSearchBtn = document.getElementById('clearSearchBtn');
if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
            currentSearch = '';
            renderResources();
            searchInput.focus();
        }
    });
}

// Filter Button Event Listeners
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
            b.classList.remove('btn-main', 'active');
            b.classList.add('btn-ghost');
        });
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-main', 'active');
        
        currentFilter = btn.getAttribute('data-filter') || 'all';
        renderResources();
    });
});

