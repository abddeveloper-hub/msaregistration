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

        const defaultCategories = ['all', 'Academic', 'Sahityotsav'];
        const dynamicCategories = new Set(defaultCategories);
        allAchievements.forEach(item => {
            if (item.category) dynamicCategories.add(item.category);
        });

        const existingSelect = document.getElementById('achievementCampusFilter');
        // Remove existing category buttons only
        const oldBtns = filterContainer.querySelectorAll('.filter-btn');
        oldBtns.forEach(btn => btn.remove());

        // Insert new category buttons before select dropdown
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
            if (existingSelect) {
                filterContainer.insertBefore(btn, existingSelect);
            } else {
                filterContainer.appendChild(btn);
            }
        });
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
                        <div style="display:flex; gap:0.75rem; align-items:center;">
                            <a href="https://api.whatsapp.com/send?text=${encodeURIComponent('🏆 *' + (item.title || 'Student Achievement') + '*\n🥇 ' + (item.rank || '') + ' - ' + (item.studentName || '') + '\n\nRead more on MSA Ukkuda Portal: ' + window.location.href)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="color:#25D366; text-decoration:none; font-weight:700; font-size:0.75rem; display:inline-flex; align-items:center; gap:0.25rem;">
                                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                Share
                            </a>
                            <span style="color:var(--primary); text-decoration:underline;">Details →</span>
                        </div>
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
