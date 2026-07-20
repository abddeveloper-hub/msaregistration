import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, enableMultiTabIndexedDbPersistence, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence error:", err.code));

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
}

function formatAddedDate(rawDate) {
    if (!rawDate) return '';
    let dateObj;
    if (typeof rawDate === 'object' && rawDate.seconds) {
        dateObj = new Date(rawDate.seconds * 1000);
    } else {
        dateObj = new Date(rawDate);
    }
    if (isNaN(dateObj.getTime())) return String(rawDate);
    
    return dateObj.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const achievementsGrid = document.getElementById('achievementsGrid');
    const filterContainer = document.getElementById('achievementFilters');
    
    const lightboxModal = document.getElementById('achievementLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCategory = document.getElementById('lightboxCategory');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxRank = document.getElementById('lightboxRank');
    const lightboxStudent = document.getElementById('lightboxStudent');
    const lightboxCompetition = document.getElementById('lightboxCompetition');
    const lightboxDesc = document.getElementById('lightboxDesc');
    const lightboxDate = document.getElementById('lightboxDate');
    const closeLightboxBtn = document.getElementById('closeLightboxBtn');

    let allAchievements = [];
    let currentFilter = 'all';

    function renderFilterButtons() {
        if (!filterContainer) return;

        const defaultCategories = ['all', 'Quran & Qira\'at', 'Inter-Madrasa', 'Academic', 'Arts & Sports'];
        const dynamicCategories = new Set(defaultCategories);
        allAchievements.forEach(item => {
            if (item.category) dynamicCategories.add(item.category);
        });

        const activeCat = currentFilter;
        filterContainer.innerHTML = '';

        dynamicCategories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${activeCat.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`;
            btn.dataset.filter = cat;
            btn.textContent = cat === 'all' ? 'All Honors' : cat;
            btn.addEventListener('click', () => {
                currentFilter = cat;
                renderFilterButtons();
                renderAchievements();
            });
            filterContainer.appendChild(btn);
        });
    }

    function renderAchievements() {
        if (!achievementsGrid) return;
        achievementsGrid.innerHTML = '';

        const filtered = allAchievements.filter(item => {
            if (currentFilter === 'all') return true;
            return (item.category || '').toLowerCase() === currentFilter.toLowerCase();
        });

        if (filtered.length === 0) {
            achievementsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem 1rem; color: var(--text-dim);">
                    <div style="font-size:3rem; margin-bottom:1rem;">🏆</div>
                    <h3 style="font-size:1.2rem; color:var(--text-main); margin-bottom:0.5rem;">No Achievements Found</h3>
                    <p style="font-size:0.9rem;">There are no student honors listed under this category yet.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'achievement-card';
            
            const addedDate = formatAddedDate(item.date || item.createdAt);
            const imageSrc = item.url || item.image || item.photoUrl || 'assets/mdu-hero.png';
            const rankText = item.rank || 'Honorable Mention';
            let rankIcon = '🏆';
            if (rankText.includes('1') || rankText.toLowerCase().includes('first')) rankIcon = '🥇';
            else if (rankText.includes('2') || rankText.toLowerCase().includes('second')) rankIcon = '🥈';
            else if (rankText.includes('3') || rankText.toLowerCase().includes('third')) rankIcon = '🥉';

            card.innerHTML = `
                <div class="achievement-card-img-wrap">
                    <img src="${imageSrc}" alt="${item.title || 'Achievement Photo'}" loading="lazy">
                    <div class="rank-badge">${rankIcon} ${rankText}</div>
                </div>
                <div class="achievement-card-body">
                    <span class="achievement-meta-tag">${item.category || 'Honors'}</span>
                    <h3 class="achievement-title">${item.title || 'Student Achievement'}</h3>
                    ${item.studentName ? `<div class="achievement-student">👤 ${item.studentName}</div>` : ''}
                    ${item.competition ? `<div style="font-size:0.8rem; color:var(--text-dim); margin-bottom:0.6rem;">📍 ${item.competition}</div>` : ''}
                    ${item.description ? `<p class="achievement-desc">${item.description}</p>` : ''}
                    <div class="achievement-card-footer">
                        <span>📅 ${addedDate ? addedDate : 'Recently'}</span>
                        <span style="color:var(--primary); text-decoration:underline;">View Details →</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                openLightbox(item);
            });

            achievementsGrid.appendChild(card);
        });
    }

    function openLightbox(item) {
        if (!lightboxModal) return;

        lightboxImg.src = item.url || item.image || item.photoUrl || 'assets/mdu-hero.png';
        lightboxCategory.textContent = item.category || 'Honors';
        lightboxTitle.textContent = item.title || 'Student Achievement';
        
        const rankText = item.rank || 'Honorable Mention';
        let rankIcon = '🏆';
        if (rankText.includes('1') || rankText.toLowerCase().includes('first')) rankIcon = '🥇';
        else if (rankText.includes('2') || rankText.toLowerCase().includes('second')) rankIcon = '🥈';
        else if (rankText.includes('3') || rankText.toLowerCase().includes('third')) rankIcon = '🥉';
        lightboxRank.innerHTML = `${rankIcon} ${rankText}`;

        lightboxStudent.textContent = item.studentName ? `👤 Winner: ${item.studentName}` : '';
        lightboxCompetition.textContent = item.competition ? `📍 Event: ${item.competition}` : '';
        lightboxDesc.textContent = item.description || 'No detailed description provided.';
        lightboxDate.textContent = `📅 Event Date: ${formatAddedDate(item.date || item.createdAt) || 'N/A'}`;

        lightboxModal.classList.add('active');
    }

    if (closeLightboxBtn) {
        closeLightboxBtn.addEventListener('click', () => {
            lightboxModal.classList.remove('active');
        });
    }

    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) {
                lightboxModal.classList.remove('active');
            }
        });
    }

    // Firestore Listener
    onSnapshot(collection(db, "achievements"), (snapshot) => {
        allAchievements = [];
        snapshot.forEach(docSnap => {
            allAchievements.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        renderFilterButtons();
        renderAchievements();
    });
});
