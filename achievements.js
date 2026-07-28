import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
setTimeout(() => {
    enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence notice:", err.code));
}, 0);

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

// Curated default achievement items
const defaultAchievements = [
    {
        id: "ach-1",
        title: "All-Kerala Inter-Dars Qira'at Championship",
        category: "Quran & Qira'at",
        rank: "1st Rank 🥇",
        studentName: "Muhammad Safwan Al-Hafiz",
        competition: "State Qira'at Fest 2026",
        description: "Secured First Position in Mujawwad Quran Recitation category among 80+ participating Dars institutions.",
        image: "assets/mdu-hero.png",
        date: "2026-07-10T10:00:00Z"
    },
    {
        id: "ach-2",
        title: "Fiqh & Islamic Jurisprudence Research Essay",
        category: "Academic",
        rank: "1st Rank 🥇",
        studentName: "Ahmad Rayyan Al-Fazili",
        competition: "National Islamic Scholars Conclave",
        description: "Awarded top honor for research paper on classical Shafi'i Fiqh methodologies in contemporary contexts.",
        image: "assets/mdu-hero.png",
        date: "2026-06-18T10:00:00Z"
    },
    {
        id: "ach-3",
        title: "Sahityotsav Arabic Oratory & Debate",
        category: "Sahityotsav",
        rank: "2nd Rank 🥈",
        studentName: "Abdullah Ibn Humaid",
        competition: "Grand Sahityotsav Meet 2026",
        description: "Excellence in classical Arabic eloquent impromptu public speaking and debate.",
        image: "assets/mdu-hero.png",
        date: "2026-05-25T10:00:00Z"
    }
];

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
    let currentCampusFilter = 'all';

    const campusFilterSelect = document.getElementById('achievementCampusFilter');
    if (campusFilterSelect) {
        campusFilterSelect.addEventListener('change', (e) => {
            currentCampusFilter = e.target.value;
            renderAchievements();
        });
    }

    function renderFilterButtons() {
        if (!filterContainer) return;

        const defaultCategories = ['all', 'Quran & Qira\'at', 'Inter-Madrasa', 'Academic', 'Sahityotsav'];
        const dynamicCategories = new Set(defaultCategories);
        allAchievements.forEach(item => {
            if (item.category) dynamicCategories.add(item.category);
        });

        const existingSelect = document.getElementById('achievementCampusFilter');
        filterContainer.innerHTML = '';

        dynamicCategories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${currentFilter.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`;
            btn.dataset.filter = cat;
            btn.textContent = cat === 'all' ? 'All Honors' : cat;
            btn.addEventListener('click', () => {
                currentFilter = cat;
                renderFilterButtons();
                renderAchievements();
            });
            filterContainer.appendChild(btn);
        });

        if (existingSelect) {
            filterContainer.appendChild(existingSelect);
        }
    }

    function renderAchievements() {
        if (!achievementsGrid) return;
        achievementsGrid.innerHTML = '';

        const filtered = allAchievements.filter(item => {
            const matchesCat = currentFilter === 'all' || (item.category || '').toLowerCase() === currentFilter.toLowerCase();
            const matchesCampus = currentCampusFilter === 'all' || (item.campus || '').toLowerCase().includes(currentCampusFilter.toLowerCase());
            return matchesCat && matchesCampus;
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
    try {
        onSnapshot(collection(db, "achievements"), (snapshot) => {
            const fetched = [];
            snapshot.forEach(docSnap => {
                fetched.push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });

            if (fetched.length > 0) {
                allAchievements = fetched;
            } else {
                allAchievements = defaultAchievements;
            }

            renderFilterButtons();
            renderAchievements();
        }, (err) => {
            console.warn("Achievements load notice, using curated items:", err);
            allAchievements = defaultAchievements;
            renderFilterButtons();
            renderAchievements();
        });
    } catch(e) {
        allAchievements = defaultAchievements;
        renderFilterButtons();
        renderAchievements();
    }
});
