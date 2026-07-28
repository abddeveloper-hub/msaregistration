import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const libraryGrid = document.getElementById('libraryGrid');
const filterBtns = document.querySelectorAll('.filter-btn');
const searchInput = document.getElementById('librarySearchInput');
const resourceCountSpan = document.getElementById('visibleResourceCount');

// Pre-loaded curated fallback library items
const defaultLibraryItems = [
    {
        id: "def-1",
        title: "Fathul Mueen - Comprehensive Fiqh Notes",
        category: "Fiqh / Jurisprudence",
        type: "pdf",
        author: "Shaikh Zainuddin Makhdoom",
        description: "Standard jurisprudence reference and explanatory notes for advanced students.",
        url: "#",
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
        url: "#",
        fileSize: "6.2 MB",
        createdAt: "2026-06-25T10:00:00Z"
    },
    {
        id: "def-3",
        title: "Tajweed & Qira'at Recitation Masterclass",
        category: "Qira'at & Quran Audio",
        type: "audio",
        author: "Qari Faculty Team",
        description: "High-quality audio exercises for Makharij and Ahkam Al-Tajweed.",
        url: "#",
        fileSize: "18.5 MB",
        createdAt: "2026-06-20T10:00:00Z"
    },
    {
        id: "def-4",
        title: "Alfiyyah Ibn Malik - Nahw & Sarf Chart",
        category: "Arabic Grammar & Morphology",
        type: "notes",
        author: "Ibn Malik",
        description: "Quick revision charts covering poetic meters and grammatical rules.",
        url: "#",
        fileSize: "1.5 MB",
        createdAt: "2026-06-15T10:00:00Z"
    },
    {
        id: "def-5",
        title: "Sahih Al-Bukhari Hadith Commentary Guide",
        category: "Hadith Studies",
        type: "pdf",
        author: "Imam Al-Bukhari / Faculty Notes",
        description: "Selected Kitab Al-Eman HADITH narrations with sanad commentary.",
        url: "#",
        fileSize: "3.4 MB",
        createdAt: "2026-06-10T10:00:00Z"
    },
    {
        id: "def-6",
        title: "Digital Manuscripts & Research Portal",
        category: "Academic Archives",
        type: "link",
        author: "MSA Research Repository",
        description: "Online archive portal for historical dars manuscripts and manuscripts digitizations.",
        url: "#",
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

function renderResources() {
    if (!libraryGrid) return;
    
    libraryGrid.innerHTML = '';
    
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
        let actionLabel = 'View / Download PDF';

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
            </div>

            <!-- Download / Open Button -->
            <a href="${res.url || '#'}" target="_blank" class="btn btn-outline" style="width: 100%; justify-content: center; font-size: 0.82rem; font-weight: 600; padding: 0.6rem 1rem; border-radius: 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">
                ${actionLabel}
            </a>
        `;
        libraryGrid.appendChild(card);
    });
}

// Search Input Event Listener
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderResources();
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
